// M3 (hardening minimal): cookie kompatibilitas wajib membawa flags aman —
// httpOnly (sudah ada), sameSite=lax, maxAge=ttl sesi, dan secure di
// production. Migrasi penuh localStorage → httpOnly cookie = keputusan
// terpisah (lihat asesmen di backend/README.md).
// Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { SESSION_TTL_MS, createSession, resolveSessionUser } from '../src/auth/session.ts';

describe('cookie flags sign-in (M3)', () => {
  before(() => {
    setupTables();
  });

  it('set-cookie membawa httpOnly + sameSite=lax + maxAge + secure-production', async () => {
    await seedUser('Support', 'cookie.flags@revota.id');
    const ctl = new AuthController();
    let captured: any = null;
    const res = { cookie: (_name: string, _val: string, opts: any) => { captured = opts; } };

    const r: any = await ctl.signIn(
      { email: 'cookie.flags@revota.id', password: 'password123' },
      {} as any,
      res as any,
    );
    assert.ok(r.user, 'login tetap mengembalikan user');
    assert.ok(captured, 'res.cookie harus dipanggil');
    assert.equal(captured.httpOnly, true, 'httpOnly wajib');
    assert.equal(captured.sameSite, 'lax', 'sameSite=lax wajib');
    assert.equal(captured.maxAge, SESSION_TTL_MS, 'maxAge = TTL sesi (7 hari)');
    assert.equal(captured.secure, process.env.NODE_ENV === 'production', 'secure mengikuti NODE_ENV');
  });

  it('sesi bisa di-resolve dari cookie httpOnly tanpa header', async () => {
    const u = await seedUser('Support', 'cookie.resolve@revota.id');
    const token = await createSession(db(), u.id);
    const req = { headers: { cookie: `other=1; better-auth.session_token=${token}; x=2` } };
    const found = await resolveSessionUser(db(), req);
    assert.equal(found?.email, 'cookie.resolve@revota.id');
  });

  it('sign-in tidak lagi mengembalikan token mentah di body', async () => {
    await seedUser('Support', 'cookie.nobody@revota.id');
    const ctl = new AuthController();
    const res = { cookie: () => {} };
    const r: any = await ctl.signIn(
      { email: 'cookie.nobody@revota.id', password: 'password123' },
      {} as any,
      res as any,
    );
    assert.ok(!('token' in r), 'body tidak boleh memuat token (hindari eksfiltrasi via JS)');
    assert.ok(r.user?.email, 'user tetap dikembalikan');
  });

  it('sign-out via cookie menghancurkan sesi + menghapus cookie', async () => {
    const u = await seedUser('Support', 'cookie.bye@revota.id');
    const ctl = new AuthController();
    const token = await createSession(db(), u.id);
    let cleared: any = null;
    const res = { clearCookie: (name: string, _opts: any) => { cleared = name; } };
    const req = { headers: { cookie: `better-auth.session_token=${token}` } };
    const r: any = await ctl.signOut({}, req as any, res as any);
    assert.equal(r.ok, true);
    assert.equal(cleared, 'better-auth.session_token');
    assert.equal(await resolveSessionUser(db(), req), null);
  });
});
