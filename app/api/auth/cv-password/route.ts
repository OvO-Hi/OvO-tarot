import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import {
  decryptCvPassword,
  encryptCvPassword,
  lookupHash,
} from '@/lib/cv-crypto'
import { DEFAULT_CV_MAX_USES } from '@/lib/cv-viewer'

/**
 * 다중 CV 비밀번호 관리 API.
 *
 *  GET    : 비밀번호 목록 조회 (admin 인증 필요 → header `x-admin-password`)
 *           각 row 에 평문(복호화) 까지 포함됨. viewer 사용 통계 함께 반환.
 *  POST   : 새 비밀번호 추가             body { adminPassword, password, label?, expiresDate, maxUsesPerViewer? }
 *  PATCH  : 기존 비밀번호 일부 변경       body { adminPassword, id, label?, expiresDate?, maxUsesPerViewer?, active?, newPassword?, resetUsage? }
 *  DELETE : 완전 삭제(viewer 이력 cascade) body { adminPassword, id }
 */

async function getAdminHash(): Promise<string> {
  const rows = await query<{ value: string }>(
    'SELECT value FROM auth_config WHERE key = $1',
    ['admin_password_hash']
  )
  return rows[0]?.value ?? ''
}

async function verifyAdmin(plaintext: string): Promise<boolean> {
  const hash = await getAdminHash()
  if (!hash) return false
  return bcrypt.compare(plaintext, hash)
}

/* ─────────────────────────────  공통: 만료일 파서  ───────────────────────────── */
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

