// Uji guard PATCH tax: validasi ketat, kunci PAID, batas ON-CALL.
// node:test + pg-mem, DDL mandiri. Jangan edit helpers/pgmem.ts.
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, seedCase, db } from './helpers/pgmem.ts';
import { BillingController } from '../src/billing/billing.controller.ts';
import { AuthController } from '../src/auth/auth.controller.ts';

const UUID = 'tax-case-3';

async function superToken() {
  const ctl = new AuthController();
  const r: any = await ctl.signIn({ email: 'taxsa3@revota.id', password: 'password123' }, {});
  return r.token as string;
}
const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

async function setInvoice(uuid: string, status: string) {
  await db().execute(
    `INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ('${uuid}','${status}','${new Date().toISOString()}') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status` as any,
  );
}
async function setBilling(uuid: string, status: string) {
  await db().execute(`UPDATE assistance_records SET billing_status='${status}' WHERE record_uuid='${uuid}'` as any);
}

describe('tax guards', () => {
  let token: string;
  let ctl: BillingController;

  before(async () => {
    setupTables();
    await db().execute(
      `CREATE TABLE IF NOT EXISTS case_tax (record_uuid TEXT PRIMARY KEY, ppn_mode TEXT, ppn_percent REAL, ppn_amount INTEGER, pph INTEGER DEFAULT 0, updated_by TEXT, updated_at TEXT)` as any,
    );
    await db().execute(`ALTER TABLE assistance_records ADD COLUMN billing_status TEXT` as any);
    await seedUser('Super Admin', 'taxsa3@revota.id');
    await seedCase(UUID, '3', 'TAX-BRAND');
    await setBilling(UUID, 'ON-CALL');
    token = await superToken();
    ctl = new BillingController();
  });

  it('mode tak dikenal ditolak TAX_INVALID', async () => {
    await assert.rejects(() => ctl.tax(UUID, { ppn: { mode: 'manual', percent: 0, amount: 5 }, pph: false }, reqWith(token)), (e: any) => e?.response?.code === 'TAX_INVALID');
  });

  it('angka tak valid dan pph non-boolean ditolak TAX_INVALID', async () => {
    const bad = [
      { ppn: { mode: 'percent', percent: '10', amount: 0 }, pph: false },
      { ppn: { mode: 'percent', percent: 150, amount: 0 }, pph: false },
      { ppn: { mode: 'percent', percent: 0, amount: 0 }, pph: false },
      { ppn: { mode: 'rupiah', percent: 0, amount: 10.5 }, pph: false },
      { ppn: { mode: 'rupiah', percent: 0, amount: -5 }, pph: false },
      { ppn: null, pph: 'ya' },
    ];
    for (const b of bad) await assert.rejects(() => ctl.tax(UUID, b, reqWith(token)), (e: any) => e?.response?.code === 'TAX_INVALID');
  });

  it('baris PAID dikunci TAX_PAID_LOCKED', async () => {
    await setInvoice(UUID, 'PAID');
    await assert.rejects(() => ctl.tax(UUID, { ppn: null, pph: true }, reqWith(token)), (e: any) => e?.response?.code === 'TAX_PAID_LOCKED');
    await setInvoice(UUID, 'DIKIRIM');
  });

  it('baris non-ON-CALL ditolak TAX_NOT_ONCALL; uuid tak ada 404', async () => {
    await setBilling(UUID, 'MONTHLY');
    await assert.rejects(() => ctl.tax(UUID, { ppn: null, pph: true }, reqWith(token)), (e: any) => e?.response?.code === 'TAX_NOT_ONCALL');
    await setBilling(UUID, 'ON-CALL');
    await assert.rejects(() => ctl.tax('no-such-case', { ppn: null, pph: false }, reqWith(token)), (e: any) => e?.status === 404);
  });
});
