// Uji trigger audit_done: item bisa di-match ke user.name → notif saat
// audited=true; no match / self-assign / undo → tanpa notif, mark tetap
// sukses. node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession } from '../src/auth/session.ts';
import { AuditScheduleController } from '../src/popinava/audit-schedule.controller.ts';

const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

function weeksWith(items: any[]) {
  return { W1: items, W2: [], W3: [], W4: [], W5: [] };
}
function getNotifs(userId: string) {
  return db().pq(`SELECT * FROM notifications WHERE user_id=$1`, [userId]).then((r: any) => r.rows || r);
}

describe('trigger audit_done (Popi Nava mark)', () => {
  let ctl: AuditScheduleController;

  // Sesi pelaku berbeda dari user yang menerima notif.
  before(async () => {
    setupTables();
    ctl = new AuditScheduleController();
  });

  it('label item == nama user → 1 notif audit_done', async () => {
    const target = await seedUser('Viewer', `aud-t-${Date.now()}@revota.id`);
    await db().pq(`UPDATE "user" SET name='MAYOUTFIT' WHERE id=$1`, [target.id]);
    const actor = await seedUser('Super Admin', `aud-a-${Date.now()}@revota.id`);
    const token = await createSession(db(), actor.id);
    await ctl.put({ month: '2026-10', weeks: weeksWith([{ id: 'b1', type: 'brand', brand: 'MAYOUTFIT' }]) }, reqWith(token));
    const r: any = await ctl.mark({ month: '2026-10', weekKey: 'W1', itemId: 'b1', audited: true }, reqWith(token));
    assert.equal(r.ok, true, 'mark tetap sukses');
    const rows = await getNotifs(target.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'audit_done');
    assert.match(rows[0].title, /Audit MAYOUTFIT/);
    assert.match(String(rows[0].body), /menandai audit|ditandai audit untuk item/);
    assert.equal(rows[0].link, '/popinava');
  });

  it('label tidak match nama user → mark sukses, tanpa notif', async () => {
    const actor = await seedUser('Super Admin', `aud-c-${Date.now()}@revota.id`);
    const token = await createSession(db(), actor.id);
    await ctl.put({ month: '2026-11', weeks: weeksWith([{ id: 'o2', type: 'outlet', brand: 'XXX', name: 'Outlet Ngawur' }]) }, reqWith(token));
    const r: any = await ctl.mark({ month: '2026-11', weekKey: 'W1', itemId: 'o2', audited: true }, reqWith(token));
    assert.equal(r.ok, true);
    const total = await db().pq(`SELECT COUNT(*) AS c FROM notifications WHERE type='audit_done'`);
    assert.equal(Number((total.rows || total)[0]?.c || 0), 1, 'belum ada audit_done lain di file ini');
  });

  it('audited=false (undo) → tidak kirim notif', async () => {
    const target = await seedUser('Viewer', `aud-d-${Date.now()}@revota.id`);
    await db().pq(`UPDATE "user" SET name='LEWAT' WHERE id=$1`, [target.id]);
    const actor = await seedUser('Super Admin', `aud-e-${Date.now()}@revota.id`);
    const token = await createSession(db(), actor.id);
    await ctl.put({ month: '2026-12', weeks: weeksWith([{ id: 'o3', type: 'outlet', brand: 'XX', name: 'LEWAT' }]) }, reqWith(token));
    const r: any = await ctl.mark({ month: '2026-12', weekKey: 'W1', itemId: 'o3', audited: false }, reqWith(token));
    assert.equal(r.ok, true);
    const rows = await getNotifs(target.id);
    assert.equal(rows.length, 0);
  });
});
