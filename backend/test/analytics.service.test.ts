// Uji service agregasi analitik: pool VALID, PPN ON-CALL saja, FREE dikecualikan.
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
  invoice?: string;
  ppnMode?: string | null;
  ppnPercent?: number | null;
  ppnAmount?: number | null;
  pph?: number;
}) {
  await db().execute(
    `INSERT INTO assistance_records (record_uuid, no, client, date_issue, charges, billing_status, module, issue, pic_name) VALUES ('${esc(r.uuid)}','${esc(r.no)}','${esc(r.client)}','${esc(r.dateIssue)}',${r.charges},'${esc(r.billing)}','${esc(r.module)}','issue','pic') ON CONFLICT (record_uuid) DO UPDATE SET client=EXCLUDED.client` as any,
  );
  await db().execute(
    `INSERT INTO audit_status (record_uuid, action, updated_at) VALUES ('${esc(r.uuid)}','${esc(r.audit)}','x') ON CONFLICT (record_uuid) DO UPDATE SET action=EXCLUDED.action` as any,
  );
  if (r.invoice) {
    await db().execute(
      `INSERT INTO invoice_status (record_uuid, status, updated_at) VALUES ('${esc(r.uuid)}','${esc(r.invoice)}','x') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status` as any,
    );
  }
  await db().execute(
    `INSERT INTO case_tax (record_uuid, ppn_mode, ppn_percent, ppn_amount, pph, updated_at) VALUES ('${esc(r.uuid)}',${r.ppnMode ? `'${esc(r.ppnMode)}'` : 'NULL'},${r.ppnPercent ?? 'NULL'},${r.ppnAmount ?? 'NULL'},${r.pph ?? 0},'x') ON CONFLICT (record_uuid) DO UPDATE SET ppn_mode=EXCLUDED.ppn_mode, ppn_percent=EXCLUDED.ppn_percent, ppn_amount=EXCLUDED.ppn_amount, pph=EXCLUDED.pph` as any,
  );
}

describe('analytics service', () => {
  before(async () => {
    setupTables();
    await addCols();
    await seedRow({ uuid: 'an-a', no: '1', client: 'BRAND-A', dateIssue: '20260315', charges: 1000000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', invoice: 'PAID', ppnMode: 'percent', ppnPercent: 11, ppnAmount: 0, pph: 1 });
    await seedRow({ uuid: 'an-b', no: '2', client: 'BRAND-B', dateIssue: '20260320', charges: 2000000, billing: 'MONTHLY', module: 'M2', audit: 'VALID - SIAP INVOICE', invoice: 'MENUNGGU INVOICE', ppnMode: 'percent', ppnPercent: 11, ppnAmount: 0 });
    await seedRow({ uuid: 'an-c', no: '3', client: 'BRAND-C', dateIssue: '20260321', charges: 5000000, billing: 'FREE', module: 'M1', audit: 'VALID - SIAP INVOICE' });
    await seedRow({ uuid: 'an-d', no: '4', client: 'BRAND-D', dateIssue: '20260322', charges: 1000000, billing: 'ON-CALL', module: 'M1', audit: 'BELUM DIVALIDASI', ppnMode: 'percent', ppnPercent: 11, ppnAmount: 0 });
    await seedRow({ uuid: 'an-e', no: '5', client: 'BRAND-A', dateIssue: '20260402', charges: 500000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', invoice: 'DIKIRIM', ppnMode: 'rupiah', ppnPercent: 0, ppnAmount: 50000 });
    await seedRow({ uuid: 'an-f', no: '6', client: 'BRAND-A', dateIssue: '20260403', charges: 300000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', ppnMode: null, ppnPercent: null, ppnAmount: null });
  });

  it('overview: pool VALID saja, PPN percent ON-CALL, MONTHLY PPN 0', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31');
    assert.equal(r.kpis.count, 3);
    assert.equal(r.kpis.charges, 1800000);
    assert.equal(r.kpis.ppn, 160000);
    assert.equal(r.kpis.subtotal, 1960000);
    assert.equal(r.kpis.pphCount, 1);
  });

  it('byBrand/byModule/trend/byInvoice konsisten', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31');
    const brandA = (r.byBrand || []).find((b: any) => b.brand === 'BRAND-A');
    assert.equal(brandA.count, 3);
    assert.equal(brandA.subtotal, 1960000);
    const m1 = (r.byModule || []).find((b: any) => b.module === 'M1');
    assert.equal(m1.count, 3);
    const mar = (r.trend || []).find((t: any) => t.key === '2026-03');
    assert.equal(mar.count, 1);
    assert.equal(mar.subtotal, 1110000);
    assert.equal(r.byInvoice['PAID'].count, 1);
    assert.equal(r.kpis.paid.subtotal, 1110000);
    assert.equal(r.kpis.outstanding.count, 2);
  });

  it('drilldown tanpa dim = semua pool + paginasi', async () => {
    const svc = new AnalyticsService();
    const d: any = await svc.getDrilldown({ dim: '', key: '', from: '2026-01-01', to: '2026-12-31', q: '', page: 1, limit: 10 });
    assert.equal(d.total, 3);
    assert.equal(d.subtotal, 1960000);
  });

  it('drilldown brand + search + paginasi', async () => {
    const svc = new AnalyticsService();
    const d: any = await svc.getDrilldown({ dim: 'brand', key: 'BRAND-A', from: '2026-01-01', to: '2026-12-31', q: '', page: 1, limit: 2 });
    assert.equal(d.total, 3);
    assert.equal(d.totalPages, 2);
    assert.equal(d.data.length, 2);
    assert.equal(d.subtotal, 1960000);
    const s: any = await svc.getDrilldown({ dim: 'module', key: 'M2', from: '2026-01-01', to: '2026-12-31', q: 'BRAND-B', page: 1, limit: 10 });
    assert.equal(s.total, 0);
  });
});
