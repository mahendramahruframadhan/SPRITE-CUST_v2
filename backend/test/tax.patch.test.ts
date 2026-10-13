// Uji PATCH cases/:uuid/tax alur sukses — node:test + pg-mem, DDL mandiri.
// Jangan edit helpers/pgmem.ts. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, seedCase, db } from './helpers/pgmem.ts';
import { BillingController } from '../src/billing/billing.controller.ts';
import { AuthController } from '../src/auth/auth.controller.ts';

const UUID = 'tax-case-1';

async function superToken() {
  const ctl = new AuthController();
  const r: any = await ctl.signIn({ email: 'taxsa2@revota.id', password: 'password123' }, {});
  return r.token as string;
}
const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

describe('tax patch sukses', () => {
  let token: string;
  let ctl: BillingController;

  before(async () => {
    setupTables();
    await db().execute(
      `CREATE TABLE IF NOT EXISTS case_tax (record_uuid TEXT PRIMARY KEY, ppn_mode TEXT, ppn_percent REAL, ppn_amount INTEGER, pph INTEGER DEFAULT 0, updated_by TEXT, updated_at TEXT)` as any,
    );
    await db().execute(`ALTER TABLE assistance_records ADD COLUMN billing_status TEXT` as any);
    await seedUser('Super Admin', 'taxsa2@revota.id');
    await seedCase(UUID, '1', 'TAX-BRAND');
    await db().execute(`UPDATE assistance_records SET billing_status='ON-CALL' WHERE record_uuid='${UUID}'` as any);
    token = await superToken();
    ctl = new BillingController();
  });

  it('simpan PPN persen + PPH lalu terbaca di map', async () => {
    const r: any = await ctl.tax(UUID, { ppn: { mode: 'percent', percent: 10, amount: 0 }, pph: true }, reqWith(token));
    assert.equal(r.ok, true);
    assert.deepEqual(r.tax, { ppn: { mode: 'percent', percent: 10, amount: 0 }, pph: true });
    const m: any = await ctl.taxMap();
    assert.deepEqual(m.map[UUID], r.tax);
  });

  it('tulis kedua menimpa tulisan pertama (last-write-wins)', async () => {
    await ctl.tax(UUID, { ppn: { mode: 'rupiah', percent: 0, amount: 5000 }, pph: false }, reqWith(token));
    await ctl.tax(UUID, { ppn: null, pph: true }, reqWith(token));
    const m: any = await ctl.taxMap();
    assert.deepEqual(m.map[UUID], { ppn: null, pph: true });
  });

  it('reset PPN menyimpan NULL dan menulis log activity', async () => {
    await ctl.tax(UUID, { ppn: null, pph: false }, reqWith(token));
    const n: any = await db().execute(`SELECT COUNT(*) as c FROM activity_logs WHERE record_uuid='${UUID}'` as any);
    assert.ok(Number((n.rows || n)[0]?.c || 0) >= 1);
  });
});
