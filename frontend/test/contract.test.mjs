// Uji helper murni kontrak brand — node:test bawaan, tanpa deps.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { daysLeft, expiryState, isDupe, normalizeBrand, sortFreeByExpiry, fmtDateID } from '../src/utils/contract.js';

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const plus = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return iso(d);
};

describe('contract utils', () => {
  it('daysLeft: null tanpa tanggal, 0 hari ini, negatif bila lewat', () => {
    assert.equal(daysLeft(''), null);
    assert.equal(daysLeft(null), null);
    assert.equal(daysLeft(plus(0)), 0);
    assert.ok(daysLeft(plus(10)) >= 9 && daysLeft(plus(10)) <= 10);
    assert.ok(daysLeft(plus(-5)) <= -4);
  });

  it('expiryState: peta sisa hari ke status', () => {
    assert.equal(expiryState(''), 'unknown');
    assert.equal(expiryState(plus(-1)), 'expired');
    assert.equal(expiryState(plus(0)), 'soon');
    assert.equal(expiryState(plus(30)), 'soon');
    assert.equal(expiryState(plus(31)), 'active');
  });

  it('isDupe: case-insensitive per tipe + kecuali id sendiri', () => {
    const list = [
      { id: '1', brand: 'Chambers', type: 'MONTHLY' },
      { id: '2', brand: 'Flora Dera', type: 'GRATIS' },
    ];
    assert.ok(isDupe(list, 'chambers', 'MONTHLY'));
    assert.ok(!isDupe(list, 'Chambers', 'GRATIS'));
    assert.ok(!isDupe(list, 'chambers', 'MONTHLY', '1'));
    assert.ok(!isDupe(list, '  ', 'MONTHLY'));
  });

  it('sortFreeByExpiry: terdekat dulu, tanpa tanggal paling belakang', () => {
    const rows = [{ expiredAt: '2027-06-15' }, { expiredAt: '' }, { expiredAt: '2026-10-06' }];
    assert.deepEqual(sortFreeByExpiry(rows).map((r) => r.expiredAt), ['2026-10-06', '2027-06-15', '']);
  });

  it('normalizeBrand memangkas spasi', () => {
    assert.equal(normalizeBrand('  Kopi Arena '), 'Kopi Arena');
    assert.equal(normalizeBrand(null), '');
  });

  it('fmtDateID: cantik Indonesia + aman untuk kosong/rusak', () => {
    const out = fmtDateID('2026-10-06');
    assert.ok(out.includes('Okt') && out.includes('2026'), out);
    assert.equal(fmtDateID(''), '-');
    assert.equal(fmtDateID(null), '-');
    assert.equal(fmtDateID('bukan-tanggal'), 'bukan-tanggal');
  });
});
