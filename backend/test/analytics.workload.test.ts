// Uji agregasi workload semua billing status: pool operasional tanpa filter
// audit, uang hanya ON-CALL, user dinormalisasi, options dari seluruh data.
// node:test + pg-mem, DDL mandiri. Jangan edit helpers/pgmem.ts.
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, db } from './helpers/pgmem.ts';
import { AnalyticsService } from '../src/analytics/analytics.service.ts';
import { esc } from '../src/db/sql.ts';

async function addCols() {
  await db().execute(
    `CREATE TABLE IF NOT EXISTS case_tax (record_uuid TEXT PRIMARY KEY, ppn_mode TEXT, ppn_percent REAL, ppn_amount INTEGER, pph INTEGER DEFAULT 0, updated_by TEXT, updated_at TEXT)` as any,
  );
  for (const col of [
    'date_issue TEXT',
    'charges INTEGER DEFAULT 0',
    'billing_status TEXT',
    'module TEXT',
    'issue TEXT',
    'pic_name TEXT',
    'assign_to TEXT',
    'status TEXT',
  ]) {
    try {
      await db().execute(`ALTER TABLE assistance_records ADD COLUMN ${col}` as any);
    } catch {
      // kolom sudah ada (rerun) — lanjut
    }
  }
}

async function seedRow(r: {
  uuid: string;
  no: string;
  client: string;
  dateIssue: string;
  charges: number;
  billing: string;
  module: string;
  audit: string;
  assign: string;
  status: string;
  ppnMode?: string | null;
  ppnPercent?: number | null;
  ppnAmount?: number | null;
}) {
  await db().execute(
    `INSERT INTO assistance_records (record_uuid, no, client, date_issue, charges, billing_status, module, issue, pic_name, assign_to, status) VALUES ('${esc(r.uuid)}','${esc(r.no)}','${esc(r.client)}','${esc(r.dateIssue)}',${r.charges},'${esc(r.billing)}','${esc(r.module)}','issue','pic','${esc(r.assign)}','${esc(r.status)}') ON CONFLICT (record_uuid) DO UPDATE SET client=EXCLUDED.client` as any,
  );
  await db().execute(
    `INSERT INTO audit_status (record_uuid, action, updated_at) VALUES ('${esc(r.uuid)}','${esc(r.audit)}','x') ON CONFLICT (record_uuid) DO UPDATE SET action=EXCLUDED.action` as any,
  );
  await db().execute(
    `INSERT INTO case_tax (record_uuid, ppn_mode, ppn_percent, ppn_amount, pph, updated_at) VALUES ('${esc(r.uuid)}',${r.ppnMode ? `'${esc(r.ppnMode)}'` : 'NULL'},${r.ppnPercent ?? 'NULL'},${r.ppnAmount ?? 'NULL'},0,'x') ON CONFLICT (record_uuid) DO UPDATE SET ppn_mode=EXCLUDED.ppn_mode, ppn_percent=EXCLUDED.ppn_percent, ppn_amount=EXCLUDED.ppn_amount` as any,
  );
}

