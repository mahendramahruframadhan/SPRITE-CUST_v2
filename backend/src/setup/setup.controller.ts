import { Body, Controller, Get, Header, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import { getDb } from '../db/drizzle.service';
import { logActivity } from '../logs/activity';
import { validateRegistration } from '../auth/register.validation';

// Registrasi AKUN PERTAMA instalasi (kontrak: frontend/src/features/register/BACKEND_CONTRACT.md).
// - GET  /api/setup/status      → { firstRun, userCount } (publik, tanpa auth)
// - POST /api/setup/first-admin → { user } role Super Admin (HANYA saat userCount === 0)
// Setelah 1 user ada, POST selalu 409 ALREADY_INITIALIZED. Role dikunci di
// server — body.role dari client selalu diabaikan.
const rowsOf = (r: any): any[] => r?.rows || r || [];

// Throttle sederhana in-memory: max 10 POST /setup/first-admin per menit per IP.
const firstAdminHits = new Map<string, number[]>();
function throttleFirstAdmin(ip: string) {
  const now = Date.now();
  const list = (firstAdminHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= 10) {
    throw new HttpException(
      { code: 'RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi semenit lagi.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  list.push(now);
  firstAdminHits.set(ip, list);
}

@Controller('setup')
export class SetupController {
  private db: any = getDb();

  @Get('status')
  @Header('Cache-Control', 'no-store')
  async status() {
    const r: any = await this.db.execute(sql`SELECT COUNT(*) AS c FROM "user"`);
    const userCount = Number(rowsOf(r)[0]?.c ?? 0);
    return { firstRun: userCount === 0, userCount };
  }

  @Post('first-admin')
  @HttpCode(201)
  async firstAdmin(@Body() body: any, @Req() req: any) {
    throttleFirstAdmin(String(req?.ip || req?.socket?.remoteAddress || 'unknown'));

    const { values, fields } = validateRegistration(body);
    if (Object.keys(fields).length > 0) {
      throw new HttpException(
        { code: 'VALIDATION_ERROR', message: 'Data pendaftaran tidak valid.', fields },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Kunci first-run: tolak bila sudah ada user (cek + insert tidak atomik;
    // jendela race antar 2 request bersamaan diterima untuk tool internal —
    // kontrak mencatatnya sebagai follow-up bila perlu serialisasi penuh).
    const c: any = await this.db.execute(sql`SELECT COUNT(*) AS c FROM "user"`);
    if (Number(rowsOf(c)[0]?.c ?? 0) > 0) {
      throw new HttpException(
        { code: 'ALREADY_INITIALIZED', message: 'Instalasi sudah memiliki akun. Silakan login atau daftar sebagai Viewer.' },
        HttpStatus.CONFLICT,
      );
    }

    const dup: any = await this.db.execute(sql`SELECT id FROM "user" WHERE lower(email) = ${values.email} LIMIT 1`);
    if (rowsOf(dup)[0]) {
      throw new HttpException(
        { code: 'EMAIL_TAKEN', message: 'Email sudah terdaftar. Silakan login.' },
        HttpStatus.CONFLICT,
      );
    }

    const id = `u_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    try {
      await this.db.execute(
        sql`INSERT INTO "user" (id, name, email, email_verified, role, active, created_at, updated_at) VALUES (${id}, ${values.name}, ${values.email}, 1, 'Super Admin', 1, ${now}, ${now})`,
      );
      await this.db.execute(
        sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${`acc_${id}`}, ${values.email}, 'credential', ${id}, ${values.password}, ${now}, ${now})`,
      );
    } catch (e: any) {
      // Race: request lain mengisi DB duluan / email duplikat bersamaan.
      throw new HttpException(
        { code: 'ALREADY_INITIALIZED', message: 'Instalasi sudah memiliki akun. Silakan login.' },
        HttpStatus.CONFLICT,
      );
    }

    await logActivity(this.db, {
      who: values.name,
      action: `membuat akun Super Admin pertama (${values.email})`,
      category: 'setup',
    });
    return { user: { id, name: values.name, email: values.email, role: 'Super Admin' } };
  }
}
