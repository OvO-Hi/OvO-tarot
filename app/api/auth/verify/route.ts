import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { lookupHash } from '@/lib/cv-crypto'
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
         WHERE key IN ($1, $2, $3)`,
      ['admin_password_hash', 'user_password', 'user_password_expires_at']
    )
    const config = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    // 1) 관리자 검증
    const adminHash = config['admin_password_hash']
    if (adminHash && (await bcrypt.compare(password, adminHash))) {
      const res = NextResponse.json({ role: 'admin' })
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

    // 3) CV 공개용 비밀번호 — lookup 해시 매칭 + 만료/active 체크
    const lookup = lookupHash(password)
    const cvRows = await query<{
      id: number
      password_lookup: string
      expires_at: string
      max_uses_per_viewer: number
      active: boolean
    }>(
      `SELECT id, password_lookup, expires_at, max_uses_per_viewer, active
         FROM cv_passwords WHERE password_lookup = $1
         LIMIT 1`,
      [lookup]
    )
    const cv = cvRows[0]
    if (cv) {
      const expiresAt = Number(cv.expires_at)
      if (!cv.active) {
        return NextResponse.json({
          role: null,
          error: '이 비밀번호는 비활성화되었습니다.',
        })
      }
      if (!expiresAt || Date.now() > expiresAt) {
        return NextResponse.json({
          role: null,
          error: 'CV 공개용 비밀번호가 만료되었습니다.',
        })
      }

      const { viewerId, cookieAssigned, freshCookieValue } = resolveCvViewerId(req)
      const usage = await getCvViewerUsage(cv.id, viewerId, cv.max_uses_per_viewer)

      const res = NextResponse.json({
        role: 'cv_viewer',
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
        },
        expiresAt,
      })
      if (cookieAssigned && freshCookieValue) {
        attachCvViewerCookie(res, freshCookieValue)
      }
      attachCvAuthCookie(res, deriveCvAuthToken(cv.id, cv.password_lookup))
      return res
    }

    return NextResponse.json({ role: null, error: '비밀번호가 틀렸습니다.' })
  } catch (error) {
    console.error('[/api/auth/verify] error:', error)
    return NextResponse.json({ role: null, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
