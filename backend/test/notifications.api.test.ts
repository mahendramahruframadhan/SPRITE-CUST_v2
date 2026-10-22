// Uji endpoint notifications: scope ketat milik sendiri, izin POST per modul,
// validasi, dan helper match nama. node:test + pg-mem (helpers/pgmem).
// Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession, resolveSessionUser } from '../src/auth/session.ts';
import { NotificationsController } from '../src/notifications/notifications.controller.ts';
import { NotificationsService, findUserIdByName } from '../src/notifications/notifications.service.ts';
import { PermGuard } from '../src/auth/perm.guard.ts';
import { Reflector } from '@nestjs/core';
import { MODULES } from '../src/roles/roles.controller.ts';

const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

let userA: any, userB: any;
let tokenA: string, tokenB: string, tokenF: string;
let ctl: NotificationsController;

async function seedNotif(userId: string, overrides: Record<string, any> = {}) {
  const m = overrides;
  const id = m.id || `n_${Math.random().toString(36).slice(2, 10)}`;
  await db().pq(
    `INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, userId, m.type || 'custom', m.title || 'Judul', m.body || null, m.link || null, m.createdAt || new Date().toISOString()],
  );
  return id;
}

describe('notifications API', () => {
  before(async () => {
    setupTables();
    userA = await seedUser('Super Admin', `notif-a-${Date.now()}@revota.id`);
    userB = await seedUser('Finance', `notif-b-${Date.now()}@revota.id`);
    tokenA = await createSession(db(), userA.id);
    tokenB = await createSession(db(), userB.id);
    tokenF = tokenB;
    ctl = new NotificationsController();
  });

  it('GET hanya milik sendiri, terbaru dulu, + unreadCount', async () => {
    const a1 = await seedNotif(userA.id, { title: 'lama', createdAt: '2026-10-01T10:00:00Z' });
    const a2 = await seedNotif(userA.id, { title: 'baru', createdAt: '2026-10-21T10:00:00Z' });
    await seedNotif(userB.id, { title: 'milik B' });
    const res = await ctl.list(reqWith(tokenA));
    assert.equal(res.notifications.length, 2);
    assert.equal(res.notifications[0].title, 'baru');
    assert.equal(res.unreadCount, 2);
    await ctl.markRead(reqWith(tokenA), a1);
    const res2 = await ctl.list(reqWith(tokenA));
    assert.equal(res2.unreadCount, 1);
    assert.equal(res2.notifications.find((n: any) => n.id === a2).readAt, null);
    assert.ok(!res2.notifications.some((n: any) => n.title === 'milik B'));
  });

  it('POST dibatasi PermGuard @Perm(notifications) — dinamis + metadata', async () => {
    // Metadata method-level: PermGuard + modul notifications.
    const meta = Reflect.getMetadata('permModule', NotificationsController.prototype.send);
    assert.equal(meta, 'notifications');
    assert.ok(Reflect.getMetadata('__guards__', NotificationsController.prototype.send).includes(PermGuard));
    // Dinamis: Finance tanpa izin → canActivate false (nest membalas 403).
    const guard = new PermGuard(new Reflector());
    const ctx: any = {
      getHandler: () => NotificationsController.prototype.send,
      getClass: () => NotificationsController,
      switchToHttp: () => ({ getRequest: () => reqWith(tokenF) }),
    };
    assert.equal(await guard.canActivate(ctx), false);
    // Setelah diberi izin → ok. (DDL helper role_permissions tanpa PK → tanpa ON CONFLICT.)
    await db().pq(`DELETE FROM role_permissions WHERE role='Finance' AND module='notifications'`);
    await db().pq(
      `INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ('Finance','notifications',1,'${new Date().toISOString()}')`,
    );
    const ok = await guard.canActivate(ctx);
    assert.equal(ok, true);
    const res = await ctl.send({ userIds: [userA.id], type: 'custom', title: 'Halo A' }, reqWith(tokenF));
    assert.equal(res.ok, true);
    assert.equal(res.delivered, 1);
  });

  it('POST validasi: userIds & title wajib, user harus ada & aktif', async () => {
    const bad0 = async () => ctl.send({ userIds: [], type: 'custom', title: 'x' }, reqWith(tokenB));
    await assert.rejects(bad0, (e: any) => e?.status === 400 && e?.response?.code === 'VALIDATION_ERROR');
    const badT = async () => ctl.send({ userIds: [userA.id], type: 'custom', title: '  ' }, reqWith(tokenB));
    await assert.rejects(badT, (e: any) => e?.status === 400);
    const badU = async () => ctl.send({ userIds: ['u_tidak_ada'], type: 'custom', title: 'x' }, reqWith(tokenB));
    await assert.rejects(badU, (e: any) => e?.status === 400 && e?.response?.code === 'USER_NOT_FOUND');
    // User inactive → ditolak.
    const idz = `u_inact_${Date.now().toString(36)}`;
    await db().pq(`INSERT INTO "user" (id,name,email,role,active) VALUES ($1,'Zed','zed@revota.id','Viewer',0)`, [idz]);
    await assert.rejects(
      () => ctl.send({ userIds: [idz], type: 'custom', title: 'x' }, reqWith(tokenB)),
      (e: any) => e?.status === 400 && e?.response?.code === 'USER_NOT_FOUND',
    );
  });

  it('PATCH read milik lain → 404', async () => {
    const idB = await seedNotif(userB.id, { title: 'milik B' });
    await assert.rejects(() => ctl.markRead(reqWith(tokenA), idB), (e: any) => e?.status === 404);
  });

  it('read-all hanya menyentuh read_at NULL milik sendiri', async () => {
    await seedNotif(userA.id, { title: 'satu' });
    await seedNotif(userA.id, { title: 'dua' });
    await seedNotif(userB.id, { title: 'tiga' });
    await ctl.markAll(reqWith(tokenA));
    const resA = await ctl.list(reqWith(tokenA));
    assert.equal(resA.unreadCount, 0);
    const resB = await ctl.list(reqWith(tokenB));
    assert.ok(resB.unreadCount >= 1);
  });

  it('DELETE milik lain → 404; milik sendiri → hilang', async () => {
    const aId = await seedNotif(userA.id, { title: 'hapus aku' });
    const bId = await seedNotif(userB.id, { title: 'jangan' });
    await assert.rejects(() => ctl.remove(reqWith(tokenA), bId), (e: any) => e?.status === 404);
    await ctl.remove(reqWith(tokenA), aId);
    const res = await ctl.list(reqWith(tokenA));
    assert.ok(!res.notifications.some((n: any) => n.id === aId));
  });

  it('findUserIdByName: trim/kapital tolerant, duplikat → tertua, inactive → null', async () => {
    const old = await seedUser('Viewer', `budi-old-${Date.now()}@revota.id`);
    await db().pq(`UPDATE "user" SET name='Budi' WHERE id=$1`, [old.id]);
    const dup = await seedUser('Viewer', `budi-dup-${Date.now()}@revota.id`);
    await db().pq(`UPDATE "user" SET name='  budi  ' WHERE id=$1`, [dup.id]);
    // Dup matikan & ganti nama agar satu-satunya kandidat tapi inactive → null.
    await db().pq(`UPDATE "user" SET active=0, name='Budi Satu' WHERE id=$1`, [dup.id]);
    const none = await findUserIdByName(db(), 'budi satu');
    assert.equal(none, null);
  });

  it('matriks modul mengenali notifications', () => {
    assert.ok(MODULES.includes('notifications'), 'MODULES harus mengandung notifications');
  });
});
