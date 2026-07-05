import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const CV_VIEWER_COOKIE = 'cv_viewer_id'
export const CV_AUTH_COOKIE = 'cv_auth'
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90 // 90일

export const DEFAULT_CV_MAX_USES = 3

/**
 * cv_auth 쿠키에 들어갈 토큰을 만든다 — cv_password_hash 의 prefix 16자.
 * 비번이 바뀌면 토큰이 자동 무효화되는 효과.
 */
export function deriveCvAuthToken(cvPasswordHash: string): string {
  return cvPasswordHash.slice(0, 16)
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

/**
 * 요청이 활성 cv_viewer 세션인지 확인한다.
 * 조건: cv_auth 쿠키가 현재 cv_password_hash 의 prefix 와 일치 +
 *       cv_password_expires_at 이 미래.
 *
 * 일치하면 viewer_id 도 함께 반환.
 */
export async function getActiveCvViewerSession(
  req: NextRequest
): Promise<{ viewerId: string } | null> {
  const cvAuth = req.cookies.get(CV_AUTH_COOKIE)?.value
  if (!cvAuth) return null

  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM auth_config WHERE key IN ($1, $2)`,
    ['cv_password_hash', 'cv_password_expires_at']
  )
  const config = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const cvHash = config['cv_password_hash'] ?? ''
  const expiresAt = Number(config['cv_password_expires_at'] ?? '0')
  if (!cvHash || !expiresAt || Date.now() > expiresAt) return null
  if (deriveCvAuthToken(cvHash) !== cvAuth) return null

  const { viewerId } = resolveCvViewerId(req)
  return { viewerId }
}

export type CvViewerUsage = {
  viewerId: string
  used: number
  limit: number
  remaining: number
}

/**
 * 요청에서 viewer_id 를 안정적으로 도출한다.
 *
 * 1순위: 쿠키(`cv_viewer_id`)에 저장된 랜덤 ID — 같은 브라우저면 그대로 유지
 * 2순위: IP + User-Agent 를 SHA256 해싱한 fallback ID
 *        (쿠키가 차단된 환경에서도 같은 기기/네트워크면 동일 ID 가 나오도록)
 *
 * 결과는 nullable 하지 않다. 단 cookieAssigned 가 true 인 경우, 호출자가
 * 응답 쿠키를 세팅해 줘야 한다.
 */
export function resolveCvViewerId(req: NextRequest): {
  viewerId: string
  cookieAssigned: boolean
  freshCookieValue: string | null
} {
  const existing = req.cookies.get(CV_VIEWER_COOKIE)?.value
  if (existing && /^[a-f0-9]{32,64}$/i.test(existing)) {
    return { viewerId: existing, cookieAssigned: false, freshCookieValue: null }
  }

  // fallback id (IP + UA 해시) — 쿠키가 발급되더라도 첫 요청에서는
  // 아직 응답 쿠키가 클라이언트에 도달 전이므로 이 fallback id로 카운트한다.
  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent') ?? ''
  const fallback = createHash('sha256').update(`${ip}::${ua}`).digest('hex').slice(0, 48)

  const fresh = randomBytes(24).toString('hex') // 48 chars
  // 쿠키에는 새 ID 를 발급하되, 이번 요청의 viewerId 는 fallback 으로 처리.
  // 다음 요청부터는 쿠키 ID 가 우선이 된다 → 같은 브라우저는 안정적으로 통합.
  // (단, fallback 이 처음에 한 번 카운트에 잡혀도 같은 viewer 의 작업이라 큰 문제 X)
  // 더 안정적인 동작을 원하면 fallback id 를 쿠키에도 그대로 사용한다.
  return { viewerId: fallback, cookieAssigned: true, freshCookieValue: fresh }
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

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

/** auth_config 에서 cv_max_uses_per_viewer 값을 읽는다 (없으면 기본 3) */
export async function getCvMaxUses(): Promise<number> {
  const rows = await query<{ value: string }>(
    'SELECT value FROM auth_config WHERE key = $1',
    ['cv_max_uses_per_viewer']
  )
  const v = Number(rows[0]?.value)
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_CV_MAX_USES
}

/** 현재 viewer 의 사용량 조회 (없으면 0) */
export async function getCvViewerUsage(viewerId: string): Promise<CvViewerUsage> {
  const limit = await getCvMaxUses()
  const rows = await query<{ usage_count: number }>(
    'SELECT usage_count FROM cv_viewer_usage WHERE viewer_id = $1',
    [viewerId]
  )
  const used = Number(rows[0]?.usage_count ?? 0)
  return {
    viewerId,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  }
}

/**
 * 카운트 +1.  PostgreSQL UPSERT 로 race-safe 하게 처리한다.
 * 한도 초과 시 throw 하지 않고 { ok:false } 를 반환 — 호출자가 분기.
 */
export async function incrementCvViewerUsage(
  viewerId: string
): Promise<{ ok: true; usage: CvViewerUsage } | { ok: false; usage: CvViewerUsage }> {
  const limit = await getCvMaxUses()

  // 현재 카운트 락 + 증가 (단일 트랜잭션처럼 동작)
  const rows = await query<{ usage_count: number }>(
    `INSERT INTO cv_viewer_usage (viewer_id, usage_count, last_used_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (viewer_id)
     DO UPDATE SET usage_count = cv_viewer_usage.usage_count + 1, last_used_at = NOW()
     RETURNING usage_count`,
    [viewerId]
  )
  const used = Number(rows[0]?.usage_count ?? 0)
  const usage: CvViewerUsage = {
    viewerId,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  }

  if (used > limit) {
    // 한도 초과 — 카운트는 이미 올렸지만 호출자가 거부 응답을 내야 함.
    // (다음 시도부터도 계속 over-limit 으로 잡힘)
    return { ok: false, usage }
  }
  return { ok: true, usage }
}
