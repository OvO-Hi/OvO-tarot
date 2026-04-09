import { Pool } from 'pg'

const globalForPg = globalThis as unknown as { pgPool: Pool }

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool
}

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}
