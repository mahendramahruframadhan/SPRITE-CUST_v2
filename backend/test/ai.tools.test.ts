// Uji registry tool asisten AI (design 2026-10-23 langkah A.2): validasi
// argumen runTool + TOOL_SPECS. pg-mem in-memory, tanpa Postgres asli.
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, getMemDb } from '../src/db/drizzle.service.ts';
import { countCases } from '../src/ai/ai.queries.ts';
import { TOOL_SPECS, TOOL_NAMES, runTool } from '../src/ai/ai.tools.ts';

// DDL idempoten: jika test file lain di proses yang sama sudah membuat tabel
// ini dengan skema lebih lebar, IF NOT EXISTS membuatnya tidak menimpa.
// pg-mem melempar saat CREATE kembali untuk tabel yang sudah ada → ditolong.
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

async function seedToolDb() {
  const mem = getMemDb();
  for (const ddl of ddls) {
    try {
      mem.public.none(ddl);
    } catch {
      // pg-mem: CREATE ulang tabel yang sudah ada tidak didukung — abaikan.
    }
  }
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
    { record_uuid: 'ar-oncall-1', action: 'VALID - SIAP INVOICE' },
    { record_uuid: 'ar-oncall-2', action: 'VALID - SIAP INVOICE' },
    { record_uuid: 'ar-monthly', action: 'BELUM DIVALIDASI' },
    { record_uuid: 'ar-free', action: 'PERLU DICEK ULANG' },
  ];
  for (const a of audits) {
    await db.pq(`INSERT INTO audit_status (record_uuid, action, updated_at) VALUES ($1,$2,$3)`, [a.record_uuid, a.action, '2026-07-01']);
  }
  const invoices = [
    { record_uuid: 'ar-oncall-1', status: 'INVOICE TERBIT' },
    { record_uuid: 'ar-oncall-2', status: 'INVOICE TERBIT' },
    { record_uuid: 'ar-free', status: 'PAID' },
  ];
  for (const i of invoices) {
    await db.pq(`INSERT INTO invoice_status (record_uuid, status, updated_at) VALUES ($1,$2,$3)`, [i.record_uuid, i.status, '2026-07-01']);
  }
  return db;
}

