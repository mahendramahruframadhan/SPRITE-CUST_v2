// Uji lapisan query agregat read-only untuk tool asisten AI (langkah A.2
// design 2026-10-23): angka kasus/billing/klien/modul/audit/invoice via db.pq.
// pg-mem in-memory, tanpa Postgres asli. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, getMemDb } from '../src/db/drizzle.service.ts';
import {
  countCases,
  caseTotals,
  topClients,
  moduleBreakdown,
  countAudit,
  countInvoice,
  periodLabel,
  ymValue,
} from '../src/ai/ai.queries.ts';

// DDL idempoten: jika test file lain di proses yang sama sudah membuat tabel
// ini dengan skema lebih lebar, IF NOT EXISTS membuatnya tidak menimpa.
const ddls = [
  `CREATE TABLE IF NOT EXISTS assistance_records (record_uuid TEXT PRIMARY KEY, no TEXT, client TEXT, status TEXT, billing_status TEXT, charges NUMERIC, date_issue TEXT, module TEXT, support_category TEXT, support_type TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_status (record_uuid TEXT PRIMARY KEY, action TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS invoice_status (record_uuid TEXT PRIMARY KEY, status TEXT, updated_at TEXT)`,
];

const seedCases = [
  // 2 kasus ON-CALL Juli 2026 — basis angka 200.000 untuk CLIENT-A
  { record_uuid: 'ar-oncall-1', no: '1', client: 'CLIENT-A', status: 'DONE', billing_status: 'ON-CALL', charges: 100000, date_issue: '20260715', module: 'Modul X', support_category: 'A', support_type: 'INC' },
  { record_uuid: 'ar-oncall-2', no: '2', client: 'CLIENT-A', status: 'DONE', billing_status: 'ON-CALL', charges: 100000, date_issue: '20260720', module: 'Modul X', support_category: 'A', support_type: 'INC' },
  // 1 kasus MONTHLY Agustus 2026 — CLIENT-B
  { record_uuid: 'ar-monthly', no: '3', client: 'CLIENT-B', status: 'DONE', billing_status: 'MONTHLY', charges: 50000, date_issue: '20260810', module: 'Modul Y', support_category: 'B', support_type: 'SRQ' },
  // 1 kasus FREE September 2025 — CLIENT-A
  { record_uuid: 'ar-free', no: '4', client: 'CLIENT-A', status: 'OPEN', billing_status: 'FREE', charges: 0, date_issue: '20250912', module: 'Modul X', support_category: 'A', support_type: 'SRQ' },
];

