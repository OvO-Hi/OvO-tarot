/**
 * CV 공개용 비밀번호 + viewer 사용량 트래킹용 마이그레이션.
 *
 * 실행:
 *   npx tsx scripts/migrate-cv-viewer.ts
 *   또는
 *   npm run migrate:cv-viewer   (package.json scripts 추가 필요)
 *
 * 멱등(idempotent) — 여러 번 실행해도 안전.
 */

import 'dotenv/config'
import { query } from '@/lib/db'

async function main() {
  console.log('[migrate-cv-viewer] start')

  // 1) auth_config 테이블에 cv_* 키 보장
  //    (auth_config 테이블 자체는 기존 migrate-auth.ts 에서 생성됨)
  const cvConfigKeys: Array<{ key: string; defaultValue: string }> = [
    { key: 'cv_password_hash', defaultValue: '' },
    { key: 'cv_password_expires_at', defaultValue: '0' },
    { key: 'cv_max_uses_per_viewer', defaultValue: '3' },
  ]

  for (const { key, defaultValue } of cvConfigKeys) {
    await query(
      `INSERT INTO auth_config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, defaultValue]
    )
    console.log(`  · ensured auth_config.${key}`)
  }

  // 2) cv_viewer_usage 테이블 생성
  await query(
    `CREATE TABLE IF NOT EXISTS cv_viewer_usage (
       viewer_id    TEXT PRIMARY KEY,
       usage_count  INTEGER NOT NULL DEFAULT 0,
       last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    []
  )
  console.log('  · ensured table cv_viewer_usage')

  // 3) viewer_id 인덱스 (PK 라 자동 생성되지만 명시적으로 last_used_at 인덱스도)
  await query(
    `CREATE INDEX IF NOT EXISTS idx_cv_viewer_usage_last_used
       ON cv_viewer_usage (last_used_at DESC)`,
    []
  )
  console.log('  · ensured index idx_cv_viewer_usage_last_used')

  console.log('[migrate-cv-viewer] done')
  process.exit(0)
}

main().catch((err) => {
  console.error('[migrate-cv-viewer] error:', err)
  process.exit(1)
})
