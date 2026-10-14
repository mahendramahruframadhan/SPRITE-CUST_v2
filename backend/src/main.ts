import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { initDb } from './db/init';
import { validateConfig } from './config/validate';
import { devModeWarnings, trustProxy } from './config/env';
import { buildCorsOptions } from './config/cors';
import { csrfGuard } from './auth/csrf';
import { GlobalExceptionFilter } from './common/http-exception.filter';

const log = new Logger('Bootstrap');

async function bootstrap() {
  // ponytail: pg-mem in-memory — no Docker. Seed 2034 cases from frontend/src/data/cases.js
  await initDb();
  validateConfig();

  // F7: peringatan operator mode development (bind 0.0.0.0, SETUP_TOKEN
  // bisa dilewati, trust proxy default mati) — perilaku tidak diubah.
  for (const w of devModeWarnings()) log.warn(w);

  const app = await NestFactory.create(AppModule);
  // Satu bentuk error untuk semua endpoint: {ok:false,code,message,statusCode}.
  app.useGlobalFilters(new GlobalExceptionFilter());
  const port = Number(process.env.PORT) || 5005;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  app.setGlobalPrefix('api');
  // H6: lihat src/config/cors.ts — credentials:true (auth cookie httpOnly)
  // + origin eksplisit, tanpa regex subnet.
  app.enableCors(buildCorsOptions());

  // M3: kompensasi CSRF untuk cookie (lihat src/auth/csrf.ts) — menolak
  // request mutasi ber-cookie tanpa Origin/Referer yang dikenal.
  app.use(csrfGuard);

  // F4: Express trust proxy HANYA dari parser fail-closed (default false).
  // Operator di belakang reverse proxy/LB menyetel TRUST_PROXY=<jumlah hop>
  // agar rate-limit memakai IP asli pelanggan, bukan IP proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy());

  // ponytail: AuthController (email/password cocok dengan user seed) menangani
  // /api/auth/* di semua env. Handler Better Auth asli tidak di-mount karena
  // expressApp.all terdaftar sebelum route Nest (shadowing) + password seed plaintext.
  log.log('Auth via AuthController — POST /api/auth/sign-in/email {email,password}');

  await app.listen(port, '0.0.0.0');
  log.log(`listening on http://localhost:${port}/api — health: /api/health`);
  log.log(`Better Auth at /api/auth/* — frontend: ${frontendUrl}`);
}
bootstrap();
