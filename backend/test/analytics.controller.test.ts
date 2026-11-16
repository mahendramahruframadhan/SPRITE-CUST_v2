// Uji controller analitik: validasi range + dim. node:test, tanpa DB.
process.env.DATABASE_URL = '';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsController } from '../src/analytics/analytics.controller.ts';

describe('analytics controller guard', () => {
  it('from > to ditolak 422 ANALYTICS_INVALID_RANGE', async () => {
    const ctl = new AnalyticsController({} as any);
    await assert.rejects(() => ctl.overview({ from: '2026-10-02', to: '2026-10-01' }), (e: any) => e?.response?.code === 'ANALYTICS_INVALID_RANGE');
  });

  it('dim selain brand|module ditolak 422 ANALYTICS_INVALID_DIM', async () => {
    const ctl = new AnalyticsController({} as any);
    await assert.rejects(
      () => ctl.drilldown({ dim: 'pic', key: 'X', from: '2026-01-01', to: '2026-12-31' }),
      (e: any) => e?.response?.code === 'ANALYTICS_INVALID_DIM',
    );
  });

  it('drilldown tanpa dim/key = semua pool (tabel default)', async () => {
    const fake = { getOverview: async () => ({ ok: true }), getDrilldown: async () => ({ ok: true, total: 0 }) };
    const ctl = new AnalyticsController(fake as any);
    const r: any = await ctl.drilldown({ from: '2026-01-01', to: '2026-12-31' });
    assert.equal(r.ok, true);
  });

  it('overview meneruskan hasil service', async () => {
    const fake = { getOverview: async () => ({ ok: true }), getDrilldown: async () => ({ ok: true }) };
    const ctl = new AnalyticsController(fake as any);
    const r: any = await ctl.overview({ from: '2026-01-01', to: '2026-01-31' });
    assert.equal(r.ok, true);
  });

  it('workload meneruskan brand/module ke service', async () => {
    let got: any = null;
    const fake = { getWorkload: async (f: string, t: string, o: any) => { got = o; return { ok: true }; } };
    const ctl = new AnalyticsController(fake as any);
    const r: any = await ctl.workload({ from: '2026-11-01', to: '2026-11-30', brand: 'B', module: 'M' });
    assert.equal(r.ok, true);
    assert.deepEqual(got, { brand: 'B', module: 'M' });
  });

  it('scope selain validated|all ditolak 422', async () => {
    const ctl = new AnalyticsController({ getDrilldown: async () => ({}) } as any);
    await assert.rejects(
      () => ctl.drilldown({ scope: 'x', from: '2026-01-01', to: '2026-12-31' }),
      (e: any) => e?.response?.code === 'ANALYTICS_INVALID_SCOPE',
    );
  });

  it('scope=all + filter billing/assignee/validation diteruskan', async () => {
    let got: any = null;
    const ctl = new AnalyticsController({ getDrilldown: async (o: any) => { got = o; return { ok: true }; } } as any);
    await ctl.drilldown({ scope: 'all', billing: 'ON-CALL', assignee: 'rama', validation: 'validated', from: '2026-01-01', to: '2026-12-31' });
    assert.equal(got.scope, 'all');
    assert.equal(got.billing, 'ON-CALL');
    assert.equal(got.assignee, 'rama');
    assert.equal(got.validation, 'validated');
  });
});
