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
  countClients,
  contractTotals,
  outletTotals,
  followupTotals,
  supportTotals,
  lastSync,
  masterTotals,
  userTotals,
  auditSchedule,
} from '../src/ai/ai.queries.ts';

// DDL idempoten: jika test file lain di proses yang sama sudah membuat tabel
// ini dengan skema lebih lebar, IF NOT EXISTS membuatnya tidak menimpa.
const ddls = [
  `CREATE TABLE IF NOT EXISTS assistance_records (record_uuid TEXT PRIMARY KEY, no TEXT, client TEXT, status TEXT, billing_status TEXT, charges NUMERIC, date_issue TEXT, module TEXT, support_category TEXT, support_type TEXT, channel_ticket TEXT)`,
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

// Perluasan lingkup 2026-10-26: master/kontrak, outlet, follow-up, support
// breakdown, sinkron, master konfigurasi, pengguna, jadwal audit.
describe('ai.queries — perluasan lingkup (agregat domain lain)', () => {
  let userBase = 0;
  const roleBase: Record<string, number> = {};
  const extraDdls = [
    `CREATE TABLE IF NOT EXISTS brand_statuses (id TEXT PRIMARY KEY, brand TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'MONTHLY', start_at TEXT, expired_at TEXT, monthly_fee INTEGER DEFAULT 0, pic TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS popinava_outlets (uuid TEXT PRIMARY KEY, brand_name TEXT NOT NULL, rvt_custcode TEXT NOT NULL, dept_code TEXT NOT NULL, city TEXT NOT NULL DEFAULT '', province TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS followups (id TEXT PRIMARY KEY, client_name TEXT NOT NULL, issue_date TEXT NOT NULL, module TEXT NOT NULL, title TEXT NOT NULL, description TEXT, priority TEXT NOT NULL DEFAULT 'Sedang', status TEXT NOT NULL DEFAULT 'Open', followup_date TEXT NOT NULL, pic TEXT, resolved_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sync_logs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, rows_processed INTEGER DEFAULT 0, error_message TEXT, source TEXT DEFAULT 'sheets')`,
    `CREATE TABLE IF NOT EXISTS audit_schedule (month TEXT PRIMARY KEY, weeks TEXT NOT NULL DEFAULT '{}', updated_by TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER DEFAULT 0, image TEXT, created_at TIMESTAMP, updated_at TIMESTAMP)`,
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Viewer'`,
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1`,
  ];

  before(async () => {
    const mem = getMemDb();
    for (const ddl of extraDdls) mem.public.none(ddl);
    const db = getDb();
    // Basis pengguna berasal dari init (diuji memakai delta agar deterministik)
    const baseUsers = await db.pq(`SELECT COUNT(*) AS c FROM "user"`, []);
    userBase = Number(baseUsers.rows[0]?.c ?? 0);
    const baseRoles = await db.pq(`SELECT role, COUNT(*) AS c FROM "user" WHERE role IN ('Admin','Viewer') GROUP BY role`, []);
    for (const r of baseRoles.rows) roleBase[String(r.role)] = Number(r.c);
    // Idempoten: bersihkan baris uji milik file ini sebelum insert ulang
    await db.pq(`DELETE FROM brand_statuses WHERE id LIKE 'bs-q-%'`, []);
    await db.pq(`DELETE FROM popinava_outlets WHERE uuid LIKE 'po-q-%'`, []);
    await db.pq(`DELETE FROM followups WHERE id LIKE 'fu-q-%'`, []);
    await db.pq(`DELETE FROM sync_logs WHERE id LIKE 'sl-q-%'`, []);
    await db.pq(`DELETE FROM audit_schedule`, []);
    await db.pq(`DELETE FROM "user" WHERE id LIKE 'u-q-%'`, []);
    // Kasus tambahan 1 client unik + 2 baris (untuk support breakdown & offset)
    await db.pq(`DELETE FROM assistance_records WHERE record_uuid = ANY($1)`, [['ar-sup-1', 'ar-sup-2']]);
    await db.pq(
      `INSERT INTO assistance_records (record_uuid, no, client, status, billing_status, charges, date_issue, module, support_category, support_type, channel_ticket) VALUES
       ('ar-sup-1','10','CLIENT-C','DONE','ON-CALL',70000,'20261005','Modul Z','PREVENT','BUG','WHATSAPP'),
       ('ar-sup-2','11','CLIENT-C','DONE','ON-CALL',30000,'20261018','Modul Z','SALAH','SRQ','EMAIL')`,
      [],
    );
    await db.pq(
      `INSERT INTO brand_statuses (id, brand, type, monthly_fee, expired_at, created_at) VALUES
       ('bs-q-1','Client Q','MONTHLY',1000000,'2026-12-31','2026-01-01'),
       ('bs-q-2','Client R','MONTHLY',500000,'','2026-01-01'),
       ('bs-q-3','Client S','GRATIS',0,'','2026-01-01')`,
      [],
    );
    await db.pq(
      `INSERT INTO popinava_outlets (uuid, brand_name, rvt_custcode, dept_code, city, province, region) VALUES
       ('po-q-1','PoPi Nava','RVT-1','D1','Bandung','Jawa Barat','Barat'),
       ('po-q-2','PoPi Nava','RVT-2','D2','Bandung','Jawa Barat','Barat'),
       ('po-q-3','PoPi Nava','RVT-3','D3','Jakarta','DKI Jakarta','Timur')`,
      [],
    );
    await db.pq(
      `INSERT INTO followups (id, client_name, issue_date, module, title, priority, status, followup_date, resolved_at, created_at, updated_at) VALUES
       ('fu-q-1','CLIENT-C','2026-10-01','TRAVICS!','Tindak lanjut','Tinggi','Open','2026-10-05','','2026-10-01','2026-10-01'),
       ('fu-q-2','CLIENT-A','2026-10-02','SALAH','Kasus lama','Sedang','Selesai','2026-10-06','2026-10-20','2026-10-02','2026-10-20')`,
      [],
    );
    await db.pq(
      `INSERT INTO sync_logs (id, started_at, finished_at, status, rows_processed, source) VALUES
       ('sl-q-1','2026-10-26T01:55:00Z','2026-10-26T01:56:00Z','success',5,'sheets'),
       ('sl-q-2','2026-10-26T02:00:00Z','2026-10-26T02:01:00Z','success',0,'sheets')`,
      [],
    );
    await db.pq(
      `INSERT INTO audit_schedule (month, weeks, updated_by, updated_at) VALUES ('2026-11','["Minggu 1","Minggu 2","Minggu 3","Minggu 4"]','admin@revota.id','2026-10-25')`,
      [],
    );
    await db.pq(
      `INSERT INTO app_config (key, value, updated_at) VALUES ('sheetConfig', $1, '2026-10-01')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify({ brands: ['A', 'B'], modules: ['X', 'Y', 'Z'], pricelist: [{ v: 'PL1' }], status: 'BUKAN ARRAY' })],
    );
    await db.pq(
      `INSERT INTO "user" (id, name, email, email_verified, role, active, created_at, updated_at) VALUES
       ('u-q-1','Q Admin','q-admin@test.local',1,'Admin',1,'2026-10-01','2026-10-01'),
       ('u-q-2','Q Admin2','q-admin2@test.local',1,'Admin',1,'2026-10-01','2026-10-01'),
       ('u-q-3','Q Viewer','q-viewer@test.local',1,'Viewer',0,'2026-10-01','2026-10-01')`,
      [],
    );
  });

  it('countClients: basis kasus (client unik) dan kontrak', async () => {
    const db = getDb();
    assert.equal(await countClients(db, { source: 'kasus' }), 3); // A, B, C
    assert.equal(await countClients(db, { source: 'kontrak' }), 3); // bs-q-1..3
    assert.equal(await countClients(db, {}), 3); // default kasus
  });

  it('contractTotals: total, per tipe, biaya bulanan, ber- expiry', async () => {
    const db = getDb();
    const r = await contractTotals(db);
    assert.equal(r.total, 3);
    assert.deepEqual(r.groups, [
      { type: 'GRATIS', count: 1, fee: 0 },
      { type: 'MONTHLY', count: 2, fee: 1500000 },
    ]);
    assert.equal(r.expiring, 1);
    assert.equal(r.nearestExpiry, '2026-12-31');
  });

  it('outletTotals: total dan per city/province/region', async () => {
    const db = getDb();
    assert.deepEqual(await outletTotals(db, {}), { total: 3 });
    const byCity = await outletTotals(db, { groupBy: 'city' });
    assert.equal(byCity.total, 3);
    assert.deepEqual(byCity.groups, [
      { label: 'Bandung', count: 2 },
      { label: 'Jakarta', count: 1 },
    ]);
  });

  it('followupTotals: total, belum selesai, per status/priority', async () => {
    const db = getDb();
    const byStatus = await followupTotals(db, { groupBy: 'status' });
    assert.equal(byStatus.total, 2);
    assert.equal(byStatus.open, 1);
    assert.deepEqual(byStatus.groups, [
      { label: 'Open', count: 1 },
      { label: 'Selesai', count: 1 },
    ]);
    const byPriority = await followupTotals(db, { groupBy: 'priority' });
    assert.deepEqual(byPriority.groups, [
      { label: 'Sedang', count: 1 },
      { label: 'Tinggi', count: 1 },
    ]);
  });

  it('supportTotals: per type/category, metrik cases & charges, periode', async () => {
    const db = getDb();
    const byType = await supportTotals(db, { groupBy: 'support_type' });
    assert.deepEqual(byType, [
      { label: 'SRQ', count: 3, charges: 80000 },
      { label: 'INC', count: 2, charges: 200000 },
      { label: 'BUG', count: 1, charges: 70000 },
    ]);
    const byCatCharges = await supportTotals(db, { groupBy: 'support_category', metric: 'charges' });
    assert.deepEqual(
      byCatCharges.map((i) => ({ label: i.label, charges: i.charges })),
      [
        { label: 'A', charges: 200000 },
        { label: 'PREVENT', charges: 70000 },
        { label: 'B', charges: 50000 },
        { label: 'SALAH', charges: 30000 },
      ],
    );
    const oct = await supportTotals(db, { groupBy: 'channel_ticket', period: { month: 10, year: 2026 } });
    // Hanya kasus Oktober (ar-sup-1, ar-sup-2) yang masuk hasil ini
    assert.deepEqual(
      oct.map((i) => ({ label: i.label, count: i.count })),
      [
        { label: 'EMAIL', count: 1 },
        { label: 'WHATSAPP', count: 1 },
      ],
    );
  });

  it('lastSync: baris terbaru menurut started_at', async () => {
    const db = getDb();
    const r = await lastSync(db);
    assert.ok(r);
    assert.equal(r.status, 'success');
    assert.ok(String(r.started_at).includes('02:00:00'));
  });

  it('masterTotals: hanya key array yang dihitung, urut abjad', async () => {
    const db = getDb();
    const r = await masterTotals(db);
    assert.deepEqual(r, [
      { label: 'brands', count: 2 },
      { label: 'modules', count: 3 },
      { label: 'pricelist', count: 1 },
    ]);
  });

  it('userTotals: delta terhadap basis init (tanpa data pribadi)', async () => {
    const db = getDb();
    const r = await userTotals(db);
    assert.equal(r.total, userBase + 3);
    assert.equal(r.active, r.total - 1);
    const admin = r.roles.find((x) => x.label === 'Admin');
    assert.equal(admin?.count, (roleBase['Admin'] || 0) + 2);
    const viewer = r.roles.find((x) => x.label === 'Viewer');
    assert.equal(viewer?.count, (roleBase['Viewer'] || 0) + 1);
  });

  it('auditSchedule: baris terseedi, jumlah minggu dihitung', async () => {
    const db = getDb();
    const r = await auditSchedule(db);
    assert.ok(r);
    assert.equal(r.month, '2026-11');
    assert.equal(r.weeks, 4);
  });
});
