// Matriks backend harus mengenal SEMUA modul yang dikelola UI /roles
// (report + analytics): kunci payload tidak boleh dibuang diam-diam dan
// kunci anti-lockout SA harus mencakupnya.
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession } from '../src/auth/session.ts';
import { RolesController } from '../src/roles/roles.controller.ts';
import { esc } from '../src/db/sql.ts';

const uniq = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const withToken = (t: string) => ({ headers: { 'x-auth-token': t } });

async function perm(role: string, mod: string): Promise<number | null> {
  const r: any = await db().execute(
    `SELECT allowed FROM role_permissions WHERE role='${esc(role)}' AND module='${esc(mod)}'` as any,
  );
  const row = (r.rows || r)[0];
  return row ? Number(row.allowed) : null;
}

describe('matriks modul report/analytics', () => {
  before(() => {
    setupTables();
  });

  it('SA bisa menulis izin report + analytics (tidak dibuang diam-diam)', async () => {
    const ctl = new RolesController();
    const u = await seedUser('Super Admin', `sa2-${uniq()}@revota.id`);
    const r: any = await ctl.putPerms(
      { perms: { Support: { analytics: 1, report: 0 } } },
      withToken(await createSession(db(), u.id)),
    );
    assert.equal(r.ok, true);
    assert.equal(await perm('Support', 'analytics'), 1);
    assert.equal(await perm('Support', 'report'), 0);
  });

  it('anti-lockout SA mencakup report + analytics walau payload merekayasa 0', async () => {
    const ctl = new RolesController();
    const u = await seedUser('Super Admin', `sa3-${uniq()}@revota.id`);
    await ctl.putPerms(
      { perms: { 'Super Admin': { analytics: 0, report: 0 } } },
      withToken(await createSession(db(), u.id)),
    );
    assert.equal(await perm('Super Admin', 'analytics'), 1);
    assert.equal(await perm('Super Admin', 'report'), 1);
  });
});
