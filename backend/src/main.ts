import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { initDb } from './db/init';
import { validateConfig } from './config/validate';
import { buildCorsOptions } from './config/cors';
import { GlobalExceptionFilter } from './common/http-exception.filter';

const log = new Logger('Bootstrap');

async function bootstrap() {
  // ponytail: pg-mem in-memory — no Docker. Seed 2034 cases from frontend/src/data/cases.js
  await initDb();
  validateConfig();

  const app = await NestFactory.create(AppModule);
  // Satu bentuk error untuk semua endpoint: {ok:false,code,message,statusCode}.
  app.useGlobalFilters(new GlobalExceptionFilter());
  const port = Number(process.env.PORT) || 5005;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  app.setGlobalPrefix('api');
  // H6: lihat src/config/cors.ts — credentials:false (auth via header
  // x-auth-token, bukan cookie) + origin eksplisit, tanpa regex subnet.
  app.enableCors(buildCorsOptions());

  // ponytail: AuthController (email/password cocok dengan user seed) menangani
  // /api/auth/* di semua env. Handler Better Auth asli tidak di-mount karena
  // expressApp.all terdaftar sebelum route Nest (shadowing) + password seed plaintext.
  log.log('Auth via AuthController — POST /api/auth/sign-in/email {email,password}');

  await app.listen(port, '0.0.0.0');
  log.log(`listening on http://localhost:${port}/api — health: /api/health`);
  log.log(`Better Auth at /api/auth/* — frontend: ${frontendUrl}`);
}
bootstrap();
