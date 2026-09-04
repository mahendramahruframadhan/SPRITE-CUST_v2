import { defineConfig } from 'drizzle-kit';

// ponytail: local uses pg-mem (in-memory pg). When Postgres ready, set DATABASE_URL=postgresql://... and keep dialect postgresql
export default defineConfig({
  schema: './src/db/schema.pg.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/sprite_cust',
  },
});
