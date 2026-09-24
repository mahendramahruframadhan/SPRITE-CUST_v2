// Uji sesi token server-side — node:test bawaan, pg-mem (tanpa Docker).
// Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession, destroySession, resolveSessionUser, SESSION_TTL_MS } from '../src/auth/session.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { PermGuard } from '../src/auth/perm.guard.ts';

const reqWith = (token?: string, email?: string) => ({
  headers: { ...(token ? { 'x-auth-token': token } : {}), ...(email ? { 'x-user-email': email } : {}) },
});
const guardCtx = (req: any, mod = 'billing') => ({
  getHandler: () => null,
  getClass: () => null,
  switchToHttp: () => ({ getRequest: () => req }),
});
const reflectorStub = { getAllAndOverride: () => 'billing' };

describe('auth session (P1-3)', () => {
  before(() => {
    setupTables();
  });

  it('sign-in mengeluarkan token sesi yang valid untuk guard', async () => {
    await seedUser('Super Admin', 'sa@revota.id');
    const ctl = new AuthController();
    const r: any = await ctl.signIn({ email: 'sa@revota.id', password: 'password123' }, {});
    assert.ok(r.token && r.token.length >= 32, 'token harus ada');
    assert.equal(r.user.role, 'Super Admin');
    const guard = new PermGuard(reflectorStub as any);
    assert.equal(await guard.canActivate(guardCtx(reqWith(r.token)) as any), true);
  });

  it('tanpa token / token ngawur → 401 (frontend mengarah login ulang)', async () => {
    const guard = new PermGuard(reflectorStub as any);
    await assert.rejects(() => guard.canActivate(guardCtx(reqWith(undefined, 'sa@revota.id')) as any), (e: any) => e?.status === 401 && e?.response?.code === 'SESSION_EXPIRED');
    await assert.rejects(() => guard.canActivate(guardCtx(reqWith('token-ngawur')) as any), (e: any) => e?.status === 401);
  });

  it('role tanpa izin modul DITOLAK, Super Admin lolos', async () => {
    await seedUser('Viewer', 'viewer@revota.id');
    const ctl = new AuthController();
    const v: any = await ctl.signIn({ email: 'viewer@revota.id', password: 'password123' }, {});
    const guard = new PermGuard(reflectorStub as any);
    assert.equal(await guard.canActivate(guardCtx(reqWith(v.token)) as any), false);
    await db().execute(`INSERT INTO role_permissions (role, module, allowed) VALUES ('Viewer','billing',1)` as any);
    assert.equal(await guard.canActivate(guardCtx(reqWith(v.token)) as any), true);
  });

  it('sign-out mencabut token; sesi kedaluwarsa dibersihkan', async () => {
    await seedUser('Support', 'sup@revota.id');
    const ctl = new AuthController();
    const s: any = await ctl.signIn({ email: 'sup@revota.id', password: 'password123' }, {});
    assert.ok(await resolveSessionUser(db(), reqWith(s.token)));
    await ctl.signOut({ token: s.token }, reqWith(s.token));
    assert.equal(await resolveSessionUser(db(), reqWith(s.token)), null);

    const s2: any = await ctl.signIn({ email: 'sup@revota.id', password: 'password123' }, {});
    // paksa kedaluwarsa langsung di DB
    await db().execute(`UPDATE session SET expires_at='2000-01-01T00:00:00.000Z' WHERE token='${s2.token}'` as any);
    assert.equal(await resolveSessionUser(db(), reqWith(s2.token)), null);
  });

  it('login baru mengusir sesi lama (satu sesi aktif)', async () => {
    await seedUser('Finance', 'fin@revota.id');
    const ctl = new AuthController();
    const a: any = await ctl.signIn({ email: 'fin@revota.id', password: 'password123' }, {});
    const b: any = await ctl.signIn({ email: 'fin@revota.id', password: 'password123' }, {});
    assert.notEqual(a.token, b.token);
    assert.equal(await resolveSessionUser(db(), reqWith(a.token)), null);
    assert.ok(await resolveSessionUser(db(), reqWith(b.token)));
  });

  it('SESSION_TTL_MS = 7 hari', () => {
    assert.equal(SESSION_TTL_MS, 7 * 24 * 3600 * 1000);
  });
});
