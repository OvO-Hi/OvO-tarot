import { Pool } from 'pg'
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    await client.query(`
      INSERT INTO auth_config (key, value) VALUES
        ('admin_password_hash', ''),
        ('user_password', ''),
        ('user_password_expires_at', '0'),
        ('user_password_duration_minutes', '30')
      ON CONFLICT (key) DO NOTHING
    `)

    console.log('✦ auth_config 테이블 생성 및 초기값 삽입 완료')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('Migration 실패:', err)
  process.exit(1)
})
