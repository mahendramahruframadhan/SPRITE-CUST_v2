import { Controller, Post, Body, Req, Res, Get, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import * as crypto from 'crypto';
import { pickRole, validateRegistration } from './register.validation';
import { createSession, destroySession, resolveSessionUser, SESSION_TTL_MS } from './session';
import { hashPassword, verifyPassword } from './password';
import { esc, rowsOf } from '../db/sql';
import { logActivity } from '../logs/activity';
import {
  SIGNIN_MAX_HITS,
  SIGNIN_WINDOW_MS,
  SIGNUP_MAX_HITS,
  SIGNUP_WINDOW_MS,
  throttleAuth,
} from './rate-limit';

// ponytail: local fallback auth (pg-mem) — Better Auth's drizzle pg adapter has timestamp type mismatch with pg-mem, so we provide minimal email/password auth that mimics Better Auth API shape. When DATABASE_URL is real postgres, main.ts mounts real Better Auth handler instead.
//
// Alur registrasi: daftar (POST sign-up/email ATAU setup/first-admin untuk akun
// pertama) HANYA menyimpan ke DB. Login dilakukan terpisah di /login via
// POST sign-in/email — frontend mengarahkan ke sana sesudah daftar berhasil.
// pg-mem: db.execute hanya andal dengan string mentah — sql-tag berparameter
// memicu "getTypeParser is not supported" di adapter pg-mem. Escaping lewat
// helper terpusat db/sql.ts; jalan di pg-mem maupun Postgres asli.

// Hash scrypt yang valid tetapi acak — BUKAN rahasia, hanya pengisi waktu
// agar cabang "email tidak dikenal" membayar biaya scrypt yang sama dengan
// cabang verifikasi normal (anti timing-oracle, lihat H2 di signIn).
const DUMMY_HASH =
  'scrypt$35bc7ce4e3f845afe8dd94d26620c293$5abc070ba5b9f42b0d28073954d01c104e73b5ac3cdf1124e5c819399fa8b46784bcbd0192c5f224e9b5159d460dabf850182f69fdadadc740067e90dc807a63';

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
    // H5: registrasi terbuka = target mass-registration & user-enumeration
    // (EMAIL_TAKEN membedakan email). Batas keras per IP.
    throttleAuth(
      `signup:${String(req?.ip || req?.socket?.remoteAddress || 'unknown')}`,
      SIGNUP_MAX_HITS,
      SIGNUP_WINDOW_MS,
      'SIGNUP_RATE_LIMITED',
    );
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
    const password = await hashPassword(values.password);
    try {
      await this.db.execute(
        `INSERT INTO "user" (id, name, email, email_verified, role, active, created_at, updated_at) VALUES ('${esc(id)}', '${esc(values.name)}', '${esc(values.email)}', 1, '${esc(role)}', 1, '${now}', '${now}')` as any,
      );
      await this.db.execute(
        `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ('${esc(`acc_${id}`)}', '${esc(values.email)}', 'credential', '${esc(id)}', '${esc(password)}', '${now}', '${now}')` as any,
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
  async signIn(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    // H1: tanpa ini, endpoint login bisa dihantam tanpa batas (password
    // minimal 5 karakter). Kunci per email+IP agar satu penyerang tidak bisa
    // mengunci akun orang lain, dan satu IP tidak bisa menyapu banyak akun
    // dari alamat yang sama tanpa melambat drastis.
    throttleAuth(
      `signin:${email}:${String(req?.ip || req?.socket?.remoteAddress || 'unknown')}`,
      SIGNIN_MAX_HITS,
      SIGNIN_WINDOW_MS,
      'AUTH_RATE_LIMITED',
    );
    const r: any = await this.db.execute(`SELECT u.id, u.name, u.email, u.role, u.active, a.password FROM "user" u JOIN account a ON a.user_id = u.id WHERE lower(u.email) = '${esc(email)}' LIMIT 1` as any);
    const row = rowsOf(r)[0];
    // H2 (anti oracle): SEMUA kegagalan membalas pesan yang sama persis.
    // Dulu tiga pesan berbeda ('invalid credentials' / 'password reset
    // required' / 'akun dinonaktifkan') memungkinkan pemetaan email valid +
    // status akun. scrypt selalu dijalankan — bahkan saat email tidak dikenal
    // (pakai DUMMY_HASH) — agar waktunya tidak membedakan kasus.
    // Konsekuensi yang disadari: pemilik password legacy / akun nonaktif
    // mendapat pesan generik dan harus hubungi admin untuk reset/aktivasi.
    const passOk = await verifyPassword(password, row ? row.password : DUMMY_HASH);
    if (!row || !passOk || !Number(row.active ?? 1)) {
      // M4: audit percobaan login gagal di server (email + IP, TANPA password).
      // Respons tetap 200 {error} — sengaja (anti-oracle, lihat komentar H2).
      await logActivity(this.db, {
        who: row?.email || email || 'unknown',
        action: 'Login gagal',
        category: 'Keamanan',
        detail: `email=${email} ip=${String(req?.ip || req?.socket?.remoteAddress || 'unknown')}`,
      });
      return { error: 'invalid credentials' };
    }
    // Token sesi server-side (disimpan di tabel session, kedaluwarsa 7 hari).
    // Frontend wajib mengirimnya via header x-auth-token di setiap request tulis.
    const token = await createSession(this.db, row.id);
    // set cookie seperti Better Auth (kompatibilitas klien lama). Flags
    // aman M3: httpOnly + sameSite=lax + maxAge=ttl; secure hanya production
    // (dev jalan di http://localhost). Migrasi penuh ke cookie → README.
    res?.cookie?.('better-auth.session_token', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS,
      secure: process.env.NODE_ENV === 'production',
    });
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
