// Uji H4: reset password oleh admin HARUS mencabut semua sesi aktif target.
// Dulu POST /api/users/:id/password hanya UPDATE tabel account — token yang
// sudah dicuri/dipegang penyerang tetap valid sampai 7 hari, sehingga reset
// password tidak memulihkan akun yang direbut.
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession, resolveSessionUser } from '../src/auth/session.ts';
import { RolesController } from '../src/roles/roles.controller.ts';

const uniq = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe('H4 — reset password mencabut sesi', () => {
  before(() => {
    setupTables();
  });

  it('sesi target mati setelah admin reset password-nya', async () => {
    const suffix = uniq();
    const sa = await seedUser('Super Admin', `sa-${suffix}@revota.id`);
    const saToken = await createSession(db(), sa.id);
    const victim = await seedUser('Viewer', `korban-${suffix}@revota.id`);
    const victimToken = await createSession(db(), victim.id);
    await db().execute(
      `INSERT INTO role_permissions (role, module, allowed) VALUES ('Super Admin','roles',1)` as any,
    );

    const withToken = (t: string) => ({ headers: { 'x-auth-token': t } });
    assert.ok(await resolveSessionUser(db(), withToken(victimToken)), 'prekondisi: sesi korban hidup');

    const ctl = new RolesController();
    const r: any = await (ctl as any).password(
      victim.id,
      { password: 'baru-yang-kuat-123' },
      withToken(saToken),
    );
    assert.equal(r?.ok, true, 'reset oleh SA harus sukses');

    assert.equal(
      await resolveSessionUser(db(), withToken(victimToken)),
      null,
      'sesi korban harus mati setelah password di-reset',
    );
    // Sesi admin yang mereset tidak ikut tercabut.
    assert.ok(await resolveSessionUser(db(), withToken(saToken)), 'sesi admin pereset tetap hidup');
  });
});
