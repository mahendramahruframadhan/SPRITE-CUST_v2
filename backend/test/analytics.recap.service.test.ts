// Uji RecapService 10 tab: agregasi kasus, kontrak, POPI NAVA, follow-up,
// aktivitas, dan data quality. node:test + pg-mem.
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, db } from './helpers/pgmem.ts';
import { esc } from '../src/db/sql.ts';
import { AnalyticsService } from '../src/analytics/analytics.service.ts';
import { RecapService } from '../src/analytics/recap.service.ts';

async function addTables() {
  const ddls = [
    `CREATE TABLE IF NOT EXISTS case_tax (record_uuid TEXT PRIMARY KEY, ppn_mode TEXT, ppn_percent REAL, ppn_amount INTEGER, pph INTEGER DEFAULT 0, updated_by TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, brand TEXT NOT NULL, company TEXT, pic TEXT, contact TEXT, joined_at TEXT, source TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS brand_statuses (id TEXT PRIMARY KEY, brand TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'MONTHLY', start_at TEXT, expired_at TEXT, monthly_fee INTEGER DEFAULT 0, pic TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS sync_logs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, rows_processed INTEGER DEFAULT 0, error_message TEXT, source TEXT DEFAULT 'sheets')`,
    `CREATE TABLE IF NOT EXISTS audit_shots (id TEXT PRIMARY KEY, dept_uuid TEXT NOT NULL, slot TEXT NOT NULL, filename TEXT NOT NULL, storage_key TEXT UNIQUE, size_bytes INTEGER DEFAULT 0, content_type TEXT, status TEXT NOT NULL DEFAULT 'uploading', uploaded_by TEXT, created_at TEXT NOT NULL, updated_at TEXT)`,
  ];
  for (const ddl of ddls) await db().execute(ddl as any);
  for (const col of [
    'date_issue TEXT',
    'start_date TEXT',
    'finish_date TEXT',
    'charges INTEGER DEFAULT 0',
    'billing_status TEXT',
    'module TEXT',
    'sub_module TEXT',
    'issue TEXT',
    'pic_name TEXT',
    'assign_to TEXT',
    'status TEXT',
    'support_category TEXT',
    'support_type TEXT',
    'channel_ticket TEXT',
    'billing_category TEXT',
    'group_kpi TEXT',
  ]) {
    try {
      await db().execute(`ALTER TABLE assistance_records ADD COLUMN ${col}` as any);
    } catch {
      // sudah ada
    }
  }
}

async function seedCase(r: any) {
  const no = r.no ?? r.uuid;
  await db().execute(
    `INSERT INTO assistance_records (record_uuid,no,client,date_issue,charges,billing_status,module,sub_module,issue,pic_name,assign_to,status,support_category,support_type,channel_ticket,billing_category,group_kpi)
     VALUES ('${esc(r.uuid)}','${esc(no)}','${esc(r.client)}','${esc(r.dateIssue)}',${r.charges ?? 0},'${esc(r.billing ?? '')}','${esc(r.module ?? '')}','${esc(r.subModule ?? 'M-SUB')}','issue','pic','${esc(r.assign ?? '')}','${esc(r.status ?? 'DONE')}','SERVICE','SUPPORT TYPE - C','WHATSAPP','SERVICE','• GENERAL REQUEST')` as any,
  );
  if (!r.skipAudit) {
    await db().execute(
      `INSERT INTO audit_status (record_uuid,action,updated_at) VALUES ('${esc(r.uuid)}','${esc(r.audit ?? 'BELUM DIVALIDASI')}','x')` as any,
    );
  }
  await db().execute(
    `INSERT INTO invoice_status (record_uuid,status,updated_at,payment_note) VALUES ('${esc(r.uuid)}','${esc(r.invoice ?? 'MENUNGGU INVOICE')}','x',${r.paymentNote ? `'${esc(r.paymentNote)}'` : 'NULL'})` as any,
  );
  await db().execute(
    `INSERT INTO case_tax (record_uuid,ppn_mode,ppn_percent,ppn_amount,pph,updated_at) VALUES ('${esc(r.uuid)}',${r.ppnMode ? `'${esc(r.ppnMode)}'` : 'NULL'},${r.ppnPercent ?? 'NULL'},${r.ppnAmount ?? 'NULL'},0,'x')` as any,
  );
}

