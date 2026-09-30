import { Body, Controller, Get, Header, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import { getDb } from '../db/drizzle.service';
import { logActivity } from '../logs/activity';
import { validateRegistration } from '../auth/register.validation';
import { hashPassword } from '../auth/password';
import { esc, rowsOf } from '../db/sql';
import { isDevSeedAllowed } from '../config/env';

// Registrasi AKUN PERTAMA instalasi (kontrak: frontend/src/features/register/BACKEND_CONTRACT.md).
// - GET  /api/setup/status      → { firstRun, userCount, setupTokenRequired } (publik, tanpa auth)
// - POST /api/setup/first-admin → { user } role Super Admin (HANYA saat userCount === 0)
// Setelah 1 user ada, POST selalu 409 ALREADY_INITIALIZED. Role dikunci di
// server — body.role dari client selalu diabaikan.

// Lihat db/sql.ts: string mentah + esc() terpusat agar jalan di pg-mem
// maupun Postgres asli.

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

  private hasValidSetupToken(req: any): boolean {
    const configured = String(process.env.SETUP_TOKEN || '');
    // Kritis #2 (fail-closed): tanpa SETUP_TOKEN, endpoint ini membiarkan siapa
    // pun menunjuk dirinya Super Admin di instalasi yang belum punya user.
    // Dulu kondisinya `NODE_ENV !== 'production'` — true saat NODE_ENV kosong
    // atau salah ketik, jadi proteksinya mati tanpa error. Hanya development
    // eksplisit yang boleh; validateConfig() menolak env tak dikenal saat boot.
    if (!configured) return isDevSeedAllowed();
    const provided = String(req?.headers?.['x-setup-token'] || '');
    const expected = Buffer.from(configured);
    const actual = Buffer.from(provided);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  async status() {
    const r: any = await this.db.execute(sql`SELECT COUNT(*) AS c FROM "user"`);
    const userCount = Number(rowsOf(r)[0]?.c ?? 0);
    return { firstRun: userCount === 0, userCount, setupTokenRequired: !!String(process.env.SETUP_TOKEN || '') };
  }

  @Post('first-admin')
  @HttpCode(201)
  async firstAdmin(@Body() body: any, @Req() req: any) {
    throttleFirstAdmin(String(req?.ip || req?.socket?.remoteAddress || 'unknown'));
    if (!this.hasValidSetupToken(req)) {
      throw new HttpException(
        { code: 'SETUP_TOKEN_REQUIRED', message: 'Setup token tidak valid.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const { values, fields } = validateRegistration(body);
    if (Object.keys(fields).length > 0) {
      throw new HttpException(
        { code: 'VALIDATION_ERROR', message: 'Data pendaftaran tidak valid.', fields },
        HttpStatus.BAD_REQUEST,
      );
    }

    const id = `u_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const password = await hashPassword(values.password);
    try {
      await this.db.transaction(async (tx: any) => {
        const c: any = await tx.execute(sql`SELECT COUNT(*) AS c FROM "user"`);
        if (Number(rowsOf(c)[0]?.c ?? 0) > 0) {
          throw new HttpException(
            { code: 'ALREADY_INITIALIZED', message: 'Instalasi sudah memiliki akun. Silakan login atau daftar sebagai Viewer.' },
            HttpStatus.CONFLICT,
          );
        }

        // Imp#1: di dalam transaksi tetap esc() — lihat db/sql.ts (tx tidak
        // punya pq; sql-tag berparameter drizzle gagal di pg-mem).
        const dup: any = await tx.execute(`SELECT id FROM "user" WHERE lower(email) = '${esc(values.email)}' LIMIT 1` as any);
        if (rowsOf(dup)[0]) {
          throw new HttpException(
            { code: 'EMAIL_TAKEN', message: 'Email sudah terdaftar. Silakan login.' },
            HttpStatus.CONFLICT,
          );
        }

        await tx.execute(
          `INSERT INTO "user" (id, name, email, email_verified, role, active, created_at, updated_at) VALUES ('${esc(id)}', '${esc(values.name)}', '${esc(values.email)}', 1, 'Super Admin', 1, '${now}', '${now}')` as any,
        );
        await tx.execute(
          `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ('${esc(`acc_${id}`)}', '${esc(values.email)}', 'credential', '${esc(id)}', '${esc(password)}', '${now}', '${now}')` as any,
        );
      });
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
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
