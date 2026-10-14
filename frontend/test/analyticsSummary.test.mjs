// Tren bulanan untuk halaman Analitik: agregasi murni per YYYY-MM dari
// dateIssue (YYYYMMDD). Aturan pajak ikut lib/taxSummary.js (PPN hanya
// baris ON-CALL, PPh tidak dihitung di sini).
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyTrend, monthKeyToLabel } from '../src/lib/analyticsSummary.js';

describe('buildMonthlyTrend', () => {
  it('agregasi per bulan: charges + PPN ON-CALL + subtotal + count', () => {
    const rows = [
      { recordUuid: 'a', charges: 1000000, billingStatus: 'ON-CALL', dateIssue: '20261005' },

      { recordUuid: 'c', charges: 500000, billingStatus: 'ON-CALL', dateIssue: '20260911' },
    ];
    const taxMap = {
      a: { ppn: { enabled: true, mode: 'percent', percent: 10, amount: 0 }, pph: false },
      c: { ppn: { enabled: true, mode: 'rupiah', percent: 0, amount: 25000 }, pph: true },
    };
    const t = buildMonthlyTrend(rows, taxMap);
    assert.equal(t.length, 2);
    assert.equal(t[0].key, '2026-09');
    assert.equal(t[0].subtotal, 525000);
    assert.equal(t[1].key, '2026-10');
    assert.equal(t[1].charges, 1000000);
    assert.equal(t[1].ppn, 100000);
    assert.equal(t[1].subtotal, 1100000);
    assert.equal(t[1].count, 1);
  });

  it('baris tanpa dateIssue valid dilewati', () => {
    const rows = [{ recordUuid: 'x', charges: 999, billingStatus: 'ON-CALL', dateIssue: '' }];
    assert.equal(buildMonthlyTrend(rows, {}).length, 0);
  });

  it('pool kosong menghasilkan array kosong', () => {
    assert.deepEqual(buildMonthlyTrend([], {}), []);
  });
});

describe('monthKeyToLabel', () => {
  it('2026-10 menjadi Okt 2026', () =>
    assert.equal(monthKeyToLabel('2026-10'), 'Okt 2026'));
});