describe('analytics workload service', () => {
  before(async () => {
    setupTables();
    await addCols();
    await seedRow({ uuid: 'w-a', no: '1', client: 'BRAND-A', dateIssue: '20261101', charges: 1000000, billing: 'ON-CALL', module: 'M1', audit: 'BELUM DIVALIDASI', assign: 'Rama', status: 'DONE', ppnMode: 'percent', ppnPercent: 11, ppnAmount: 0 });
    await seedRow({ uuid: 'w-b', no: '2', client: 'BRAND-A', dateIssue: '20261102', charges: 500000, billing: 'ON-CALL', module: 'M1', audit: 'BELUM DIVALIDASI', assign: 'RAMA', status: 'DONE', ppnMode: 'rupiah', ppnPercent: 0, ppnAmount: 50000 });
    await seedRow({ uuid: 'w-c', no: '3', client: 'BRAND-B', dateIssue: '20261103', charges: 2000000, billing: 'MONTHLY', module: 'M2', audit: 'VALID - SIAP INVOICE', assign: 'rama ', status: 'DONE', ppnMode: 'percent', ppnPercent: 11, ppnAmount: 0 });
    await seedRow({ uuid: 'w-d', no: '4', client: 'BRAND-B', dateIssue: '20261104', charges: 9999999, billing: 'FREE', module: 'M2', audit: 'BELUM DIVALIDASI', assign: '', status: 'DONE', ppnMode: null, ppnPercent: null, ppnAmount: null });
    await seedRow({ uuid: 'w-e', no: '5', client: 'BRAND-C', dateIssue: '20261105', charges: 0, billing: '', module: 'M3', audit: 'BELUM DIVALIDASI', assign: 'ANDRI', status: 'OPEN', ppnMode: null, ppnPercent: null, ppnAmount: null });
    await seedRow({ uuid: 'w-f', no: '6', client: 'BRAND-C', dateIssue: '20261015', charges: 300000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', assign: 'EDU', status: 'DONE', ppnMode: 'percent', ppnPercent: 11, ppnAmount: 0 });
  });

  it('getWorkload: totals semua status, uang hanya ON-CALL, user dinormalisasi, options', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getWorkload('2026-11-01', '2026-11-30');
    assert.equal(r.totals.count, 5);
    assert.equal(r.totals.done, 4);
    assert.equal(r.totals.open, 1);
    assert.equal(r.totals.byBilling['ON-CALL'].count, 2);
    assert.equal(r.totals.byBilling['ON-CALL'].charges, 1500000);
    assert.equal(r.totals.byBilling['ON-CALL'].ppn, 160000);
    assert.equal(r.totals.byBilling['ON-CALL'].subtotal, 1660000);
    assert.equal(r.totals.byBilling.MONTHLY.charges, 0, 'charges MONTHLY tidak boleh masuk uang');
    assert.equal(r.totals.byBilling.FREE.charges, 0, 'charges FREE tidak boleh masuk uang');
    assert.equal(r.totals.byBilling.LAINNYA.count, 1);

    const rama = r.byAssignee.find((u: any) => u.assignTo === 'RAMA');
    assert.equal(rama.count, 3);
    assert.equal(rama.onCallSubtotal, 1660000);
    assert.equal(rama.validated, 1);
    assert.ok(r.byAssignee.some((u: any) => u.assignTo === 'TANPA USER'));
    assert.ok(r.byAssignee.some((u: any) => u.assignTo === 'ANDRI'));

    assert.equal(r.options.lastValidatedMonth, '2026-10');
    assert.ok(r.options.brands.includes('BRAND-C'));
    assert.ok(r.options.assignees.includes('ANDRI'));
    assert.ok(r.options.assignees.includes('TANPA USER'));
    assert.ok(!r.options.assignees.includes('EDU'), 'options hanya dari rentang tanggal');

    const scoped = await svc.getWorkload('2026-11-01', '2026-11-30', { brand: 'BRAND-A' });
    assert.equal(scoped.totals.count, 2);
    assert.equal(scoped.options.brands.length, 3, 'options tidak ikut menyempit');
  });

  it('drilldown default tetap validated ON-CALL; scope=all memuat semua status', async () => {
    const svc = new AnalyticsService();
    const d1: any = await svc.getDrilldown({ dim: '', key: '', from: '2026-11-01', to: '2026-11-30' });
    assert.equal(d1.total, 0);
    const d2: any = await svc.getDrilldown({ dim: '', key: '', scope: 'all', from: '2026-11-01', to: '2026-11-30', limit: 100 });
    assert.equal(d2.total, 5);
    assert.equal(d2.subtotal, 1660000);
  });

  it('scope=all filter billing, assignee, validation', async () => {
    const svc = new AnalyticsService();
    const oncall: any = await svc.getDrilldown({ dim: '', key: '', scope: 'all', billing: 'ON-CALL', from: '2026-11-01', to: '2026-11-30' });
    assert.equal(oncall.total, 2);
    const rama: any = await svc.getDrilldown({ dim: '', key: '', scope: 'all', assignee: 'rama', from: '2026-11-01', to: '2026-11-30' });
    assert.equal(rama.total, 3);
    const unvalidated: any = await svc.getDrilldown({ dim: '', key: '', scope: 'all', validation: 'unvalidated', from: '2026-11-01', to: '2026-11-30' });
    assert.equal(unvalidated.total, 4);
    const searchUser: any = await svc.getDrilldown({ dim: '', key: '', scope: 'all', q: 'rama', from: '2026-11-01', to: '2026-11-30' });
    assert.equal(searchUser.total, 3);
  });
});
