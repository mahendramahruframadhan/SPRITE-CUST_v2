// Uji GET billing/tax-map — node:test + pg-mem, DDL mandiri.
// Jangan edit helpers/pgmem.ts (milik kerjaan orang lain); tabel case_tax
// dibuat di file ini. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, seedCase, db } from './helpers/pgmem.ts';
import { BillingController } from '../src/billing/billing.controller.ts';
import { AuthController } from '../src/auth/auth.controller.ts';

async function superToken() {
  const ctl = new AuthController();
  const r: any = await ctl.signIn({ email: 'taxsa@revota.id', password: 'password123' }, {});
  return r.token as string;
}
const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

describe('tax map', () => {
  let token: string;
  let ctl: BillingController;

  before(async () => {
    setupTables();
    await db().execute(
      `CREATE TABLE IF NOT EXISTS case_tax (record_uuid TEXT PRIMARY KEY, ppn_mode TEXT, ppn_percent REAL, ppn_amount INTEGER, pph INTEGER DEFAULT 0, updated_by TEXT, updated_at TEXT)` as any,
    );
    await seedUser('Super Admin', 'taxsa@revota.id');
    token = await superToken();
    ctl = new BillingController();
  });

  it('tax-map kosong saat tabel baru', async () => {
    const m: any = await ctl.taxMap();
    assert.equal(m.ok, true);
    assert.deepEqual(m.map, {});
  });

  it('tax-map memantulkan baris case_tax', async () => {
    await seedCase('tax-row-1', '1', 'TAX-BRAND');
    await db().execute(
      `INSERT INTO case_tax (record_uuid, ppn_mode, ppn_percent, ppn_amount, pph, updated_at) VALUES ('tax-row-1','percent',10,0,1,'x')` as any,
    );
    const m: any = await ctl.taxMap();
    assert.deepEqual(m.map['tax-row-1'], { ppn: { mode: 'percent', percent: 10, amount: 0 }, pph: true });
  });

  it('ppn_mode NULL dibaca sebagai ppn null', async () => {
    await seedCase('tax-row-2', '2', 'TAX-BRAND');
    await db().execute(
      `INSERT INTO case_tax (record_uuid, ppn_mode, ppn_percent, ppn_amount, pph, updated_at) VALUES ('tax-row-2',NULL,NULL,NULL,0,'x')` as any,
    );
    const m: any = await ctl.taxMap();
    assert.deepEqual(m.map['tax-row-2'], { ppn: null, pph: false });
  });
});
