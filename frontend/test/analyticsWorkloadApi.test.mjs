// Uji client API report summary — node:test bawaan, tanpa deps.
// Jalankan: npm test
// Kontrak: fetchAnalyticsWorkload selalu mengirim from/to (fallback rentang
// penuh) + brand/module bila ada; fetchAnalyticsDrilldown menambahkan filter
// scope/billing/assignee/validation hanya bila non-empty tanpa mengubah
// urutan/param existing (Analitik tetap memakai perilaku lama).
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAnalyticsWorkload, fetchAnalyticsDrilldown } from '../src/lib/api.js';

// Stub localStorage minimal: storage.js membaca global ini saat api.js diimpor.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// Stub fetch global: catat URL, balas sukses agar client bisa selesai.
const fetchCalls = [];
globalThis.fetch = async (url, opts = {}) => {
  fetchCalls.push({ url: String(url), method: opts.method || 'GET' });
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

beforeEach(() => {
  store.clear();
  fetchCalls.length = 0;
});

describe('fetchAnalyticsWorkload', () => {
  it('mengirim from/to/brand/module; spasi brand jadi %20', async () => {
    await fetchAnalyticsWorkload({
      from: '2026-11-01',
      to: '2026-11-30',
      brand: 'BRAND A',
      module: 'SHOP',
    });

    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /\/api\/analytics\/workload\?/);
    assert.match(fetchCalls[0].url, /from=2026-11-01/);
    assert.match(fetchCalls[0].url, /to=2026-11-30/);
    assert.match(fetchCalls[0].url, /brand=BRAND%20A/);
    assert.match(fetchCalls[0].url, /module=SHOP/);
  });

  it('from/to kosong memakai fallback 1970-01-01 / 2999-12-31', async () => {
    await fetchAnalyticsWorkload();

    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /from=1970-01-01/);
    assert.match(fetchCalls[0].url, /to=2999-12-31/);
  });

  it('brand/module kosong tidak dikirim', async () => {
    await fetchAnalyticsWorkload({ from: '2026-11-01', to: '2026-11-30' });

    assert.ok(!fetchCalls[0].url.includes('brand='), 'tanpa brand saat kosong');
    assert.ok(!fetchCalls[0].url.includes('module='), 'tanpa module saat kosong');
  });
});

describe('fetchAnalyticsDrilldown — filter baru report summary', () => {
  it('menambahkan scope/billing/assignee/validation bila non-empty', async () => {
    await fetchAnalyticsDrilldown({
      scope: 'all',
      billing: 'ON-CALL',
      assignee: 'RAMA',
      validation: 'validated',
      from: '2026-11-01',
      to: '2026-11-30',
      page: 1,
      limit: 10,
    });

    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /\/api\/analytics\/drilldown\?/);
    assert.match(fetchCalls[0].url, /scope=all/);
    assert.match(fetchCalls[0].url, /billing=ON-CALL/);
    assert.match(fetchCalls[0].url, /assignee=RAMA/);
    assert.match(fetchCalls[0].url, /validation=validated/);
  });

  it('filter baru kosong tidak dikirim (perilaku lama Analitik aman)', async () => {
    await fetchAnalyticsDrilldown({ from: '2026-11-01', to: '2026-11-30', page: 1, limit: 10 });

    assert.ok(!fetchCalls[0].url.includes('scope='), 'tanpa scope saat kosong');
    assert.ok(!fetchCalls[0].url.includes('billing='), 'tanpa billing saat kosong');
    assert.ok(!fetchCalls[0].url.includes('assignee='), 'tanpa assignee saat kosong');
    assert.ok(!fetchCalls[0].url.includes('validation='), 'tanpa validation saat kosong');
  });

  it('param existing tetap ada dan urutannya tidak berubah', async () => {
    await fetchAnalyticsDrilldown({
      dim: 'brand',
      key: 'SCREAMOUS',
      from: '2026-11-01',
      to: '2026-11-30',
      q: 'kasus',
      page: 2,
      limit: 25,
      brand: 'SCREAMOUS',
      module: 'SHOP',
    });

    assert.match(
      fetchCalls[0].url,
      /^\/api\/analytics\/drilldown\?page=2&limit=25&dim=brand&key=SCREAMOUS&from=2026-11-01&to=2026-11-30&q=kasus&brand=SCREAMOUS&module=SHOP$/,
    );
  });
});
