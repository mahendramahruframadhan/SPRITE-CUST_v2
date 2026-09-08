import { Controller, Post, Body, Req, Res, Get, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/drizzle.service';
import * as crypto from 'crypto';
import { pickRole, validateRegistration } from './register.validation';

// ponytail: local fallback auth (pg-mem) — Better Auth's drizzle pg adapter has timestamp type mismatch with pg-mem, so we provide minimal email/password auth that mimics Better Auth API shape. When DATABASE_URL is real postgres, main.ts mounts real Better Auth handler instead.
//
// Alur registrasi: daftar (POST sign-up/email ATAU setup/first-admin untuk akun
// pertama) HANYA menyimpan ke DB. Login dilakukan terpisah di /login via
// POST sign-in/email — frontend mengarahkan ke sana sesudah daftar berhasil.
const rowsOf = (r: any): any[] => r?.rows || r || [];

// Role peminta dari header x-user-email (pola yang sama dengan PermGuard).
// Hanya Super Admin boleh menentukan role akun baru (dipakai form tambah
// pengguna di /roles); pendaftar mandiri selalu Viewer.
async function requesterIsSuperAdmin(db: any, req: any): Promise<boolean> {
  try {
    const email = String(req?.headers?.['x-user-email'] || '').toLowerCase().trim();
    if (!email) return false;
    const r: any = await db.execute(sql`SELECT role FROM "user" WHERE lower(email) = ${email} LIMIT 1`);
    return rowsOf(r)[0]?.role === 'Super Admin';
  } catch {
    return false;
  }
}

@Controller('auth')
export class AuthController {
  private db: any = getDb();

  @Post('sign-up/email')
  @HttpCode(201)
  async signUp(@Body() body: any, @Req() req: any) {
    const { values, fields } = validateRegistration(body);
    if (Object.keys(fields).length > 0) {
      throw new HttpException(
        { code: 'VALIDATION_ERROR', message: 'Data pendaftaran tidak valid.', fields },
        HttpStatus.BAD_REQUEST,
      );
    }

    const canAssignRole = await requesterIsSuperAdmin(this.db, req);
    const role = canAssignRole ? pickRole(body.role) : 'Viewer';

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
        sql`INSERT INTO "user" (id, name, email, email_verified, role, active, created_at, updated_at) VALUES (${id}, ${values.name}, ${values.email}, 1, ${role}, 1, ${now}, ${now})`,
      );
      await this.db.execute(
        sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${`acc_${id}`}, ${values.email}, 'credential', ${id}, ${values.password}, ${now}, ${now})`,
      );
    } catch (e: any) {
      throw new HttpException(
        { code: 'EMAIL_TAKEN', message: 'Email sudah terdaftar. Silakan login.' },
        HttpStatus.CONFLICT,
      );
    }
    return { user: { id, name: values.name, email: values.email, role } };
  }

  @Post('sign-in/email')
  async signIn(@Body() body: any, @Res({ passthrough: true }) res: any) {
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const r: any = await this.db.execute(sql`SELECT u.id, u.name, u.email, u.role, u.active, a.password FROM "user" u JOIN account a ON a.user_id = u.id WHERE lower(u.email) = ${email} LIMIT 1`);
    const row = rowsOf(r)[0];
    if (!row || row.password !== password) return { error: 'invalid credentials' };
    if (!Number(row.active ?? 1)) return { error: 'akun dinonaktifkan' };
    const token = `mock_${row.id}_${Date.now()}`;
    // set cookie like Better Auth does
    res.cookie?.('better-auth.session_token', token, { httpOnly: true, path: '/' });
    return { user: { id: row.id, name: row.name, email: row.email, role: row.role || 'Viewer' }, token };
  }

  @Post('sign-out')
  async signOut() {
    return { ok: true };
  }

  @Get('session')
  async session(@Req() req: any) {
    return { user: (req as any).user || null };
  }
}
