// Uji H3: PATCH /api/users/:id tidak boleh menjadi jalan eskalasi.
// Dulu: siapa pun berizin modul 'roles' bisa (a) menaikkan akun mana pun
// menjadi Super Admin, (b) menonaktifkan/menurunkan Super Admin — termasuk
// mengunci seluruh sistem dengan menonaktifkan SEMUA Super Admin.
// Sesudah fix: (a)+(b) hanya oleh Super Admin, dan Super Admin aktif terakhir
// tidak bisa dinonaktifkan/diturunkan oleh siapa pun.
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession } from '../src/auth/session.ts';
import { RolesController } from '../src/roles/roles.controller.ts';
import { esc } from '../src/db/sql.ts';

const uniq = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function adminClient() {
  const suffix = uniq();
  const sa = await seedUser('Super Admin', `sa-${suffix}@revota.id`);
  const token = await createSession(db(), sa.id);
  await db().execute(
    `INSERT INTO role_permissions (role, module, allowed) VALUES ('Super Admin','roles',1)` as any,
  );
  return { sa, req: { headers: { 'x-auth-token': token } } };
}

async function nonAdminClient() {
  const suffix = uniq();
  const cs = await seedUser('Admin CS', `cs-${suffix}@revota.id`);
  const token = await createSession(db(), cs.id);
  // Simulasi matriks yang keliru memberi modul 'roles' ke Admin CS
  // (UI /roles memang mengizinkan Super Admin mencentang apa pun).
  await db().execute(
    `INSERT INTO role_permissions (role, module, allowed) VALUES ('Admin CS','roles',1)` as any,
  );
  return { cs, req: { headers: { 'x-auth-token': token } } };
}

const getUser = async (id: string) => {
  const r: any = await db().execute(`SELECT role, active FROM "user" WHERE id='${esc(id)}'` as any);
  return (r.rows || r)[0];
};

describe('H3 — PATCH users tidak bisa dipakai eskalasi/lockout', () => {
  before(() => {
    setupTables();
  });

  it('non-Super-Admin berizin roles TIDAK bisa menaikkan akun ke Super Admin', async () => {
    const { cs, req } = await nonAdminClient();
    const victim = await seedUser('Viewer', `korban-${uniq()}@revota.id`);
    const ctl = new RolesController();
    await assert.rejects(
      () => (ctl as any).updateUser(victim.id, { role: 'Super Admin' }, req),
      (e: any) => e?.status === 403,
      'grant Super Admin oleh non-SA harus 403',
    );
    assert.equal((await getUser(victim.id))?.role, 'Viewer');
    void cs;
  });

  it('non-Super-Admin berizin roles TIDAK bisa menonaktifkan Super Admin', async () => {
    const { req } = await nonAdminClient();
    const { sa } = await adminClient();
    const ctl = new RolesController();
    await assert.rejects(
      () => (ctl as any).updateUser(sa.id, { active: false }, req),
      (e: any) => e?.status === 403,
      'menonaktifkan SA oleh non-SA harus 403',
    );
    assert.equal(Number((await getUser(sa.id))?.active), 1);
  });

  it('Super Admin AKTIF TERAKHIR tidak bisa dinonaktifkan, bahkan oleh SA lain', async () => {
    const { sa, req } = await adminClient();
    // Pastikan hanya satu SA aktif di seluruh tabel untuk skenario ini.
    await db().execute(`UPDATE "user" SET active=0 WHERE role='Super Admin' AND id<>'${esc(sa.id)}'` as any);
    const ctl = new RolesController();
    await assert.rejects(
      () => (ctl as any).updateUser(sa.id, { active: false }, req),
      (e: any) => e?.status === 400 && e?.response?.code === 'LAST_SUPERADMIN',
      'menonaktifkan SA terakhir harus 400 LAST_SUPERADMIN',
    );
    assert.equal(Number((await getUser(sa.id))?.active), 1);
  });

  it('Super Admin AKTIF TERAKHIR tidak bisa diturunkan role-nya', async () => {
    const { sa, req } = await adminClient();
    await db().execute(`UPDATE "user" SET active=0 WHERE role='Super Admin' AND id<>'${esc(sa.id)}'` as any);
    const ctl = new RolesController();
    await assert.rejects(
      () => (ctl as any).updateUser(sa.id, { role: 'Viewer' }, req),
      (e: any) => e?.status === 400 && e?.response?.code === 'LAST_SUPERADMIN',
      'demote SA terakhir harus 400 LAST_SUPERADMIN',
    );
    assert.equal((await getUser(sa.id))?.role, 'Super Admin');
  });

  it('Super Admin tetap bisa mengelola user biasa (tidak over-block)', async () => {
    const { req } = await adminClient();
    const victim = await seedUser('Viewer', `biasa-${uniq()}@revota.id`);
    const ctl = new RolesController();
    const r: any = await (ctl as any).updateUser(victim.id, { role: 'Support' }, req);
    assert.equal(r?.ok, true);
    assert.equal((await getUser(victim.id))?.role, 'Support');
  });
});
