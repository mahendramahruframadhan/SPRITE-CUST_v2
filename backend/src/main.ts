import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth/better-auth';
import { initDb } from './db/init';

async function bootstrap() {
  // ponytail: pg-mem in-memory — no Docker. Seed 2034 cases from frontend/src/data/cases.js
  await initDb();

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT) || 5005;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  app.setGlobalPrefix('api');
  app.enableCors({ origin: [frontendUrl, 'http://localhost:3000'], credentials: true });

  // ponytail: Better Auth drizzle pg adapter needs real Postgres; for local pg-mem we use AuthController fallback (see src/auth/auth.controller.ts). Mount real handler only when DATABASE_URL is postgres
  const isRealPg = String(process.env.DATABASE_URL || '').startsWith('postgres');
  if (isRealPg) {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.all('/api/auth/*', toNodeHandler(auth));
    console.log('[backend] Better Auth real handler mounted (postgres)');
  } else {
    console.log('[backend] Auth fallback (pg-mem) — use POST /api/auth/sign-in/email {email,password}');
  }

  await app.listen(port);
  console.log(`[backend] listening on http://localhost:${port}/api — health: /api/health`);
  console.log(`[backend] Better Auth at /api/auth/* — frontend: ${frontendUrl}`);
}
bootstrap();
