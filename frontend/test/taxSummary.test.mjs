// Lib perhitungan pajak halaman Finance (PPN/PPH & subtotal).
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSubtotal, amountFromPercent, resolveTaxAmount,
  sanitizeTaxState, validateRpInput, validatePercentInput,
} from '../src/lib/taxSummary.js';

describe('computeSubtotal', () => {
  it('dua-duanya non: subtotal = total', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 0, pph: 0 }), 100000));
  it('hanya PPN menambah', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 11000, pph: 0 }), 111000));
  it('hanya PPH mengurangi', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 0, pph: 5000 }), 95000));
  it('PPN + PPH bersamaan', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 11000, pph: 5000 }), 106000));
  it('hasil negatif tampil apa adanya (D8)', () =>
    assert.equal(computeSubtotal({ total: 1000, ppn: 0, pph: 5000 }), -4000));
  it('input bukan angka dianggap 0', () =>
    assert.equal(computeSubtotal({ total: 'abc', ppn: null, pph: undefined }), 0));
});

describe('amountFromPercent', () => {
  it('11% dari 1.000.000 = 110.000', () =>
    assert.equal(amountFromPercent(1000000, 11), 110000));
  it('dibulatkan ke rupiah bulat', () =>
    assert.equal(amountFromPercent(999999, 11), 110000));
  it('persen desimal', () =>
    assert.equal(amountFromPercent(500000, 0.5), 2500));
  it('total 0 menghasilkan 0', () =>
    assert.equal(amountFromPercent(0, 2), 0));
  it('persen 0 menghasilkan 0', () =>
    assert.equal(amountFromPercent(100000, 0), 0));
  it('persen negatif/tak valid menghasilkan 0', () => {
    assert.equal(amountFromPercent(100000, -5), 0);
    assert.equal(amountFromPercent(100000, 'x'), 0);
  });
});

describe('resolveTaxAmount', () => {
  const off = { enabled: false, mode: null, percent: 0, amount: 0 };
  it('non-aktif -> 0 walau amount ada', () =>
    assert.equal(resolveTaxAmount({ ...off, amount: 999 }, 1000000), 0));
  it('mode percent diturunkan dari total', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: 'percent', percent: 11, amount: 1 }, 1000000), 110000));
  it('mode rupiah memakai amount tetap', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: 'rupiah', percent: 0, amount: 50000 }, 1000000), 50000));
  it('mode null saat aktif -> amount bila angka', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: null, percent: 0, amount: 7000 }, 1), 7000));
});

describe('sanitizeTaxState', () => {
  it('raw bukan JSON valid -> default non-aktif', () => {
    assert.deepEqual(sanitizeTaxState('bukan json'), {
      ppn: { enabled: false, mode: null, percent: 0, amount: 0 },
      pph: { enabled: false, mode: null, percent: 0, amount: 0 },
    });
    assert.deepEqual(sanitizeTaxState(null), sanitizeTaxState('{'));
  });
  it('objek parsial dilengkapi default', () => {
    const out = sanitizeTaxState('{"ppn":{"enabled":true,"mode":"rupiah","amount":110000}}');
    assert.equal(out.ppn.amount, 110000);
    assert.deepEqual(out.pph, { enabled: false, mode: null, percent: 0, amount: 0 });
  });
  it('mode tak dikenal saat aktif dianggap rupiah', () => {
    const out = sanitizeTaxState('{"ppn":{"enabled":true,"mode":"manual","amount":5000}}');
    assert.equal(out.ppn.mode, 'rupiah');
    assert.equal(out.ppn.amount, 5000);
  });
  it('angka negatif dinormalkan ke 0', () => {
    const out = sanitizeTaxState('{"ppn":{"enabled":true,"mode":"rupiah","amount":-5},"pph":{"enabled":true,"mode":"percent","percent":-2}}');
    assert.equal(out.ppn.amount, 0);
    assert.equal(out.pph.percent, 0);
  });
});

describe('validateRpInput', () => {
  it('digit diterima, termasuk 0', () => {
    assert.equal(validateRpInput('100000'), true);
    assert.equal(validateRpInput('0'), true);
  });
  it('kosong/desimal/negatif/eksponensial ditolak', () => {
    assert.equal(validateRpInput(''), false);
    assert.equal(validateRpInput('10.5'), false);
    assert.equal(validateRpInput('-5'), false);
    assert.equal(validateRpInput('1e5'), false);
  });
});

describe('validatePercentInput', () => {
  it('integer dan desimal diterima', () => {
    assert.equal(validatePercentInput('2'), true);
    assert.equal(validatePercentInput('0.5'), true);
    assert.equal(validatePercentInput('11'), true);
  });
  it('kosong/negatif/teks ditolak', () => {
    assert.equal(validatePercentInput(''), false);
    assert.equal(validatePercentInput('-1'), false);
    assert.equal(validatePercentInput('abc'), false);
    assert.equal(validatePercentInput('.5'), false);
  });
});
