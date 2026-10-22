// Uji trigger invoice_ready: validasi kasus ke VALID - SIAP INVOICE → notif
// untuk SEMUA user role Finance aktif; sekali per perubahan; status lain
// tidak kirim. node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession } from '../src/auth/session.ts';
import { BillingController } from '../src/billing/billing.controller.ts';

const UUID = 'notif-case-1';
const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

async function recipients() {
  const r = await db().pq(`SELECT user_id, title, body, link FROM notifications WHERE type='invoice_ready' ORDER BY created_at`);
  return r.rows || r;
}

describe('trigger invoice_ready (validasi billing)', () => {
  let ctl: BillingController;

  before(async () => {
    setupTables();
    await seedUser('Super Admin', `bill-sa-${Date.now()}@revota.id`);
    await seedUser('Finance', `bill-f1-${Date.now()}@revota.id`);
    await seedUser('Finance', `bill-f2-${Date.now()}@revota.id`);
    const idle = await seedUser('Finance', `bill-f3-${Date.now()}@revota.id`); // inactive
    await db().pq(`UPDATE "user" SET active=0 WHERE id=$1`, [idle.id]);
    await seedUser('Viewer', `bill-v-${Date.now()}@revota.id`);
    await db().pq(
      `INSERT INTO assistance_records (record_uuid, no, client) VALUES ('${UUID}','9','BILL-BRAND') ON CONFLICT (record_uuid) DO NOTHING`,
    );
    ctl = new BillingController();
  });

  it('valid → notif ke semua Finance aktif (title label kasus, link /billing)', async () => {
    const fin = await db().pq(`SELECT id FROM "user" WHERE role='Finance' AND COALESCE(active,1)=1`);
    const sa = await db().pq(`SELECT id FROM "user" WHERE role='Super Admin' LIMIT 1`);
    const token = await createSession(db(), (fin.rows || fin)[0]?.id || (sa.rows || sa)[0]?.id);
    const r: any = await ctl.audit(UUID, { action: 'VALID - SIAP INVOICE' }, reqWith(token));
    assert.equal(r.ok, true);
    const rows = await recipients();
    assert.equal(rows.length, 2, 'dua Finance aktif, inactive & non-Finance tidak');
    assert.match(rows[0].title, /BILL-BRAND/);
    assert.match(String(rows[0].body), /validasi|invoice/i);
    assert.equal(rows[0].link, '/billing');
  });

  it('re-validasi tanpa perubahan → tidak duplikat', async () => {
    const sa = await db().pq(`SELECT id FROM "user" WHERE role='Super Admin' LIMIT 1`);
    const token = await createSession(db(), (sa.rows || sa)[0]?.id);
    await ctl.audit(UUID, { action: 'VALID - SIAP INVOICE' }, reqWith(token));
    const rows = await recipients();
    assert.equal(rows.length, 2);
  });

  it('status lain (REVISI) → tidak kirim', async () => {
    const sa = await db().pq(`SELECT id FROM "user" WHERE role='Super Admin' LIMIT 1`);
    const token = await createSession(db(), (sa.rows || sa)[0]?.id);
    await ctl.audit(UUID, { action: 'REVISI' }, reqWith(token));
    const rows = await recipients();
    assert.equal(rows.length, 2);
  });
});