describe('ai.queries — query agregat read-only tool asisten', () => {
  before(async () => {
    const mem = getMemDb();
    for (const ddl of ddls) mem.public.none(ddl);
    const db = getDb();
    // seed idempoten: hapus dulu baris uji milik file ini agar insert kembali
    const ids = seedCases.map((c) => c.record_uuid);
    await db.pq(`DELETE FROM assistance_records WHERE record_uuid = ANY($1)`, [ids]);
    await db.pq(`DELETE FROM audit_status WHERE record_uuid = ANY($1)`, [ids]);
    await db.pq(`DELETE FROM invoice_status WHERE record_uuid = ANY($1)`, [ids]);
    for (const c of seedCases) {
      await db.pq(
        `INSERT INTO assistance_records (record_uuid, no, client, status, billing_status, charges, date_issue, module, support_category, support_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [c.record_uuid, c.no, c.client, c.status, c.billing_status, c.charges, c.date_issue, c.module, c.support_category, c.support_type],
      );
    }
    const audits = [
      { record_uuid: 'ar-oncall-1', action: 'AUDITEE' },
      { record_uuid: 'ar-oncall-2', action: 'AUDITEE' },
      { record_uuid: 'ar-monthly', action: 'AUDITEE' },
      { record_uuid: 'ar-free', action: 'APPROVALS' },
    ];
    for (const a of audits) {
      await db.pq(`INSERT INTO audit_status (record_uuid, action, updated_at) VALUES ($1,$2,$3)`, [a.record_uuid, a.action, '2026-07-01']);
    }
    const invoices = [
      { record_uuid: 'ar-oncall-1', status: 'BILLED' },
      { record_uuid: 'ar-oncall-2', status: 'BILLED' },
      { record_uuid: 'ar-free', status: 'PAID' },
    ];
    for (const i of invoices) {
      await db.pq(`INSERT INTO invoice_status (record_uuid, status, updated_at) VALUES ($1,$2,$3)`, [i.record_uuid, i.status, '2026-07-01']);
    }
  });

  it('countCases: semuanya, filter status, billing_status, dan periode', async () => {
    const db = getDb();
    assert.equal(await countCases(db, {}), 4);
    assert.equal(await countCases(db, { billingStatus: 'ON-CALL' }), 2);
    assert.equal(await countCases(db, { period: { month: 7, year: 2026 } }), 2);
    assert.equal(await countCases(db, { status: 'DONE' }), 3);
    assert.equal(await countCases(db, { status: 'DONE', period: { month: 8, year: 2026 } }), 1);
  });

  it('caseTotals: kelompok billing_status dan status, label NULL pakai —', async () => {
    const db = getDb();
    const byBilling = await caseTotals(db, { groupBy: 'billing_status' });
    assert.deepEqual(
      byBilling.map((r) => ({ label: r.label, count: r.count, charges: Number(r.charges) })),
      [
        { label: 'ON-CALL', count: 2, charges: 200000 },
        { label: 'MONTHLY', count: 1, charges: 50000 },
        { label: 'FREE', count: 1, charges: 0 },
      ],
    );
    const byStatus = await caseTotals(db, { groupBy: 'status' });
    assert.deepEqual(
      byStatus.map((r) => ({ label: r.label, count: r.count, charges: Number(r.charges) })),
      [
        { label: 'DONE', count: 3, charges: 250000 },
        { label: 'OPEN', count: 1, charges: 0 },
      ],
    );
  });

  it('topClients: metrik kasus dan charges, limit dipatuhi', async () => {
    const db = getDb();
    assert.deepEqual(await topClients(db, { metric: 'cases', limit: 2 }), [
      { client: 'CLIENT-A', total: 3 },
      { client: 'CLIENT-B', total: 1 },
    ]);
    assert.deepEqual(await topClients(db, { metric: 'charges', limit: 1 }), [{ client: 'CLIENT-A', total: 200000 }]);
  });

  it('moduleBreakdown: jumlah kasus per modul', async () => {
    const db = getDb();
    assert.deepEqual(await moduleBreakdown(db), [
      { module: 'Modul X', count: 3 },
      { module: 'Modul Y', count: 1 },
    ]);
  });

  it('countAudit: total dan per action', async () => {
    const db = getDb();
    assert.equal(await countAudit(db, {}), 4);
    assert.equal(await countAudit(db, { status: 'AUDITEE' }), 3);
  });

  it('countInvoice: total, per status, dan amount = SUM(charges) via JOIN', async () => {
    const db = getDb();
    assert.deepEqual(await countInvoice(db, {}), { total: 3 });
    assert.deepEqual(await countInvoice(db, { status: 'BILLED' }), { total: 2 });
    assert.deepEqual(await countInvoice(db, { sumAmount: true }), { total: 3, amount: 200000 });
    assert.deepEqual(await countInvoice(db, { status: 'BILLED', sumAmount: true }), { total: 2, amount: 200000 });
  });

  it('ymValue: bulan+tahun, bulan saja pakai tahun berjalan, tanpa bulan → null', () => {
    assert.equal(ymValue({}), null);
    assert.equal(ymValue({ month: 7, year: 2026 }), '202607');
    assert.equal(ymValue({ month: 7 }), `${new Date().getFullYear()}07`);
  });

  it('periodLabel: label manusiawi untuk periode', () => {
    assert.equal(periodLabel({}), 'seluruh periode');
    assert.equal(periodLabel({ month: 7, year: 2026 }), 'Juli 2026');
    assert.equal(periodLabel({ year: 2026 }), 'tahun 2026');
  });
});
