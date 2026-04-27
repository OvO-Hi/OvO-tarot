import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

/**
 * 다중 CV 비밀번호 환경에서 viewer 식별 + 사용량 트래킹.
 *
 * - viewer_id : (IP + User-Agent + 쿠키) 조합. 같은 사람이 여러 비번을 쓰면
 *   비번별로 카운트가 따로 잡힌다 (cv_viewer_usage PK = password_id + viewer_id).
 * - cv_auth   : "이 요청은 활성 cv_viewer 세션이다" 를 증명하는 쿠키.
 *               값 형식: `<password_id>.<lookup_token>`
 *               lookup_token = password_lookup(=SHA256 of plaintext) 의 prefix 16자.
 *               비번이 비활성화/삭제되면 매칭 실패 → 자동 로그아웃 효과.
 */

export const CV_VIEWER_COOKIE = 'cv_viewer_id'
export const CV_AUTH_COOKIE = 'cv_auth'
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90 // 90일

export const DEFAULT_CV_MAX_USES = 3

export type CvViewerUsage = {
  passwordId: number
  viewerId: string
  used: number
  limit: number
  remaining: number
}

/* ─────────────────────────────────  viewer_id  ───────────────────────────────── */

export function resolveCvViewerId(req: NextRequest): {
  viewerId: string
  cookieAssigned: boolean
  freshCookieValue: string | null
} {
  const existing = req.cookies.get(CV_VIEWER_COOKIE)?.value
  if (existing && /^[a-f0-9]{32,64}$/i.test(existing)) {
    return { viewerId: existing, cookieAssigned: false, freshCookieValue: null }
  }
  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent') ?? ''
  const fallback = createHash('sha256').update(`${ip}::${ua}`).digest('hex').slice(0, 48)
  const fresh = randomBytes(24).toString('hex')
  return { viewerId: fallback, cookieAssigned: true, freshCookieValue: fresh }
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

export function attachCvViewerCookie(res: NextResponse, value: string) {
  res.cookies.set({
    name: CV_VIEWER_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
  })
}

/* ─────────────────────────────────  cv_auth  ───────────────────────────────── */

export function deriveCvAuthToken(passwordId: number, passwordLookup: string): string {
  return `${passwordId}.${passwordLookup.slice(0, 16)}`
}

export function attachCvAuthCookie(res: NextResponse, token: string) {
  res.cookies.set({
    name: CV_AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
  })
}

export function clearCvAuthCookie(res: NextResponse) {
  res.cookies.set({
    name: CV_AUTH_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

function parseCvAuth(token: string): { passwordId: number; lookupPrefix: string } | null {
  const m = /^(\d+)\.([a-f0-9]{16})$/i.exec(token)
  if (!m) return null
  const id = Number(m[1])
  if (!Number.isInteger(id) || id <= 0) return null
  return { passwordId: id, lookupPrefix: m[2]!.toLowerCase() }
}

/**
 * 요청이 활성 cv_viewer 세션인지 확인.
 *  - cv_auth 쿠키 파싱 → password_id 추출
 *  - cv_passwords 에서 해당 row 조회 → active && 미만료 && lookup prefix 일치
 */
export async function getActiveCvViewerSession(
  req: NextRequest
): Promise<{ passwordId: number; viewerId: string; maxUsesPerViewer: number } | null> {
  const cvAuth = req.cookies.get(CV_AUTH_COOKIE)?.value
  if (!cvAuth) return null
  const parsed = parseCvAuth(cvAuth)
  if (!parsed) return null

  const rows = await query<{
    id: number
    password_lookup: string
    expires_at: string
    max_uses_per_viewer: number
    active: boolean
  }>(
    `SELECT id, password_lookup, expires_at, max_uses_per_viewer, active
       FROM cv_passwords WHERE id = $1`,
    [parsed.passwordId]
  )
  const row = rows[0]
  if (!row) return null
  if (!row.active) return null
  const expiresAt = Number(row.expires_at)
  if (!expiresAt || Date.now() > expiresAt) return null
  if (row.password_lookup.slice(0, 16).toLowerCase() !== parsed.lookupPrefix) return null

  const { viewerId } = resolveCvViewerId(req)
  return {
    passwordId: row.id,
    viewerId,
    maxUsesPerViewer: row.max_uses_per_viewer,
  }
}

/* ─────────────────────────  사용량 조회 / 증가  ───────────────────────── */

export async function getCvViewerUsage(
  passwordId: number,
  viewerId: string,
  limit: number
): Promise<CvViewerUsage> {
  const rows = await query<{ usage_count: number }>(
    `SELECT usage_count FROM cv_viewer_usage WHERE password_id = $1 AND viewer_id = $2`,
    [passwordId, viewerId]
  )
  const used = Number(rows[0]?.usage_count ?? 0)
  return {
    passwordId,
    viewerId,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  }
}

export async function incrementCvViewerUsage(
  passwordId: number,
  viewerId: string,
  limit: number
): Promise<{ ok: true; usage: CvViewerUsage } | { ok: false; usage: CvViewerUsage }> {
  const rows = await query<{ usage_count: number }>(
    `INSERT INTO cv_viewer_usage (password_id, viewer_id, usage_count, last_used_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (password_id, viewer_id)
       DO UPDATE SET usage_count = cv_viewer_usage.usage_count + 1,
                     last_used_at = NOW()
       RETURNING usage_count`,
    [passwordId, viewerId]
  )
  const used = Number(rows[0]?.usage_count ?? 0)
  const usage: CvViewerUsage = {
    passwordId,
    viewerId,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  }
  return used > limit ? { ok: false, usage } : { ok: true, usage }
}
