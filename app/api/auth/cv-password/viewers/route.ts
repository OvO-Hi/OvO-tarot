import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'

/**
 * 특정 CV 비밀번호의 viewer 사용 프리뷰.
 *  GET /api/auth/cv-password/viewers?passwordId=N
 *  헤더: x-admin-password
 *
 * viewer_id 는 IP+UA 해시라서 익명. 마지막 6자만 표시용으로 잘라 반환.
 */

async function verifyAdmin(plaintext: string): Promise<boolean> {
  const rows = await query<{ value: string }>(
    'SELECT value FROM auth_config WHERE key = $1',
    ['admin_password_hash']
  )
  const hash = rows[0]?.value ?? ''
  if (!hash) return false
  return bcrypt.compare(plaintext, hash)
}

export async function GET(req: NextRequest) {
  try {
    const adminPassword = req.headers.get('x-admin-password') ?? ''
    if (!(await verifyAdmin(adminPassword))) {
      return NextResponse.json({ error: '관리자 인증 실패.' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const passwordId = Number(searchParams.get('passwordId'))
    if (!Number.isInteger(passwordId) || passwordId <= 0) {
      return NextResponse.json({ error: 'passwordId 가 올바르지 않습니다.' }, { status: 400 })
    }

    const rows = await query<{
      viewer_id: string
      usage_count: number
      last_used_at: string
      created_at: string
    }>(
      `SELECT viewer_id, usage_count, last_used_at, created_at
         FROM cv_viewer_usage
         WHERE password_id = $1
         ORDER BY last_used_at DESC
         LIMIT 50`,
      [passwordId]
    )

    const viewers = rows.map((r) => ({
      // viewer_id 자체는 어차피 해시 + IP/UA 정보 없는 무의미한 hex.
      // UI 에선 마지막 6자만 노출 (구분용).
      viewerIdShort: r.viewer_id.slice(-6),
      usageCount: Number(r.usage_count),
      lastUsedAt: r.last_used_at,
      firstSeenAt: r.created_at,
    }))

    return NextResponse.json({ viewers })
  } catch (error) {
    console.error('[/api/auth/cv-password/viewers] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