describe('ai.tools — registry tool & validasi runTool', () => {
  let db: any;
  before(async () => {
    db = await seedToolDb();
  });

  it('TOOL_SPECS: 15 tool, function.name unik, sinkron TOOL_NAMES', () => {
    assert.equal(TOOL_SPECS.length, 15);
    assert.equal(new Set(TOOL_SPECS.map((s) => s.function.name)).size, 15);
    for (const s of TOOL_SPECS) {
      assert.equal(s.type, 'function');
      assert.ok(typeof s.function.description === 'string' && s.function.description.length > 0);
      assert.equal(s.function.parameters?.type, 'object');
    }
    assert.deepEqual([...TOOL_NAMES].sort(), [ ...TOOL_SPECS.map((s) => s.function.name) ].sort());
  });

  it('TOOL_SPECS: count_audit description memuat nilai action audit nyata + fallback tanpa filter status', () => {
    const spec: any = TOOL_SPECS.find((s) => s.function.name === 'count_audit');
    const desc = String(spec?.function?.description || '');
    assert.ok(desc.includes('BELUM DIVALIDASI'), `desc harus sebut BELUM DIVALIDASI: ${desc}`);
    assert.ok(desc.includes('VALID - SIAP INVOICE'), `desc harus sebut VALID - SIAP INVOICE: ${desc}`);
    assert.ok(desc.includes('PERLU DICEK ULANG'), `desc harus sebut PERLU DICEK ULANG: ${desc}`);
    assert.ok(/TANPA filter status/.test(desc), `desc harus fallback ke tanpa filter status: ${desc}`);
  });

  it('TOOL_SPECS: count_invoice description memuat nilai status invoice nyata + fallback tanpa filter status', () => {
    const spec: any = TOOL_SPECS.find((s) => s.function.name === 'count_invoice');
    const desc = String(spec?.function?.description || '');
    assert.ok(desc.includes('MENUNGGU INVOICE'), `desc harus sebut MENUNGGU INVOICE: ${desc}`);
    assert.ok(desc.includes('INVOICE TERBIT'), `desc harus sebut INVOICE TERBIT: ${desc}`);
    assert.ok(desc.includes('DIKIRIM'), `desc harus sebut DIKIRIM: ${desc}`);
    assert.ok(desc.includes('PAID'), `desc harus sebut PAID: ${desc}`);
    assert.ok(/TANPA filter status/.test(desc), `desc harus fallback ke tanpa filter status: ${desc}`);
  });

  it('runTool: tool tidak dikenal → error eksplisit', async () => {
    assert.deepEqual(await runTool(db, 'tool_aneh', {}), { error: 'tool tidak dikenal' });
  });

  it('runTool: metric di luar cases/charges → error memuat metric', async () => {
    const r: any = await runTool(db, 'get_top_clients', { metric: 'brand' });
    assert.ok(String(r.error).includes('metric'));
  });

  it('runTool: group_by di luar billing_status/status → error memuat group_by', async () => {
    const r: any = await runTool(db, 'case_totals', { group_by: 'client' });
    assert.ok(String(r.error).includes('group_by'));
  });

  it('runTool: month di luar 1-12 / non-angka → error', async () => {
    assert.ok((await runTool(db, 'count_cases', { month: 13 })).error);
    assert.ok((await runTool(db, 'count_cases', { month: 'x' })).error);
  });

  it('runTool: year di luar rentang → error', async () => {
    const r: any = await runTool(db, 'count_cases', { year: 2050 });
    assert.ok(String(r.error).includes('year'));
  });

  it('runTool: month tanpa year → pakai tahun berjalan', async () => {
    const r: any = await runTool(db, 'count_cases', { month: 7 });
    assert.deepEqual(r, { total: 2, period: `Juli ${new Date().getFullYear()}`, total_di_bulan: 2 });
  });

  it('runTool: billing_status case-insensitive, di luar daftar → error', async () => {
    const bad: any = await runTool(db, 'count_cases', { billing_status: 'nebeng' });
    assert.ok(String(bad.error).includes('billing_status'));
    // 'on-call' huruf kecil di-map ke 'ON-CALL' → 2 kasus di pg-mem
    const ok: any = await runTool(db, 'count_cases', { billing_status: 'on-call' });
    assert.equal(ok.total, 2);
    assert.equal(ok.period, 'seluruh periode');
  });

  it('runTool: limit besar di-clamp diam-diam (≤20) tetap sukses', async () => {
    const r: any = await runTool(db, 'get_top_clients', { metric: 'cases', limit: 99999 });
    assert.ok(!r.error);
    assert.deepEqual(r.items, [{ client: 'CLIENT-A', total: 3 }, { client: 'CLIENT-B', total: 1 }]);
    assert.equal(r.period, 'seluruh periode');
  });

  it('runTool: happy path count_cases + periode year-only (regresi Task 3)', async () => {
    assert.equal(await countCases(db, { period: { year: 2026 } }), 3);
    const all: any = await runTool(db, 'count_cases', {});
    assert.deepEqual(all, { total: 4, period: 'seluruh periode' });
    const y: any = await runTool(db, 'count_cases', { year: 2026 });
    assert.deepEqual(y, { total: 3, period: 'tahun 2026' });
  });

  it('runTool: happy path get_top_clients', async () => {
    const r: any = await runTool(db, 'get_top_clients', { metric: 'cases', limit: 1 });
    assert.deepEqual(r, { period: 'seluruh periode', items: [{ client: 'CLIENT-A', total: 3 }] });
  });

  it('runTool: happy path case_totals per status', async () => {
    const r: any = await runTool(db, 'case_totals', { group_by: 'status' });
    assert.equal(r.period, 'seluruh periode');
    assert.equal(r.groups.length, 2);
    assert.ok(r.groups.some((g: any) => g.label === 'DONE' && g.count === 3));
    assert.ok(r.groups.some((g: any) => g.label === 'OPEN' && g.count === 1));
  });

  it('runTool: happy path get_module_breakdown', async () => {
    const r: any = await runTool(db, 'get_module_breakdown', {});
    assert.equal(r.period, 'seluruh periode');
    assert.ok(r.items.some((i: any) => i.module === 'Modul X' && i.count === 3));
  });

  it('runTool: happy path count_audit dengan status', async () => {
    assert.deepEqual(await runTool(db, 'count_audit', { status: 'BELUM DIVALIDASI' }), { total: 1 });
    assert.deepEqual(await runTool(db, 'count_audit', { status: 'VALID - SIAP INVOICE' }), { total: 2 });
    assert.deepEqual(await runTool(db, 'count_audit', { status: 'PERLU DICEK ULANG' }), { total: 1 });
  });

  it('runTool: happy path count_invoice sum_amount', async () => {
    assert.deepEqual(await runTool(db, 'count_invoice', { sum_amount: true }), { total: 3, amount: 200000 });
    assert.deepEqual(await runTool(db, 'count_invoice', { status: 'INVOICE TERBIT', sum_amount: true }), { total: 2, amount: 200000 });
  });
});

