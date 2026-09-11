import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initDb } from './db/init';

async function bootstrap() {
  // ponytail: pg-mem in-memory — no Docker. Seed 2034 cases from frontend/src/data/cases.js
  await initDb();

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT) || 5005;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  app.setGlobalPrefix('api');
  // LAN: izinkan akses dari IP lokal teman (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  // agar fetch langsung ke :5005 tidak kena blokir CORS saat dibuka via http://192.168.1.5:5173
  app.enableCors({
    origin: [
      frontendUrl,
      'http://localhost:5173',
      'http://localhost:3000',
      'http://192.168.1.5:5173',
      /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
      /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
      /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/,
    ],
    credentials: true,
  });

  // ponytail: AuthController (email/password cocok dengan user seed) menangani
  // /api/auth/* di semua env. Handler Better Auth asli tidak di-mount karena
  // expressApp.all terdaftar sebelum route Nest (shadowing) + password seed plaintext.
  console.log('[backend] Auth via AuthController — POST /api/auth/sign-in/email {email,password}');

  await app.listen(port, '0.0.0.0');
  console.log(`[backend] listening on http://localhost:${port}/api — health: /api/health`);
  console.log(`[backend] Better Auth at /api/auth/* — frontend: ${frontendUrl}`);
}
bootstrap();
