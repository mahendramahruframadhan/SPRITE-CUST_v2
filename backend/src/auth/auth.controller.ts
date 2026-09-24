import { Controller, Post, Body, Req, Res, Get, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import * as crypto from 'crypto';
import { pickRole, validateRegistration } from './register.validation';
import { createSession, destroySession, resolveSessionUser } from './session';
import { esc, rowsOf } from '../db/sql';

// ponytail: local fallback auth (pg-mem) — Better Auth's drizzle pg adapter has timestamp type mismatch with pg-mem, so we provide minimal email/password auth that mimics Better Auth API shape. When DATABASE_URL is real postgres, main.ts mounts real Better Auth handler instead.
//
// Alur registrasi: daftar (POST sign-up/email ATAU setup/first-admin untuk akun
// pertama) HANYA menyimpan ke DB. Login dilakukan terpisah di /login via
// POST sign-in/email — frontend mengarahkan ke sana sesudah daftar berhasil.
// pg-mem: db.execute hanya andal dengan string mentah — sql-tag berparameter
// memicu "getTypeParser is not supported" di adapter pg-mem. Escaping lewat
// helper terpusat db/sql.ts; jalan di pg-mem maupun Postgres asli.

// Peminta dari token sesi (pola yang sama dengan PermGuard).
// Hanya Super Admin boleh menentukan role akun baru (dipakai form tambah
// pengguna di /roles); pendaftar mandiri selalu Viewer.
async function requesterIsSuperAdmin(db: any, req: any): Promise<boolean> {
  try {
    const u = await resolveSessionUser(db, req);
    return u?.role === 'Super Admin';
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

    const dup: any = await this.db.execute(`SELECT id FROM "user" WHERE lower(email) = '${esc(values.email)}' LIMIT 1` as any);
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
        `INSERT INTO "user" (id, name, email, email_verified, role, active, created_at, updated_at) VALUES ('${esc(id)}', '${esc(values.name)}', '${esc(values.email)}', 1, '${esc(role)}', 1, '${now}', '${now}')` as any,
      );
      await this.db.execute(
        `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ('${esc(`acc_${id}`)}', '${esc(values.email)}', 'credential', '${esc(id)}', '${esc(values.password)}', '${now}', '${now}')` as any,
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
    const r: any = await this.db.execute(`SELECT u.id, u.name, u.email, u.role, u.active, a.password FROM "user" u JOIN account a ON a.user_id = u.id WHERE lower(u.email) = '${esc(email)}' LIMIT 1` as any);
    const row = rowsOf(r)[0];
    if (!row || row.password !== password) return { error: 'invalid credentials' };
    if (!Number(row.active ?? 1)) return { error: 'akun dinonaktifkan' };
    // Token sesi server-side (disimpan di tabel session, kedaluwarsa 7 hari).
    // Frontend wajib mengirimnya via header x-auth-token di setiap request tulis.
    const token = await createSession(this.db, row.id);
    // set cookie seperti Better Auth (kompatibilitas klien lama)
    res.cookie?.('better-auth.session_token', token, { httpOnly: true, path: '/' });
    return { user: { id: row.id, name: row.name, email: row.email, role: row.role || 'Viewer' }, token };
  }

  @Post('sign-out')
  async signOut(@Body() body: any, @Req() req: any) {
    const token = String(body?.token || req?.headers?.['x-auth-token'] || '');
    await destroySession(this.db, token);
    return { ok: true };
  }

  @Get('session')
  async session(@Req() req: any) {
    const u = await resolveSessionUser(this.db, req);
    if (!u) return { user: null };
    return { user: { id: u.id, name: u.name, email: u.email, role: u.role || 'Viewer' } };
  }
}
