import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@shared/schema';

const pool = new pg.Pool({
  connectionString: process.env.AWS_DATABASE_URL,
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
});

export const db = drizzle(pool, { schema });

export async function warmDatabaseConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[database] Connection pool warmed successfully');
  } catch (error) {
    console.error('[database] Failed to warm connection pool:', error);
    throw error;
  }
}

export async function closeDatabasePool(): Promise<void> {
  await pool.end();
}
