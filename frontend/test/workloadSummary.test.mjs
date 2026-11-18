// Helper rekap operasional Report Summary — node:test bawaan, tanpa deps.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { billingRows, userRows, countActiveUsers, fmtMonthLabel, financialHint, detailFilterLabel, workloadKpiCards } from '../src/lib/workloadSummary.js';

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

describe('detailFilterLabel', () => {
  it('ringkas filter detail; kosong bila semua default', () => {
    assert.equal(detailFilterLabel('ON-CALL', 'RAMA', 'validated'), 'ON-CALL · RAMA · Tervalidasi');
    assert.equal(detailFilterLabel('', '', 'all'), '');
    assert.equal(detailFilterLabel('', '', 'unvalidated'), 'Belum');
    assert.equal(detailFilterLabel('FREE', '', 'all'), 'FREE');
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

describe('countActiveUsers', () => {
  it('mengecualikan label sintetik TANPA USER dari hitung user aktif', () => {
    assert.equal(countActiveUsers([{ assignTo: 'RAMA' }, { assignTo: 'TANPA USER' }, { assignTo: 'EDU' }]), 2);
    assert.equal(countActiveUsers([{ assignTo: 'TANPA USER' }]), 0);
    assert.equal(countActiveUsers([]), 0);
  });
});

describe('workloadKpiCards', () => {
  const byAssignee = [{ assignTo: 'RAMA', count: 7 }, { assignTo: 'TANPA USER', count: 3 }, { assignTo: 'EDU', count: 1 }];
  it('enam kartu dasar: total, tiga status, user aktif, TANPA USER', () => {
    assert.deepEqual(workloadKpiCards(totals, byAssignee), [
      { t: 'Total Kasus', v: 10 },
      { t: 'ON-CALL', v: 3 },
      { t: 'MONTHLY', v: 2 },
      { t: 'FREE', v: 5 },
      { t: 'User Aktif', v: 2 },
      { t: 'Kasus TANPA USER', v: 3 },
    ]);
  });
  it('LAINNYA muncul sebagai kartu hanya bila count > 0', () => {
    const withOther = workloadKpiCards(
      { count: 12, byBilling: { ...totals.byBilling, LAINNYA: { count: 2 } } },
      byAssignee,
    );
    assert.deepEqual(withOther.map((c) => c.t), ['Total Kasus', 'ON-CALL', 'MONTHLY', 'FREE', 'LAINNYA', 'User Aktif', 'Kasus TANPA USER']);
    assert.equal(withOther[4].v, 2);
  });
});
