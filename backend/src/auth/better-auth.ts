import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '../db/drizzle.service';
import * as schemaPg from '../db/schema.pg';

// ponytail: pg-mem exposes pg-compatible pool, so drizzle pg adapter works even local without real Postgres
const db: any = getDb();

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: schemaPg as any }),
  emailAndPassword: { enabled: true, minPasswordLength: 6 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  trustedOrigins: [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://localhost:3000'],
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-me-32-chars-minimum!!',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5005',
});
