import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await sql.query(text, params ?? [])
  return result as unknown as T[]
}
