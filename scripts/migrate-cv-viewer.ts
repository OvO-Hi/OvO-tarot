/**
 * CV 공개용 비밀번호 (다중) + viewer 사용량 트래킹 마이그레이션.
 *
 * 실행:
 *   npm run migrate:cv-viewer
 *
 * 또는 직접:
 *   DATABASE_URL=... npx ts-node --project tsconfig.seed.json scripts/migrate-cv-viewer.ts
 *
 * 멱등(idempotent) — 여러 번 실행해도 안전.
 *
 * 스키마:
 *   - cv_passwords        : 다중 CV 비번. 각각 라벨/암호문/만료일/한도/active.
 *   - cv_viewer_usage     : (password_id, viewer_id) 페어로 사용량 카운트.
 *
 * NOTE: 이전 단일키 스키마(auth_config 의 cv_password_hash 등)는 더 이상 사용하지 않습니다.
 *        기존 키는 그대로 두지만 verify 로직은 cv_passwords 테이블만 본다.
 */

import { Pool } from 'pg'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * .env.local 자체 파싱.  ts-node 로 직접 실행 시 next.js 의 .env.local
 * 자동 로딩이 동작하지 않아 DATABASE_URL 이 비어버리는 문제를 해결한다.
 * dotenv 패키지 의존 없이 가장 단순한 형태만 지원: KEY=VALUE, # 주석, 빈 줄.
 */
function loadDotenvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // surrounding quotes 처리
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}
loadDotenvLocal()

if (!process.env.DATABASE_URL) {
  console.error(
    '[migrate-cv-viewer] DATABASE_URL 이 설정되지 않았습니다.\n' +
      '  · .env.local 에 DATABASE_URL 이 있는지 확인하세요.\n' +
      '  · 또는 인라인으로: DATABASE_URL=... npm run migrate:cv-viewer'
  )
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function migrate() {
  const client = await pool.connect()
  try {
    console.log('[migrate-cv-viewer] start')

    // 1) cv_passwords — 다중 비번 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS cv_passwords (
        id                   SERIAL PRIMARY KEY,
        label                TEXT,
        password_encrypted   TEXT NOT NULL,
        password_iv          TEXT NOT NULL,
        password_tag         TEXT NOT NULL,
        password_lookup      TEXT NOT NULL,
        expires_at           BIGINT NOT NULL,
        max_uses_per_viewer  INTEGER NOT NULL DEFAULT 3,
        active               BOOLEAN NOT NULL DEFAULT TRUE,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    // password_lookup 은 평문 SHA256 — verify 매칭에 쓰임. unique 인덱스 (active 비번 중복 방지는 application 단에서)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cv_passwords_lookup
        ON cv_passwords (password_lookup)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cv_passwords_active_expires
        ON cv_passwords (active, expires_at DESC)
    `)
    console.log('  · ensured table cv_passwords (+ indexes)')

    // 2) cv_viewer_usage — (password_id, viewer_id) 페어 PK
    //    이전 단일키 버전이 있다면 안전하게 drop 후 재생성
    //    (운영중 데이터가 없을 때만 실행되도록 — 행이 있으면 보존하기 위해 try-catch)
    const oldShape = await client.query<{ has_password_id: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cv_viewer_usage' AND column_name = 'password_id'
      ) AS has_password_id
    `)
    const alreadyNew = oldShape.rows[0]?.has_password_id === true
    if (!alreadyNew) {
      // 기존 cv_viewer_usage (단일 viewer_id PK) 가 있다면 행 수 확인 후 drop
      const exists = await client.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'cv_viewer_usage'
        ) AS exists
      `)
      if (exists.rows[0]?.exists) {
        const cnt = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM cv_viewer_usage`
        )
        const n = Number(cnt.rows[0]?.count ?? 0)
        if (n === 0) {
          await client.query(`DROP TABLE cv_viewer_usage`)
          console.log('  · dropped legacy cv_viewer_usage (no rows)')
        } else {
          console.warn(
            `  · WARN: legacy cv_viewer_usage 에 ${n} 행이 있습니다. 자동 마이그레이션 생략 — 수동 처리 필요.`
          )
        }
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS cv_viewer_usage (
        password_id   INTEGER NOT NULL REFERENCES cv_passwords(id) ON DELETE CASCADE,
        viewer_id     TEXT NOT NULL,
        usage_count   INTEGER NOT NULL DEFAULT 0,
        last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (password_id, viewer_id)
      )
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cv_viewer_usage_last_used
        ON cv_viewer_usage (last_used_at DESC)
    `)
    console.log('  · ensured table cv_viewer_usage (password_id, viewer_id)')

    console.log('✦ [migrate-cv-viewer] done')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('[migrate-cv-viewer] error:', err)
  process.exit(1)
})
