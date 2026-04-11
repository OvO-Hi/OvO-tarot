import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json() as { password: string }

    if (!password) {
      return NextResponse.json({ role: null, error: '비밀번호를 입력해주세요.' }, { status: 400 })
    }

    const rows = await query<{ key: string; value: string }>(
      'SELECT key, value FROM auth_config WHERE key IN ($1, $2, $3)',
      ['admin_password_hash', 'user_password', 'user_password_expires_at']
    )

    const config = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    // 관리자 검증
    const adminHash = config['admin_password_hash']
    if (adminHash && await bcrypt.compare(password, adminHash)) {
      return NextResponse.json({ role: 'admin' })
    }

    // 일반 사용자 검증
    const userPassword = config['user_password']
    const expiresAt = Number(config['user_password_expires_at'] ?? '0')

    if (userPassword && password === userPassword) {
      if (Date.now() > expiresAt) {
        return NextResponse.json({ role: null, error: '만료된 비밀번호입니다.' })
      }
      return NextResponse.json({ role: 'user' })
    }

    return NextResponse.json({ role: null, error: '비밀번호가 틀렸습니다.' })
  } catch (error) {
    console.error('[/api/auth/verify] error:', error)
    return NextResponse.json({ role: null, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
