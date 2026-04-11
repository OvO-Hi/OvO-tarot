import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const rows = await query<{ key: string; value: string }>(
      'SELECT key, value FROM auth_config WHERE key IN ($1, $2)',
      ['user_password', 'user_password_expires_at']
    )

    const config = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    const password = config['user_password'] ?? ''
    const expiresAt = Number(config['user_password_expires_at'] ?? '0')
    const now = Date.now()

    if (!password || now > expiresAt) {
      return NextResponse.json({ active: false })
    }

    const remainingMinutes = Math.ceil((expiresAt - now) / 60000)

    return NextResponse.json({
      active: true,
      password,
      expiresAt,
      remainingMinutes,
    })
  } catch (error) {
    console.error('[/api/auth/current-user-password] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