function todayShift(days: number): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + days * 86400000);
  return d.toISOString().slice(0, 10);
}

describe('RecapService 10 tab', () => {
  let recap: any;

  before(async () => {
    setupTables();
    await addTables();

    await seedCase({ uuid: 'c1', no: '100', client: 'BRAND-A', dateIssue: '20261101', charges: 1000000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', invoice: 'PAID', assign: 'Rama', status: 'DONE', ppnMode: 'percent', ppnPercent: 11 });
    await seedCase({ uuid: 'c2', no: '101', client: 'BRAND-A', dateIssue: '20261102', charges: 500000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', invoice: 'INVOICE TERBIT', assign: 'rama ', status: 'OPEN', ppnMode: 'rupiah', ppnAmount: 50000 });
    await seedCase({ uuid: 'c3', no: '102', client: 'BRAND-B', dateIssue: '20261103', charges: 2000000, billing: 'MONTHLY', module: 'M2', assign: 'EDU', status: 'DONE', invoice: 'PAID' });
    await seedCase({ uuid: 'c4', no: '103', client: 'BRAND-B', dateIssue: '20261104', billing: 'FREE', module: 'M2', assign: '', status: 'DONE' });
    await seedCase({ uuid: 'c5', no: '104', client: 'BRAND-C', dateIssue: '20261105', billing: '', module: 'M3', assign: 'ANDRI', status: 'OPEN' });
    await seedCase({ uuid: 'c6', no: '105', client: 'BRAND-C', dateIssue: '20261106', charges: 0, billing: 'ON-CALL', module: 'M3', audit: 'VALID - SIAP INVOICE', invoice: 'DIKIRIM', assign: 'ANDRI', status: 'DONE' });
    await seedCase({ uuid: 'c7', no: '106', client: 'BRAND-A', dateIssue: '20261015', charges: 300000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', invoice: 'PAID', assign: 'EDU', status: 'DONE', ppnMode: 'percent', ppnPercent: 11 });
    await seedCase({ uuid: 'c8', no: '107', client: 'BRAND-B', dateIssue: '20261131', billing: 'FREE', module: 'M2', assign: 'EDU', status: 'DONE', skipAudit: true });
    await seedCase({ uuid: 'c9', no: '100', client: 'BRAND-A', dateIssue: '20261101', billing: 'FREE', module: 'M1', assign: 'Rama', status: 'DONE' });

    await db().execute(`INSERT INTO clients (id,brand,created_at) VALUES ('cl1','BRAND-A','x'),('cl2','BRAND-B','x')` as any);
    await db().execute(
      `INSERT INTO brand_statuses (id,brand,type,start_at,expired_at,monthly_fee,pic,created_at,updated_at) VALUES
       ('bs1','BRAND-A','MONTHLY','2026-01-01','2025-01-01',900000,'A','x','2026-01-01T00:00:00.000Z'),
       ('bs2','BRAND-A','MONTHLY','2026-01-01','2026-12-01',1000000,'A','x','2026-06-01T00:00:00.000Z'),
       ('bs3','BRAND-B','GRATIS','2026-01-01','2026-10-01',0,'B','x','2026-01-01T00:00:00.000Z')` as any,
    );

    await db().execute(
      `INSERT INTO popinava_outlets (uuid,brand_name,rvt_custcode,dept_code,dept_name,status) VALUES
       ('o1','BRAND-A','R1','D1','Outlet 1','active'),
       ('o2','BRAND-A','R2','D2','Outlet 2','active'),
       ('o3','BRAND-B','R3','D3','Outlet 3','inactive')` as any,
    );
    await db().execute(
      `INSERT INTO audit_schedule (month,weeks,updated_at) VALUES ('2026-12','${esc(JSON.stringify({ W1: [{ id: 's1', type: 'brand', brand: 'BRAND-A', audited: true }], W2: [{ id: 's2', type: 'outlet', uuid: 'o3' }], W3: [{ id: 's3', type: 'brand', brand: 'BRAND-B', audited: true }] }))}','x')` as any,
    );
    await db().execute(
      `INSERT INTO audit_shots (id,dept_uuid,slot,filename,storage_key,created_at) VALUES
       ('sh1','o1','W1','a.jpg','k1','2026-12-02T10:00:00.000Z'),
       ('sh2','o2','W1','b.jpg','k2','2026-10-02T10:00:00.000Z')` as any,
    );

    await db().execute(
      `INSERT INTO followups (id,client_name,issue_date,module,title,priority,status,followup_date,pic,created_at,updated_at) VALUES
       ('f1','BRAND-A','2026-11-01','M1','Overdue issue','Tinggi','Open','${todayShift(-8)}','RAMA','x','x'),
       ('f2','BRAND-B','2026-11-02','M2','Due today','Sedang','Open','${todayShift(0)}','EDU','x','x'),
       ('f3','BRAND-C','2026-11-03','M3','Selesai','Rendah','Selesai','${todayShift(-2)}','ANDRI','x','x')` as any,
    );

    await db().execute(
      `INSERT INTO activity_logs (id,who,action,category,created_at) VALUES
       ('a1','RAMA','menambah kasus','Penambahan','2026-11-10T10:00:00.000Z'),
       ('a2','RAMA','memperbarui kasus','Perubahan','2026-11-11T10:00:00.000Z'),
       ('a3','EDU','Audit validasi','Validasi','2026-11-12T10:00:00.000Z'),
       ('a4','ANDRI','menambah kasus','Penambahan','2026-10-12T10:00:00.000Z')` as any,
    );

    await db().execute(
      `INSERT INTO sync_logs (id,started_at,finished_at,status) VALUES ('sy1','2026-11-18T01:00:00.000Z','2026-11-18T01:01:00.000Z','failed')` as any,
    );
    await db().execute(`INSERT INTO "user" (id,name,email,role,active) VALUES ('u1','RAMA','rama@x','Support',1),('u2','EDU','edu@x','Support',1)` as any);

    recap = await new RecapService(new AnalyticsService()).getRecap('2026-11-01', '2026-12-31');
  });

  it('workload: total, user aktif, ON-CALL, open, tervalidasi', () => {
    const t = recap.tabs.workload;
    assert.equal(t.kpis.total, 8);
    assert.equal(t.kpis.activeUsers, 3);
    assert.equal(t.kpis.onCall, 3);
    assert.equal(t.kpis.open, 2);
    assert.equal(t.kpis.validated, 3);
    const rama = t.rows.find((u: any) => u.user === 'RAMA');
    assert.equal(rama.count, 3);
    assert.equal(rama.onCallSubtotal, 1660000);
    assert.ok(!t.rows.some((u: any) => u.user === 'TANPA USER' && u.count !== 1));
  });

  it('billing: hanya ON-CALL tervalidasi, paid/outstanding benar', () => {
    const t = recap.tabs.billing;
    assert.equal(t.kpis.count, 3);
    assert.equal(t.kpis.charges, 1500000);
    assert.equal(t.kpis.ppn, 160000);
    assert.equal(t.kpis.subtotal, 1660000);
    assert.equal(t.kpis.paid, 1110000);
    assert.equal(t.kpis.outstanding, 550000);
  });

  it('audit: funnel dan needCheck', () => {
    const t = recap.tabs.audit;
    assert.equal(t.kpis.total, 8);
    assert.equal(t.kpis.validated, 3);
    assert.equal(t.kpis.invoiceIssued, 1);
    assert.equal(t.kpis.invoiceSent, 1);
    assert.equal(t.kpis.paid, 2);
    assert.equal(t.kpis.needCheck, 1);
  });

  it('modules: top module dan top channel', () => {
    const t = recap.tabs.modules;
    assert.equal(t.kpis.modules, 3);
    assert.equal(t.kpis.topChannel, 'WHATSAPP');
    assert.equal(t.rows[0].module, 'M1');
  });

  it('brands: kontrak terbaru menang, hitung brand tanpa kontrak', () => {
    const t = recap.tabs.brands;
    assert.equal(t.kpis.brands, 3);
    assert.equal(t.kpis.withContract, 2);
    assert.equal(t.kpis.noContract, 1);
    assert.equal(t.kpis.monthly, 1);
    assert.equal(t.kpis.free, 1);
    const a = t.rows.find((b: any) => b.brand === 'BRAND-A');
    assert.equal(a.expiredAt, '2026-12-01');
    assert.equal(a.contractType, 'MONTHLY');
  });

  it('contracts: status per hari ini dan kasus periode', () => {
    const t = recap.tabs.contracts;
    assert.equal(t.kpis.total, 2);
    assert.equal(t.kpis.monthly, 1);
    assert.equal(t.kpis.gratis, 1);
    assert.equal(t.kpis.expired, 1);
    const a = t.rows.find((c: any) => c.brand === 'BRAND-A');
    assert.equal(a.cases, 3);
  });

  it('popinava: outlet, jadwal, audit, shot bulan terkait', () => {
    const t = recap.tabs.popinava;
    assert.equal(t.kpis.outlets, 3);
    assert.equal(t.kpis.active, 2);
    assert.equal(t.kpis.inactive, 1);
    assert.equal(t.kpis.scheduled, 3);
    assert.equal(t.kpis.audited, 2);
    assert.equal(t.kpis.pending, 1);
    assert.equal(t.kpis.shots, 1);
    assert.match(t.note, /Bulan Des 2026/);
  });

  it('activity: hanya rentang filter dan klasifikasi aksi', () => {
    const t = recap.tabs.activity;
    assert.equal(t.kpis.actions, 3);
    assert.equal(t.kpis.users, 2);
    assert.equal(t.kpis.inputCases, 1);
    assert.equal(t.kpis.updateCases, 1);
    assert.equal(t.kpis.validation, 1);
  });

  it('sla: kasus open dan follow-up', () => {
    const t = recap.tabs.sla;
    assert.equal(t.kpis.open, 2);
    assert.equal(t.kpis.followupsTotal, 3);
    assert.equal(t.kpis.followupsOverdue, 1);
    assert.equal(t.kpis.followupsDueToday, 1);
    assert.equal(t.kpis.followupsDone, 1);
    assert.equal(t.rows[0].client, 'BRAND-A');
  });

  it('quality: 10 pemeriksaan dan temuan utama', () => {
    const t = recap.tabs.quality;
    assert.equal(t.rows.length, 10);
    const by = Object.fromEntries(t.rows.map((r: any) => [r.check, r.count]));
    assert.equal(by['Tidak ada billing status'], 1);
    assert.equal(by['Tidak ada audit status'], 1);
    assert.equal(by['ON-CALL tanpa data pajak'], 1);
    assert.equal(by['PAID tanpa bukti pembayaran'], 2);
    assert.equal(by['Brand tak ada di master'], 1);
    assert.equal(by['User tak ada di master'], 1);
    assert.equal(by['Duplikat kasus'], 1);
    assert.equal(by['Tanggal issue invalid'], 1);
    assert.equal(by['Sync terakhir gagal'], 1);
    assert.equal(t.kpis.checksFailed, 9);
    assert.equal(t.kpis.lastSyncStatus, 'failed');
  });
});
