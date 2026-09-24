// Uji alur audit + invoice + audit-map — node:test bawaan, pg-mem.
// Menangkap kontrak P0-2 (audit-map) dan mesin status invoice 4-langkah.
// Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, seedCase, db } from './helpers/pgmem.ts';
import { BillingController } from '../src/billing/billing.controller.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { esc } from '../src/db/sql.ts';

const UUID = 'flow-case-1';

async function superToken() {
  const ctl = new AuthController();
  const r: any = await ctl.signIn({ email: 'flowsa@revota.id', password: 'password123' }, {});
  return r.token as string;
}
const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });
async function actionOf(uuid: string) {
  const r: any = await db().execute(`SELECT action FROM audit_status WHERE record_uuid='${esc(uuid)}'` as any);
  return (r.rows || r)[0]?.action;
}
async function invoiceOf(uuid: string) {
  const r: any = await db().execute(`SELECT status FROM invoice_status WHERE record_uuid='${esc(uuid)}'` as any);
  return (r.rows || r)[0]?.status;
}
async function setInvoice(uuid: string, status: string) {
  await db().execute(
    `INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ('${esc(uuid)}','${esc(status)}','${new Date().toISOString()}') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status` as any,
  );
}

describe('billing flow', () => {
  let token: string;
  let ctl: BillingController;

  before(async () => {
    setupTables();
    await seedUser('Super Admin', 'flowsa@revota.id');
    await seedCase(UUID, '99', 'FLOW-BRAND');
    token = await superToken();
    ctl = new BillingController();
  });

  it('audit-map memantulkan hasil PATCH audit (P0-2)', async () => {
    await ctl.audit(UUID, { action: 'VALID - SIAP INVOICE' }, reqWith(token));
    assert.equal(await actionOf(UUID), 'VALID - SIAP INVOICE');
    const m: any = await ctl.auditMap();
    assert.equal(m.ok, true);
    assert.equal(m.map[UUID], 'VALID - SIAP INVOICE');
  });

  it('DIKIRIM hanya dari TERBIT; MENUNGGU manual ditolak', async () => {
    await setInvoice(UUID, 'MENUNGGU INVOICE');
    await assert.rejects(() => ctl.invoice(UUID, { status: 'DIKIRIM' }, reqWith(token)), (e: any) => e?.response?.code === 'NOT_TERBIT_YET');
    await assert.rejects(() => ctl.invoice(UUID, { status: 'MENUNGGU INVOICE' }, reqWith(token)), (e: any) => e?.response?.code === 'INVOICE_AUTO_LOCKED');
    await setInvoice(UUID, 'INVOICE TERBIT');
    const r: any = await ctl.invoice(UUID, { status: 'DIKIRIM' }, reqWith(token));
    assert.equal(r.status, 'DIKIRIM');
    assert.equal(await invoiceOf(UUID), 'DIKIRIM');
  });

  it('PAID wajib PDF + notes; urutan salah ditolak', async () => {
    await setInvoice(UUID, 'INVOICE TERBIT');
    await assert.rejects(() => ctl.invoice(UUID, { status: 'PAID', paymentNote: 'x' }, reqWith(token)), (e: any) => e?.response?.code === 'NOT_DIKIRIM_YET');
    await setInvoice(UUID, 'DIKIRIM');
    // tanpa PDF dan tanpa notes → cek PDF dulu (INVOICE_NEED_PDF)
    await assert.rejects(() => ctl.invoice(UUID, { status: 'PAID' }, reqWith(token)), (e: any) => e?.response?.code === 'INVOICE_NEED_PDF');
    // dengan PDF tapi tanpa notes → PAYMENT_NOTE_REQUIRED
    const now = new Date().toISOString();
    await db().execute(
      `INSERT INTO invoice_pdfs (id, record_uuid, filename, storage_key, size_bytes, status, uploaded_by, created_at, updated_at) VALUES ('pdf-t3','${UUID}','inv.pdf','k/t3',100,'completed','t','${now}','${now}')` as any,
    );
    await assert.rejects(() => ctl.invoice(UUID, { status: 'PAID' }, reqWith(token)), (e: any) => e?.response?.code === 'PAYMENT_NOTE_REQUIRED');
  });

  it('PAID sukses dengan PDF completed + notes; undo satu langkah', async () => {
    await setInvoice(UUID, 'DIKIRIM');
    await db().execute(
      `INSERT INTO invoice_pdfs (id, record_uuid, filename, storage_key, size_bytes, status, uploaded_by, created_at, updated_at) VALUES ('pdf-1','${UUID}','inv.pdf','k/1',100,'completed','t','${new Date().toISOString()}','${new Date().toISOString()}')` as any,
    );
    const r: any = await ctl.invoice(UUID, { status: 'PAID', paymentNote: 'transfer lunas' }, reqWith(token));
    assert.equal(r.status, 'PAID');
    assert.equal(await invoiceOf(UUID), 'PAID');
    const undo: any = await ctl.invoice(UUID, { status: 'DIKIRIM' }, reqWith(token));
    assert.equal(undo.status, 'DIKIRIM');
  });
});
