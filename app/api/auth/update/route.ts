import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'

async function getAdminHash(): Promise<string> {
  const rows = await query<{ value: string }>(
    'SELECT value FROM auth_config WHERE key = $1',
    ['admin_password_hash']
  )
  return rows[0]?.value ?? ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { type: 'admin' | 'user'; [key: string]: unknown }

    if (body.type === 'admin') {
      const { currentAdminPassword, newPassword, confirmPassword } = body as {
        type: 'admin'
        currentAdminPassword: string
        newPassword: string
        confirmPassword: string
      }

      const adminHash = await getAdminHash()

      // 기존 비밀번호가 설정된 경우에만 검증
      if (adminHash && !await bcrypt.compare(currentAdminPassword, adminHash)) {
        return NextResponse.json({ error: '현재 비밀번호가 틀렸습니다.' }, { status: 401 })
      }

      if (newPassword !== confirmPassword) {
        return NextResponse.json({ error: '새 비밀번호가 일치하지 않습니다.' }, { status: 400 })
      }

      if (!newPassword || newPassword.length < 4) {
        return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 })
      }

      const hash = await bcrypt.hash(newPassword, 10)
      await query(
        'UPDATE auth_config SET value = $1 WHERE key = $2',
        [hash, 'admin_password_hash']
      )

      return NextResponse.json({ success: true })
    }

    if (body.type === 'user') {
      const { adminPassword, durationMinutes } = body as {
        type: 'user'
        adminPassword: string
        durationMinutes: number
      }

      const adminHash = await getAdminHash()
      if (!adminHash || !await bcrypt.compare(adminPassword, adminHash)) {
        return NextResponse.json({ error: '관리자 비밀번호가 틀렸습니다.' }, { status: 401 })
      }

      const duration = Math.min(Number(durationMinutes) || 30, 30)
      const newPassword = String(Math.floor(100000 + Math.random() * 900000))
      const expiresAt = Date.now() + duration * 60 * 1000

      await query(
        'UPDATE auth_config SET value = $1 WHERE key = $2',
        [newPassword, 'user_password']
      )
      await query(
        'UPDATE auth_config SET value = $1 WHERE key = $2',
        [String(expiresAt), 'user_password_expires_at']
      )
      await query(
        'UPDATE auth_config SET value = $1 WHERE key = $2',
        [String(duration), 'user_password_duration_minutes']
      )

      return NextResponse.json({
        password: newPassword,
        expiresAt,
        durationMinutes: duration,
      })
    }

    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  } catch (error) {
    console.error('[/api/auth/update] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