// Perluasan lingkup 2026-10-26: validasi + happy path 9 tool baru.
describe('ai.tools — perluasan lingkup (9 tool baru)', () => {
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
    // Kasus pembanding dari describe pertama: seed ulang hanya bila memang belum ada
    const d0 = getDb();
    let known = false;
    try {
      const probe = await d0.pq(`SELECT 1 FROM assistance_records WHERE record_uuid = $1`, ['ar-oncall-1']);
      known = probe.rows.length > 0;
    } catch {
      known = false;
    }
    if (!known) await seedToolDb();
    const mem = getMemDb();
    for (const ddl of extraDdls) mem.public.none(ddl);
    const d = getDb();
    await d.pq(`DELETE FROM brand_statuses WHERE id LIKE 'bs-t-%'`, []);
    await d.pq(`DELETE FROM popinava_outlets WHERE uuid LIKE 'po-t-%'`, []);
    await d.pq(`DELETE FROM followups WHERE id LIKE 'fu-t-%'`, []);
    await d.pq(`DELETE FROM sync_logs WHERE id LIKE 'sl-t-%'`, []);
    await d.pq(
      `INSERT INTO brand_statuses (id, brand, type, monthly_fee, created_at) VALUES
       ('bs-t-1','Client T1','MONTHLY',50000,'2026-01-01'),
       ('bs-t-2','Client T2','GRATIS',0,'2026-01-01')`,
      [],
    );
    await d.pq(
      `INSERT INTO popinava_outlets (uuid, brand_name, rvt_custcode, dept_code, city) VALUES
       ('po-t-1','PoPi Nava','RVT-T1','D1','Bandung'),
       ('po-t-2','PoPi Nava','RVT-T2','D2','Jakarta')`,
      [],
    );
    await d.pq(
      `INSERT INTO followups (id, client_name, issue_date, module, title, followup_date, created_at, updated_at) VALUES
       ('fu-t-1','CLIENT-A','2026-10-01','TRAVICS!','TL','2026-10-05','2026-10-01','2026-10-01')`,
      [],
    );
    await d.pq(
      `INSERT INTO sync_logs (id, started_at, finished_at, status, rows_processed) VALUES ('sl-t-1','2026-10-26T02:00:00Z','2026-10-26T02:01:00Z','success',3)`,
      [],
    );
    await d.pq(
      `INSERT INTO audit_schedule (month, weeks, updated_by, updated_at) VALUES ('2026-12','["a","b"]','admin@revota.id','2026-10-26')
       ON CONFLICT (month) DO UPDATE SET weeks = EXCLUDED.weeks, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
      [],
    );
    await d.pq(
      `INSERT INTO app_config (key, value, updated_at) VALUES ('sheetConfig', $1, '2026-10-01')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify({ brands: ['X'], modules: ['X', 'Y'] })],
    );
    await d.pq(`DELETE FROM "user" WHERE id LIKE 'u-t-%'`, []);
    await d.pq(
      `INSERT INTO "user" (id, name, email, email_verified, role, active, created_at, updated_at) VALUES
       ('u-t-1','T Admin','t-admin@test.local',1,'Admin',1,'2026-10-01','2026-10-01'),
       ('u-t-2','T Viewer','t-viewer@test.local',1,'Viewer',0,'2026-10-01','2026-10-01')`,
      [],
    );
  });

  it('runTool: count_clients basis kasus/kontrak + validasi source', async () => {
    const d = getDb();
    assert.deepEqual(await runTool(d, 'count_clients', {}), { total: 2, basis: 'kasus' });
    assert.deepEqual(await runTool(d, 'count_clients', { source: 'kontrak' }), { total: 2, basis: 'kontrak' });
    const bad: any = await runTool(d, 'count_clients', { source: 'aneh' });
    assert.ok(String(bad.error).includes('source'));
  });

  it('runTool: happy path get_contract_breakdown', async () => {
    const d = getDb();
    const r: any = await runTool(d, 'get_contract_breakdown', {});
    assert.equal(r.total, 2);
    assert.equal(r.expiring, 0);
    assert.equal(r.nearestExpiry, null);
    assert.deepEqual(r.groups, [
      { label: 'GRATIS', count: 1, monthly_fee: 0 },
      { label: 'MONTHLY', count: 1, monthly_fee: 50000 },
    ]);
  });

  it('runTool: count_outlets total/per group + validasi group_by', async () => {
    const d = getDb();
    assert.deepEqual(await runTool(d, 'count_outlets', {}), { total: 2 });
    const r: any = await runTool(d, 'count_outlets', { group_by: 'city' });
    assert.equal(r.total, 2);
    assert.ok(Array.isArray(r.groups));
    const bad: any = await runTool(d, 'count_outlets', { group_by: ' Universe' });
    assert.ok(String(bad.error).includes('group_by'));
  });

  it('runTool: count_followups default status, open_only, validasi', async () => {
    const d = getDb();
    const r: any = await runTool(d, 'count_followups', {});
    assert.equal(r.total, 1);
    assert.equal(r.open, 1);
    assert.deepEqual(r.groups, [{ label: 'Open', count: 1 }]);
    const open: any = await runTool(d, 'count_followups', { open_only: true });
    assert.equal(open.total, 1);
    const prio: any = await runTool(d, 'count_followups', { group_by: 'priority' });
    assert.deepEqual(prio.groups, [{ label: 'Sedang', count: 1 }]);
    const bad: any = await runTool(d, 'count_followups', { group_by: 'brand' });
    assert.ok(String(bad.error).includes('group_by'));
  });

  it('runTool: get_support_breakdown per kategori (default), metrik charges, validasi', async () => {
    const d = getDb();
    const r: any = await runTool(d, 'get_support_breakdown', {});
    assert.equal(r.period, 'seluruh periode');
    assert.deepEqual(r.items, [
      { label: 'A', count: 3 },
      { label: 'B', count: 1 },
    ]);
    const ch: any = await runTool(d, 'get_support_breakdown', { metric: 'charges' });
    assert.deepEqual(ch.items, [
      { label: 'A', count: 3, charges: 200000 },
      { label: 'B', count: 1, charges: 50000 },
    ]);
    const badG: any = await runTool(d, 'get_support_breakdown', { group_by: 'client' });
    assert.ok(String(badG.error).includes('group_by'));
    const badM: any = await runTool(d, 'get_support_breakdown', { metric: 'Temperatur' });
    assert.ok(String(badM.error).includes('metric'));
    const badPeriod: any = await runTool(d, 'get_support_breakdown', { month: 13 });
    assert.ok(badPeriod.error);
  });

  it('runTool: happy path get_last_sync', async () => {
    const d = getDb();
    const r: any = await runTool(d, 'get_last_sync', {});
    assert.equal(r.sync.status, 'success');
    assert.equal(r.sync.rows, 3);
  });

  it('runTool: happy path master_totals (key array saja, urut abjad)', async () => {
    const d = getDb();
    const r: any = await runTool(d, 'master_totals', {});
    assert.deepEqual(r.groups, [
      { label: 'brands', count: 1 },
      { label: 'modules', count: 2 },
    ]);
  });

  it('runTool: count_users hanya angka + role (data pribadi tidak dilibatkan)', async () => {
    const d = getDb();
    const r: any = await runTool(d, 'count_users', {});
    assert.deepEqual(r, {
      total: 2,
      aktif: 1,
      roles: [
        { label: 'Admin', count: 1 },
        { label: 'Viewer', count: 1 },
      ],
    });
  });

  it('runTool: happy path get_audit_schedule (jumlah minggu dihitung)', async () => {
    const d = getDb();
    const r: any = await runTool(d, 'get_audit_schedule', {});
    assert.equal(r.schedule.month, '2026-12');
    assert.equal(r.schedule.weeks, 2);
  });
});
