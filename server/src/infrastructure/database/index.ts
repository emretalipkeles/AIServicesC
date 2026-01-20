import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@shared/schema';

const pool = new pg.Pool({
  connectionString: process.env.AWS_DATABASE_URL,
});

export const db = drizzle(pool, { schema });
