import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { DEFAULT_CV_MAX_USES } from '@/lib/cv-viewer'

/**
 * CV 공개용 비밀번호 / 만료일 / 1인당 사용 횟수 관리 API.
 * 모든 동작은 관리자 비번 검증을 통과해야 한다.
 *
 *  GET  : 현재 설정 상태 조회 (비번 자체는 절대 반환하지 않음)
 *         - active, expiresAt, expiresDate (YYYY-MM-DD), maxUsesPerViewer, totalViewers, totalUses
 *  POST : 비번 / 만료일 / 한도 변경
 *         body: { adminPassword, newCvPassword?, expiresDate?: 'YYYY-MM-DD', maxUsesPerViewer?: number, resetUsage?: boolean }
 */

async function getAdminHash(): Promise<string> {
  const rows = await query<{ value: string }>(
    'SELECT value FROM auth_config WHERE key = $1',
    ['admin_password_hash']
  )
  return rows[0]?.value ?? ''
}

async function getConfigMap(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {}
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM auth_config WHERE key IN (${placeholders})`,
    keys
  )
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

async function upsertConfig(key: string, value: string) {
  await query(
    `INSERT INTO auth_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  )
}

export async function GET() {
  try {
    const config = await getConfigMap([
      'cv_password_hash',
      'cv_password_expires_at',
      'cv_max_uses_per_viewer',
    ])
    const hash = config['cv_password_hash'] ?? ''
    const expiresAt = Number(config['cv_password_expires_at'] ?? '0')
    const maxUses = Number(config['cv_max_uses_per_viewer'] ?? DEFAULT_CV_MAX_USES)
    const now = Date.now()
    const active = !!hash && expiresAt > now

    // 통계: 총 viewer 수, 총 사용량
    const stats = await query<{ total_viewers: string; total_uses: string }>(
      `SELECT
         COUNT(*)::text AS total_viewers,
         COALESCE(SUM(usage_count), 0)::text AS total_uses
       FROM cv_viewer_usage`,
      []
    )
    const totalViewers = Number(stats[0]?.total_viewers ?? 0)
    const totalUses = Number(stats[0]?.total_uses ?? 0)

    return NextResponse.json({
      configured: !!hash,
      active,
      expiresAt: expiresAt || null,
      expiresDate: expiresAt ? toLocalDateString(expiresAt) : null,
      maxUsesPerViewer: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : DEFAULT_CV_MAX_USES,
      totalViewers,
      totalUses,
    })
  } catch (error) {
    console.error('[/api/auth/cv-password GET] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      adminPassword?: string
      newCvPassword?: string
      expiresDate?: string // 'YYYY-MM-DD'
      maxUsesPerViewer?: number
      resetUsage?: boolean
    }

    const adminHash = await getAdminHash()
    if (!adminHash || !(await bcrypt.compare(body.adminPassword ?? '', adminHash))) {
      return NextResponse.json({ error: '관리자 비밀번호가 틀렸습니다.' }, { status: 401 })
    }

    // 1) CV 비밀번호 변경 (선택)
    if (typeof body.newCvPassword === 'string' && body.newCvPassword.length > 0) {
      if (body.newCvPassword.length < 4) {
        return NextResponse.json(
          { error: 'CV 비밀번호는 4자 이상이어야 합니다.' },
          { status: 400 }
        )
      }
      const hash = await bcrypt.hash(body.newCvPassword, 10)
      await upsertConfig('cv_password_hash', hash)
    }

    // 2) 만료일 변경 (선택) — 'YYYY-MM-DD' → 그 날 23:59:59 (서버 로컬 타임존 기준)
    if (typeof body.expiresDate === 'string' && body.expiresDate.length > 0) {
      const ts = parseExpiresDate(body.expiresDate)
      if (ts === null) {
        return NextResponse.json(
          { error: '만료일 형식이 올바르지 않습니다 (예: 2026-06-30).' },
          { status: 400 }
        )
      }
      await upsertConfig('cv_password_expires_at', String(ts))
    }

    // 3) 1인당 한도 변경 (선택)
    if (typeof body.maxUsesPerViewer === 'number' && Number.isFinite(body.maxUsesPerViewer)) {
      if (body.maxUsesPerViewer < 1 || body.maxUsesPerViewer > 100) {
        return NextResponse.json(
          { error: '1인당 사용 횟수는 1~100 사이여야 합니다.' },
          { status: 400 }
        )
      }
      await upsertConfig('cv_max_uses_per_viewer', String(Math.floor(body.maxUsesPerViewer)))
    }

    // 4) 사용 이력 초기화 (선택)
    if (body.resetUsage) {
      await query('DELETE FROM cv_viewer_usage', [])
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[/api/auth/cv-password POST] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/** 'YYYY-MM-DD' → 그 날 23:59:59.999 (서버 로컬 타임존) 의 epoch ms */
function parseExpiresDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [, yStr, moStr, dStr] = m
  const y = Number(yStr)
  const mo = Number(moStr)
  const d = Number(dStr)
  if (!y || !mo || !d) return null
  const dt = new Date(y, mo - 1, d, 23, 59, 59, 999)
  if (isNaN(dt.getTime())) return null
  // 과거 날짜 방지
  if (dt.getTime() < Date.now() - 60_000) return null
  return dt.getTime()
}

function toLocalDateString(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
