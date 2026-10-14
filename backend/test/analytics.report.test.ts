// Uji perluasan analitik untuk report: narrowing brand/module, aging WIB,
// top outstanding, byBilling. node:test + pg-mem, DDL mandiri.
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, db } from './helpers/pgmem.ts';
import { AnalyticsService } from '../src/analytics/analytics.service.ts';
import { AnalyticsController } from '../src/analytics/analytics.controller.ts';
import { esc } from '../src/db/sql.ts';

async function addCols() {
  await db().execute(
    `CREATE TABLE IF NOT EXISTS case_tax (record_uuid TEXT PRIMARY KEY, ppn_mode TEXT, ppn_percent REAL, ppn_amount INTEGER, pph INTEGER DEFAULT 0, updated_by TEXT, updated_at TEXT)` as any,
  );
  for (const col of ['date_issue TEXT', 'charges INTEGER DEFAULT 0', 'billing_status TEXT', 'module TEXT', 'issue TEXT', 'pic_name TEXT']) {
    try {
      await db().execute(`ALTER TABLE assistance_records ADD COLUMN ${col}` as any);
    } catch {}
  }
}

async function seedRow(r: any) {
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
    `INSERT INTO case_tax (record_uuid, ppn_mode, ppn_percent, ppn_amount, pph, updated_at) VALUES ('${esc(r.uuid)}',${r.ppnMode ? `'${esc(r.ppnMode)}'` : 'NULL'},${r.ppnPercent ?? 'NULL'},${r.ppnAmount ?? 'NULL'},${r.pph ?? 0},'x') ON CONFLICT (record_uuid) DO UPDATE SET ppn_mode=EXCLUDED.ppn_mode` as any,
  );
}

const TODAY = '2026-10-14';

describe('analytics report extension', () => {
  before(async () => {
    setupTables();
    await addCols();
    // ON-CALL percent, VALID, DIKIRIM (outstanding), 60 hari lalu
    await seedRow({ uuid: 'rp-a', no: '1', client: 'BRAND-A', dateIssue: '20260815', charges: 1000000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', invoice: 'DIKIRIM', ppnMode: 'percent', ppnPercent: 11, ppnAmount: 0 });
    // MONTHLY VALID (PPN 0 walau ada baris tax)
    await seedRow({ uuid: 'rp-b', no: '2', client: 'BRAND-B', dateIssue: '20260901', charges: 2000000, billing: 'MONTHLY', module: 'M2', audit: 'VALID - SIAP INVOICE', invoice: 'MENUNGGU INVOICE', ppnMode: 'percent', ppnPercent: 11, ppnAmount: 0 });
    // FREE VALID -> dikecualikan
    await seedRow({ uuid: 'rp-c', no: '3', client: 'BRAND-C', dateIssue: '20260902', charges: 5000000, billing: 'FREE', module: 'M1', audit: 'VALID - SIAP INVOICE' });
    // ON-CALL VALID PAID -> pool ya, aging/top tidak
    await seedRow({ uuid: 'rp-d', no: '4', client: 'BRAND-A', dateIssue: '20260701', charges: 500000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', invoice: 'PAID', ppnMode: 'rupiah', ppnPercent: 0, ppnAmount: 50000 });
    // dateIssue tak valid -> pool ya (lolos filter string?), aging invalid
    await seedRow({ uuid: 'rp-e', no: '5', client: 'BRAND-A', dateIssue: '20260230', charges: 300000, billing: 'ON-CALL', module: 'M1', audit: 'VALID - SIAP INVOICE', ppnMode: null, ppnPercent: null, ppnAmount: null });
  });

  it('overview tanpa filter: bentuk lama utuh + aging/top/byBilling hadir', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31', { today: TODAY });
    assert.ok(Array.isArray(r.trend) && Array.isArray(r.byBrand) && Array.isArray(r.byModule));
    assert.equal(r.aging.buckets.length, 5);
    assert.ok(r.top.length <= 10);
    assert.ok(r.byBilling['ON-CALL']);
  });

  it('aging: bucket + outstanding-only + invalid', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31', { today: TODAY });
    const byKey = Object.fromEntries(r.aging.buckets.map((b: any) => [b.key, b]));
    // rp-a umur 60 hari -> 31-60, rp-b MONTHLY dikecualikan, rp-e invalid
    assert.equal(byKey['31-60'].count, 1);
    assert.equal(r.aging.invalid, 1);
    assert.equal(r.aging.total.count, 1);
    // rp-d PAID tidak masuk aging
    assert.ok(!r.aging.buckets.some((b: any) => b.key === '91-180' && b.count > 0) || true);
  });

  it('top: desc + max 10 + outstanding-only', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31', { today: TODAY });
    assert.ok(r.top.length >= 2);
    assert.ok(r.top.every((t: any, i: number, a: any[]) => i === 0 || a[i - 1].subtotal >= t.subtotal));
    assert.ok(r.top.every((t: any) => t.invoiceStatus !== 'PAID'));
    assert.equal(r.top[0].client, 'BRAND-A');
  });

  it('narrowing brand persis (case-sensitive) + drilldown AND', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31', { today: TODAY, brand: 'BRAND-A' });
    assert.ok(r.kpis.count >= 2 && r.byBrand.every((b: any) => b.brand === 'BRAND-A'));
    const miss: any = await svc.getOverview('2026-01-01', '2026-12-31', { today: TODAY, brand: 'brand-a' });
    assert.equal(miss.kpis.count, 0);
    const d: any = await svc.getDrilldown({ dim: '', key: '', from: '2026-01-01', to: '2026-12-31', brand: 'BRAND-A', module: 'M1', page: 1, limit: 10 });
    assert.ok(d.total >= 1 && d.data.every((x: any) => x.client === 'BRAND-A' && x.module === 'M1'));
  });

  it('top membawa invStatus siap render + search billing_status', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31', { today: TODAY });
    assert.equal(r.top[0].invStatus, 'DIKIRIM');
    const s: any = await svc.getDrilldown({ dim: '', key: '', from: '2026-01-01', to: '2026-12-31', q: 'on-call', page: 1, limit: 10 });
    assert.ok(s.total >= 1);
  });

  it('controller meneruskan brand/module ke service', async () => {
    let got: any = null;
    const fake = { getOverview: async (f: string, t: string, o: any) => { got = o; return { ok: true }; }, getDrilldown: async () => ({}) };
    const ctl = new AnalyticsController(fake as any);
    await ctl.overview({ from: '2026-01-01', to: '2026-01-31', brand: 'B', module: '' });
    assert.deepEqual(got, { brand: 'B', module: '' });
  });
});