/* ──────────────────────────────  GET (목록)  ────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    // admin 인증 — header 에 x-admin-password
    const adminPassword = req.headers.get('x-admin-password') ?? ''
    if (!(await verifyAdmin(adminPassword))) {
      return NextResponse.json({ error: '관리자 인증 실패.' }, { status: 401 })
    }

    const rows = await query<{
      id: number
      label: string | null
      password_encrypted: string
      password_iv: string
      password_tag: string
      expires_at: string
      max_uses_per_viewer: number
      active: boolean
      created_at: string
    }>(
      `SELECT id, label, password_encrypted, password_iv, password_tag,
              expires_at, max_uses_per_viewer, active, created_at
         FROM cv_passwords
         ORDER BY active DESC, expires_at DESC, id DESC`,
      []
    )

    // viewer 통계 — password_id 별로 집계
    const stats = await query<{
      password_id: number
      total_viewers: string
      total_uses: string
      max_used: string
    }>(
      `SELECT password_id,
              COUNT(*)::text                    AS total_viewers,
              COALESCE(SUM(usage_count), 0)::text AS total_uses,
              COALESCE(MAX(usage_count), 0)::text AS max_used
         FROM cv_viewer_usage
         GROUP BY password_id`,
      []
    )
    const statsByPwId = new Map(
      stats.map((s) => [
        Number(s.password_id),
        {
          totalViewers: Number(s.total_viewers),
          totalUses: Number(s.total_uses),
          maxUsedByOne: Number(s.max_used),
        },
      ])
    )

    const items = rows.map((row) => {
      let plaintext: string | null = null
      try {
        plaintext = decryptCvPassword({
          encrypted: row.password_encrypted,
          iv: row.password_iv,
          tag: row.password_tag,
        })
      } catch (e) {
        console.error('[cv-password GET] decrypt 실패 (id=', row.id, '):', e)
      }
      const expiresAt = Number(row.expires_at)
      const now = Date.now()
      const stat = statsByPwId.get(row.id) ?? {
        totalViewers: 0,
        totalUses: 0,
        maxUsedByOne: 0,
      }
      return {
        id: row.id,
        label: row.label ?? '',
        password: plaintext,
        active: row.active,
        expiresAt,
        expiresDate: toLocalDateString(expiresAt),
        expired: !expiresAt || now > expiresAt,
        maxUsesPerViewer: row.max_uses_per_viewer,
        createdAt: row.created_at,
        ...stat,
      }
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[/api/auth/cv-password GET] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/* ──────────────────────────────  POST (추가)  ────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      adminPassword?: string
      password?: string
      label?: string
      expiresDate?: string
      maxUsesPerViewer?: number
    }

    if (!(await verifyAdmin(body.adminPassword ?? ''))) {
      return NextResponse.json({ error: '관리자 비밀번호가 틀렸습니다.' }, { status: 401 })
    }

    if (!body.password || body.password.length < 1) {
      return NextResponse.json(
        { error: 'CV 비밀번호를 입력해 주세요.' },
        { status: 400 }
      )
    }
    const expiresAt = body.expiresDate ? parseExpiresDate(body.expiresDate) : null
    if (!expiresAt) {
      return NextResponse.json(
        { error: '만료일을 올바르게 입력해 주세요 (예: 2026-06-30).' },
        { status: 400 }
      )
    }
    let maxUses = DEFAULT_CV_MAX_USES
    if (typeof body.maxUsesPerViewer === 'number' && Number.isFinite(body.maxUsesPerViewer)) {
      if (body.maxUsesPerViewer < 1 || body.maxUsesPerViewer > 100) {
        return NextResponse.json(
          { error: '1인당 사용 횟수는 1~100 사이여야 합니다.' },
          { status: 400 }
        )
      }
      maxUses = Math.floor(body.maxUsesPerViewer)
    }

    const lookup = lookupHash(body.password)

    // 중복 비번 검사 — 같은 평문이면 동일 lookup
    const dup = await query<{ id: number }>(
      `SELECT id FROM cv_passwords WHERE password_lookup = $1 LIMIT 1`,
      [lookup]
    )
    if (dup[0]) {
      return NextResponse.json(
        { error: '동일한 비밀번호가 이미 등록되어 있습니다.' },
        { status: 409 }
      )
    }

    const enc = encryptCvPassword(body.password)
    const inserted = await query<{ id: number }>(
      `INSERT INTO cv_passwords
         (label, password_encrypted, password_iv, password_tag, password_lookup,
          expires_at, max_uses_per_viewer, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id`,
      [
        body.label ?? null,
        enc.encrypted,
        enc.iv,
        enc.tag,
        lookup,
        String(expiresAt),
        maxUses,
      ]
    )
    return NextResponse.json({ success: true, id: inserted[0]?.id })
  } catch (error) {
    console.error('[/api/auth/cv-password POST] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/* ──────────────────────────────  PATCH (수정)  ────────────────────────────── */

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      adminPassword?: string
      id?: number
      label?: string
      expiresDate?: string
      maxUsesPerViewer?: number
      active?: boolean
      newPassword?: string
      resetUsage?: boolean
    }

    if (!(await verifyAdmin(body.adminPassword ?? ''))) {
      return NextResponse.json({ error: '관리자 비밀번호가 틀렸습니다.' }, { status: 401 })
    }
    if (!body.id || !Number.isInteger(body.id)) {
      return NextResponse.json({ error: 'id 가 올바르지 않습니다.' }, { status: 400 })
    }

    const updates: string[] = []
    const values: unknown[] = []
    let i = 1

    if (typeof body.label === 'string') {
      updates.push(`label = $${i++}`)
      values.push(body.label || null)
    }
    if (typeof body.active === 'boolean') {
      updates.push(`active = $${i++}`)
      values.push(body.active)
    }
    if (typeof body.expiresDate === 'string' && body.expiresDate.length > 0) {
      const ts = parseExpiresDate(body.expiresDate)
      if (!ts) {
        return NextResponse.json(
          { error: '만료일 형식이 올바르지 않습니다.' },
          { status: 400 }
        )
      }
      updates.push(`expires_at = $${i++}`)
      values.push(String(ts))
    }
    if (typeof body.maxUsesPerViewer === 'number' && Number.isFinite(body.maxUsesPerViewer)) {
      if (body.maxUsesPerViewer < 1 || body.maxUsesPerViewer > 100) {
        return NextResponse.json(
          { error: '1인당 사용 횟수는 1~100 사이여야 합니다.' },
          { status: 400 }
        )
      }
      updates.push(`max_uses_per_viewer = $${i++}`)
      values.push(Math.floor(body.maxUsesPerViewer))
    }
    if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
      // 길이 강제는 두지 않음 — 만료일 + 1인당 한도가 더 강력한 보호.
      // (단 빈 문자열은 위에서 length > 0 으로 걸러짐)
      const lookup = lookupHash(body.newPassword)
      // 다른 row 와 중복인지 확인
      const dup = await query<{ id: number }>(
        `SELECT id FROM cv_passwords WHERE password_lookup = $1 AND id <> $2 LIMIT 1`,
        [lookup, body.id]
      )
      if (dup[0]) {
        return NextResponse.json(
          { error: '동일한 비밀번호가 다른 항목에 이미 등록되어 있습니다.' },
          { status: 409 }
        )
      }
      const enc = encryptCvPassword(body.newPassword)
      updates.push(`password_encrypted = $${i++}`)
      values.push(enc.encrypted)
      updates.push(`password_iv = $${i++}`)
      values.push(enc.iv)
      updates.push(`password_tag = $${i++}`)
      values.push(enc.tag)
      updates.push(`password_lookup = $${i++}`)
      values.push(lookup)
    }

    if (updates.length === 0 && !body.resetUsage) {
      return NextResponse.json({ error: '변경 항목이 없습니다.' }, { status: 400 })
    }

    if (updates.length > 0) {
      values.push(body.id)
      await query(
        `UPDATE cv_passwords SET ${updates.join(', ')} WHERE id = $${i}`,
        values
      )
    }

    if (body.resetUsage) {
      await query(`DELETE FROM cv_viewer_usage WHERE password_id = $1`, [body.id])
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[/api/auth/cv-password PATCH] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/* ──────────────────────────────  DELETE (삭제)  ────────────────────────────── */

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { adminPassword?: string; id?: number }
    if (!(await verifyAdmin(body.adminPassword ?? ''))) {
      return NextResponse.json({ error: '관리자 비밀번호가 틀렸습니다.' }, { status: 401 })
    }
    if (!body.id || !Number.isInteger(body.id)) {
      return NextResponse.json({ error: 'id 가 올바르지 않습니다.' }, { status: 400 })
    }
    // ON DELETE CASCADE 로 cv_viewer_usage 행도 함께 삭제됨
    await query(`DELETE FROM cv_passwords WHERE id = $1`, [body.id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[/api/auth/cv-password DELETE] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
