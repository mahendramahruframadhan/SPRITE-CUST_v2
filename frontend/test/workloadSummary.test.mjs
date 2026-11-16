// Helper rekap operasional Report Summary — node:test bawaan, tanpa deps.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { billingRows, userRows, fmtMonthLabel, financialHint } from '../src/lib/workloadSummary.js';

const totals = { count: 10, byBilling: {
  'ON-CALL': { count: 3, done: 2, open: 1, validated: 1, charges: 1000, ppn: 110, subtotal: 1110 },
  MONTHLY: { count: 2, done: 2, open: 0, validated: 0, charges: 0, ppn: 0, subtotal: 0 },
  FREE: { count: 5, done: 5, open: 0, validated: 0, charges: 0, ppn: 0, subtotal: 0 },
  LAINNYA: { count: 0, done: 0, open: 0, validated: 0, charges: 0, ppn: 0, subtotal: 0 },
} };

describe('billingRows', () => {
  it('urutan status tetap, LAINNYA hanya bila count > 0, persen dibulatkan', () => {
    assert.deepEqual(billingRows(totals).map((r) => r.key), ['ON-CALL', 'MONTHLY', 'FREE']);
    assert.equal(billingRows(totals)[0].percentage, 30);
  });
});

describe('fmtMonthLabel', () => {
  it('format YYYY-MM menjadi label bulan singkat Indonesia', () => {
    assert.equal(fmtMonthLabel('2026-10'), 'Okt 2026');
  });
});

describe('financialHint', () => {
  it('hint hanya saat finansial kosong dan ada kasus operasional', () => {
    assert.equal(financialHint({ totals, options: { lastValidatedMonth: '2026-10' } }, 0), 'Belum ada kasus ON-CALL tervalidasi pada periode ini. Terakhir tervalidasi: Okt 2026.');
    assert.equal(financialHint({ totals, options: { lastValidatedMonth: '2026-10' } }, 1), '');
    assert.equal(financialHint({ totals, options: { lastValidatedMonth: null } }, 0), 'Belum ada kasus ON-CALL tervalidasi pada periode ini.');
  });
});

describe('userRows', () => {
  it('salinan array dengan onCallSubtotal dinormalisasi number', () => {
    const input = [
      { assignTo: 'RAMA', count: 2, onCallSubtotal: '1110' },
      { assignTo: 'EDU', count: 1 },
    ];
    const out = userRows(input);
    assert.notEqual(out, input);
    assert.equal(out[0].assignTo, 'RAMA');
    assert.equal(out[0].onCallSubtotal, 1110);
    assert.equal(out[1].onCallSubtotal, 0);
    assert.equal(input[0].onCallSubtotal, '1110');
  });
});
