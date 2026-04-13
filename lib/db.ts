import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await sql(text, params as unknown[])
  return result as T[]
}
