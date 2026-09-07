import { Controller, Post, Body, Req, Res, Get } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import * as crypto from 'crypto';

// ponytail: local fallback auth (pg-mem) — Better Auth's drizzle pg adapter has timestamp type mismatch with pg-mem, so we provide minimal email/password auth that mimics Better Auth API shape. When DATABASE_URL is real postgres, main.ts mounts real Better Auth handler instead.
@Controller('auth')
export class AuthController {
  private db: any = getDb();

  @Post('sign-up/email')
  async signUp(@Body() body: any) {
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const name = body.name || email.split('@')[0];
    const role = ['Super Admin', 'Admin CS', 'Support', 'Finance', 'Viewer'].includes(body.role) ? body.role : 'Viewer';
    if (!email || password.length < 5) return { error: 'email/password invalid' };
    const id = `u_${crypto.randomUUID().slice(0,8)}`;
    const now = new Date().toISOString();
    try {
      await this.db.execute(`INSERT INTO "user" (id,name,email,email_verified,role,active,created_at,updated_at) VALUES ('${id}','${name.replace(/'/g,"''")}','${email}',1,'${role}',1,'${now}','${now}')` as any);
      const accId = `acc_${id}`;
      await this.db.execute(`INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ('${accId}','${email}','credential','${id}','${password.replace(/'/g,"''")}','${now}','${now}')` as any);
      return { user: { id, name, email, role } };
    } catch (e: any) {
      return { error: String(e.message) };
    }
  }

  @Post('sign-in/email')
  async signIn(@Body() body: any, @Res({ passthrough: true }) res: any) {
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const r: any = await this.db.execute(`SELECT u.id, u.name, u.email, u.role, u.active, a.password FROM "user" u JOIN account a ON a.user_id=u.id WHERE lower(u.email)='${email.replace(/'/g,"''")}' LIMIT 1` as any);
    const row = (r.rows || r)[0];
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
