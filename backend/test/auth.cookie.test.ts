// M3 (hardening minimal): cookie kompatibilitas wajib membawa flags aman —
// httpOnly (sudah ada), sameSite=lax, maxAge=ttl sesi, dan secure di
// production. Migrasi penuh localStorage → httpOnly cookie = keputusan
// terpisah (lihat asesmen di backend/README.md).
// Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { SESSION_TTL_MS } from '../src/auth/session.ts';

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
    assert.ok(r.token, 'login tetap mengeluarkan token');
    assert.ok(captured, 'res.cookie harus dipanggil');
    assert.equal(captured.httpOnly, true, 'httpOnly wajib');
    assert.equal(captured.sameSite, 'lax', 'sameSite=lax wajib');
    assert.equal(captured.maxAge, SESSION_TTL_MS, 'maxAge = TTL sesi (7 hari)');
    assert.equal(captured.secure, process.env.NODE_ENV === 'production', 'secure mengikuti NODE_ENV');
  });
});
