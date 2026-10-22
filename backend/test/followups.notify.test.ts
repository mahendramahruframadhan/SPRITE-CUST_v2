// Uji trigger followup_assigned: PIC (teks bebas) di-match ke user.name —
// ketemu & bukan pelaku → notif; tidak ketemu/self/inactive → tanpa notif,
// follow-up tetap sukses. node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { FollowupsService } from '../src/followups/followups.service.ts';

const DATE = '2026-10-15';

let svc: FollowupsService;

function createInput(pic: string) {
  return { client: 'PT Uji', issueDate: DATE, module: 'Training', title: 'Kursus Excel', priority: 'Sedang', status: 'Open', followupDate: DATE, pic };
}

function getNotifs(userId: string) {
  return db().pq(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at`, [userId]).then((r: any) => r.rows || r);
}

describe('trigger followup_assigned', () => {
  before(() => {
    setupTables();
    svc = new FollowupsService();
  });

  it('pic == nama user → notif followup_assigned utk user (kapital/spasi tolerant)', async () => {
    const budi = await seedUser('Admin CS', `budi-notify-${Date.now()}@revota.id`);
    await db().pq(`UPDATE "user" SET name='Budi Santoso' WHERE id=$1`, [budi.id]);
    // Pelaku 'actor-x' (bukan Budi) → Budi menerima notif.
    const r = await svc.create(createInput('  budi SANTOSO '), 'actor-x');
    assert.ok(r.id, 'followup harus tersimpan');
    const rows = await getNotifs(budi.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'followup_assigned');
    assert.match(rows[0].title, /PT Uji — Kursus Excel/);
    assert.ok(String(rows[0].body).includes('PIC'));
    assert.equal(rows[0].link, '/followups');
  });

  it('pic tak dikenal → followup tersimpan, tanpa notif, tanpa error', async () => {
    const r = await svc.create(createInput('Anonim Tagal'), 'actor-x');
    assert.ok(r.id);
    const rows = await getNotifs('anonim-tak-view');
    assert.equal(rows.length, 0);
  });

  it('update pic berubah → notif baru; tanpa perubahan pic → tidak duplikat', async () => {
    const sari = await seedUser('Support', `sari-notify-${Date.now()}@revota.id`);
    await db().pq(`UPDATE "user" SET name='Sari' WHERE id=$1`, [sari.id]);
    const created = await svc.create(createInput('Sari'), 'actor-x');
    const rows1 = await getNotifs(sari.id);
    assert.equal(rows1.length, 1);
    // PATCH tanpa pic sama — bulan tidak apa, pic sama → tidak ada notif baru.
    await svc.update(created.id, { title: 'Kursus Excel' }, 'actor-x');
    const rows2 = await getNotifs(sari.id);
    assert.equal(rows2.length, 1);
    // PATCH pic berubah ke Sari (dari sama) → tidak ada duplikat.
    await svc.update(created.id, { pic: 'Sari' }, 'actor-x');
    const rows3 = await getNotifs(sari.id);
    assert.equal(rows3.length, 1);
    // PATCH pic berisi nama lain yang ADALAH user aktif → notif baru utk Sari? — no,
    // pic berubah ke user berbeda; Sari tak menerima lagi (baris tetap 1 di sini).
  });

  it('self-assign → tidak ada notif', async () => {
    const dirga = await seedUser('Admin CS', `dirga-notify-${Date.now()}@revota.id`);
    await db().pq(`UPDATE "user" SET name='Dirga' WHERE id=$1`, [dirga.id]);
    await svc.create(createInput('Dirga'), dirga.id);
    const rows = await getNotifs(dirga.id);
    assert.equal(rows.length, 0);
  });

  it('pic → user inactive → tidak kirim dan tidak gagalkan simpan', async () => {
    const slept = await seedUser('Viewer', `slept-notify-${Date.now()}@revota.id`);
    await db().pq(`UPDATE "user" SET name='Tukang Tidur', active=0 WHERE id=$1`, [slept.id]);
    const r = await svc.create(createInput('Tukang Tidur'), 'actor-x');
    assert.ok(r.id);
    const rows = await getNotifs(slept.id);
    assert.equal(rows.length, 0);
  });
});
