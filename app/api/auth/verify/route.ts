import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import {
  attachCvAuthCookie,
  attachCvViewerCookie,
  clearCvAuthCookie,
  deriveCvAuthToken,
  getCvViewerUsage,
  resolveCvViewerId,
} from '@/lib/cv-viewer'

export async function POST(req: NextRequest) {
  try {
    const { password } = (await req.json()) as { password: string }

    if (!password) {
      return NextResponse.json({ role: null, error: '비밀번호를 입력해주세요.' }, { status: 400 })
    }

    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM auth_config
       WHERE key IN ($1, $2, $3, $4, $5)`,
      [
        'admin_password_hash',
        'user_password',
        'user_password_expires_at',
        'cv_password_hash',
        'cv_password_expires_at',
      ]
    )

    const config = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    // 1) 관리자 검증
    const adminHash = config['admin_password_hash']
    if (adminHash && (await bcrypt.compare(password, adminHash))) {
      const res = NextResponse.json({ role: 'admin' })
      // 이전 cv_viewer 세션 흔적 제거 — admin 으로 들어왔으면 카운트 차감 대상이 아님.
      clearCvAuthCookie(res)
      return res
    }

    // 2) 일반 사용자 (관리자 발급 일회용 번호)
    const userPassword = config['user_password']
    const userExpiresAt = Number(config['user_password_expires_at'] ?? '0')
    if (userPassword && password === userPassword) {
      if (Date.now() > userExpiresAt) {
        return NextResponse.json({ role: null, error: '만료된 비밀번호입니다.' })
      }
      const res = NextResponse.json({ role: 'user' })
      clearCvAuthCookie(res)
      return res
    }

    // 3) CV 공개용 비밀번호 — bcrypt 검증 + 만료일 체크 + viewer/auth 쿠키 발급
    const cvHash = config['cv_password_hash']
    const cvExpiresAt = Number(config['cv_password_expires_at'] ?? '0')
    if (cvHash && (await bcrypt.compare(password, cvHash))) {
      if (!cvExpiresAt || Date.now() > cvExpiresAt) {
        return NextResponse.json({
          role: null,
          error: 'CV 공개용 비밀번호가 만료되었습니다.',
        })
      }

      const { viewerId, cookieAssigned, freshCookieValue } = resolveCvViewerId(req)
      const usage = await getCvViewerUsage(viewerId)

      const res = NextResponse.json({
        role: 'cv_viewer',
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
        },
        expiresAt: cvExpiresAt,
      })
      if (cookieAssigned && freshCookieValue) {
        attachCvViewerCookie(res, freshCookieValue)
      }
      attachCvAuthCookie(res, deriveCvAuthToken(cvHash))
      return res
    }

    return NextResponse.json({ role: null, error: '비밀번호가 틀렸습니다.' })
  } catch (error) {
    console.error('[/api/auth/verify] error:', error)
    return NextResponse.json({ role: null, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
