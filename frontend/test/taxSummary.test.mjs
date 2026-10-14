// Lib perhitungan pajak halaman Finance, model PER TRANSAKSI (baris ON-CALL):
// PPN menambah charges baris; PPH hanya status on/off (tanpa potongan).
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSubtotal, amountFromPercent, resolveTaxAmount,
  sanitizeRowTax, sanitizeTaxMap, normalizeServerRow,
  sumPpn, pphActiveCount,
  isTaxableRow, mergeTaxMaps, applySaveResult,
  validateRpInput, validatePercentInput,
} from '../src/lib/taxSummary.js';

describe('isTaxableRow (kontrol pajak hanya baris ON-CALL)', () => {
  it('ON-CALL (spasi/kecil-berbeda tetap dikenali) -> true', () => {
    assert.equal(isTaxableRow('ON-CALL'), true);
    assert.equal(isTaxableRow(' on-call '), true);
    assert.equal(isTaxableRow('On Call'), true);
  });
  it('MONTHLY/FREE/kosong/bukan teks -> false', () => {
    assert.equal(isTaxableRow('MONTHLY'), false);
    assert.equal(isTaxableRow('FREE'), false);
    assert.equal(isTaxableRow(''), false);
    assert.equal(isTaxableRow(null), false);
    assert.equal(isTaxableRow(42), false);
  });
});

describe('computeSubtotal (revisi: PPH bukan pengurang)', () => {
  it('tanpa PPN: subtotal = total charges', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 0 }), 100000));
  it('PPN menambah total', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 11000 }), 111000));
  it('parameter pph lama DIABAIKAN (tidak mengurangi subtotal)', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 11000, pph: 999999 }), 111000));
  it('input bukan angka dianggap 0', () =>
    assert.equal(computeSubtotal({ total: 'abc', ppn: null }), 0));
  it('negatif tampil apa adanya tanpa clamp', () =>
    assert.equal(computeSubtotal({ total: -500, ppn: 0 }), -500));
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
  it('mode percent diturunkan dari charges baris', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: 'percent', percent: 11, amount: 1 }, 1000000), 110000));
  it('mode rupiah memakai amount tetap', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: 'rupiah', percent: 0, amount: 50000 }, 1000000), 50000));
  it('mode null saat aktif -> amount bila angka', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: null, percent: 0, amount: 7000 }, 1), 7000));
});

describe('sanitizeRowTax', () => {
  it('null/rusak -> { ppn: null, pph: false }', () => {
    assert.deepEqual(sanitizeRowTax(null), { ppn: null, pph: false });
    assert.deepEqual(sanitizeRowTax('bukan json'), { ppn: null, pph: false });
    assert.deepEqual(sanitizeRowTax(42), { ppn: null, pph: false });
  });
  it('entri PPN valid dipertahankan, pph boolean', () => {
    const out = sanitizeRowTax({ ppn: { enabled: true, mode: 'rupiah', percent: 0, amount: 50000 }, pph: true });
    assert.equal(out.ppn.amount, 50000);
    assert.equal(out.ppn.mode, 'rupiah');
    assert.equal(out.pph, true);
  });
  it('PPN non-aktif dinormalkan ke null (bukan entri mati)', () => {
    const out = sanitizeRowTax({ ppn: { enabled: false, mode: 'percent', percent: 5, amount: 0 }, pph: 'ya' });
    assert.equal(out.ppn, null);
    assert.equal(out.pph, false);
  });
  it('mode tak dikenal saat aktif dianggap rupiah; angka negatif ke 0', () => {
    const out = sanitizeRowTax({ ppn: { enabled: true, mode: 'manual', amount: -5000 }, pph: 1 });
    assert.equal(out.ppn.mode, 'rupiah');
    assert.equal(out.ppn.amount, 0);
    assert.equal(out.pph, false);
  });
  it('entri PPN bukan objek -> null', () => {
    assert.equal(sanitizeRowTax({ ppn: 'hapus', pph: false }).ppn, null);
  });
});

describe('sanitizeTaxMap', () => {
  it('null/bukan JSON/kosong -> map kosong', () => {
    assert.deepEqual(sanitizeTaxMap(null), {});
    assert.deepEqual(sanitizeTaxMap('{rusak'), {});
    assert.deepEqual(sanitizeTaxMap([]), {});
    assert.deepEqual(sanitizeTaxMap('"str"'), {});
  });
  it('tiap kunci uuid disanitasi per-baris', () => {
    const raw = { u1: { ppn: { enabled: true, mode: 'percent', percent: 10, amount: 0 }, pph: true }, u2: 'sampah' };
    const out = sanitizeTaxMap(raw);
    assert.equal(out.u1.ppn.percent, 10);
    assert.equal(out.u1.pph, true);
    assert.deepEqual(out.u2, { ppn: null, pph: false });
  });
  it('diterima juga sebagai string JSON', () => {
    const out = sanitizeTaxMap('{"u1":{"pph":true}}');
    assert.equal(out.u1.pph, true);
    assert.equal(out.u1.ppn, null);
  });
});

describe('sumPpn', () => {
  const rows = [
    { recordUuid: 'a', charges: 1000000 },
    { recordUuid: 'b', charges: 500000 },
    { recordUuid: 'c', charges: 300000 },
  ];
  it('menjumlahkan PPN aktif per baris (persen di basis charges baris)', () => {
    const map = {
      a: { ppn: { enabled: true, mode: 'percent', percent: 10, amount: 0 }, pph: false },
      b: { ppn: { enabled: true, mode: 'rupiah', percent: 0, amount: 25000 }, pph: true },
    };
    assert.equal(sumPpn(rows, map), 100000 + 25000);
  });
  it('status PPH tidak mempengaruhi jumlah PPN', () => {
    const map = { a: { ppn: { enabled: true, mode: 'rupiah', percent: 0, amount: 7000 }, pph: true } };
    assert.equal(sumPpn(rows, map), 7000);
  });
  it('map kosong / entri tanpa PPN -> 0', () => {
    assert.equal(sumPpn(rows, {}), 0);
    assert.equal(sumPpn(rows, { a: { ppn: null, pph: true } }), 0);
    assert.equal(sumPpn([], { a: { ppn: { enabled: true, mode: 'rupiah', percent: 0, amount: 1 }, pph: false } }), 0);
  });
});

describe('pphActiveCount', () => {
  const rows = [{ recordUuid: 'a' }, { recordUuid: 'b' }, { recordUuid: 'c' }];
  it('menghitung baris dengan status PPH aktif', () => {
    const map = { a: { ppn: null, pph: true }, b: { ppn: null, pph: false }, c: { ppn: null, pph: true } };
    assert.equal(pphActiveCount(rows, map), 2);
  });
  it('pph truthy non-boolean tidak dihitung (harus boolean hasil sanitize)', () => {
    const map = { a: { pph: 'ya' }, b: { pph: 1 } };
    assert.equal(pphActiveCount(rows, map), 0);
  });
  it('map kosong -> 0', () =>
    assert.equal(pphActiveCount(rows, {}), 0));
});

describe('normalizeServerRow (bentuk server tanpa flag enabled)', () => {
  it('ppn object valid menjadi entri aktif', () =>
    assert.deepEqual(
      normalizeServerRow({ ppn: { mode: 'percent', percent: 10, amount: 0 }, pph: true }),
      { ppn: { enabled: true, mode: 'percent', percent: 10, amount: 0 }, pph: true }));
  it('ppn null tetap null; pph non-boolean menjadi false', () =>
    assert.deepEqual(normalizeServerRow({ ppn: null, pph: 1 }), { ppn: null, pph: false }));
  it('mode tak dikenal atau bukan objek menjadi null', () => {
    assert.equal(normalizeServerRow({ ppn: { mode: 'manual', amount: 5 }, pph: false }).ppn, null);
    assert.equal(normalizeServerRow({ ppn: 'hapus', pph: false }).ppn, null);
    assert.deepEqual(normalizeServerRow(null), { ppn: null, pph: false });
  });
  it('angka negatif dinormalkan ke 0', () => {
    const out = normalizeServerRow({ ppn: { mode: 'rupiah', percent: 0, amount: -5 }, pph: false });
    assert.equal(out.ppn.amount, 0);
    assert.equal(out.ppn.enabled, true);
  });
});

describe('mergeTaxMaps (outbox menang per baris)', () => {
  it('server kosong + outbox tampil apa adanya', () =>
    assert.deepEqual(mergeTaxMaps({}, { a: { ppn: null, pph: true } }), { a: { ppn: null, pph: true } }));
  it('baris outbox menimpa baris server seutuhnya', () =>
    assert.deepEqual(
      mergeTaxMaps({ a: { ppn: { mode: 'rupiah', percent: 0, amount: 1 }, pph: false } }, { a: { ppn: null, pph: true } }),
      { a: { ppn: null, pph: true } }));
  it('baris tanpa outbox memakai nilai server', () =>
    assert.deepEqual(
      mergeTaxMaps({ a: { ppn: null, pph: true }, b: { ppn: null, pph: false } }, { a: { ppn: null, pph: false } }),
      { a: { ppn: null, pph: false }, b: { ppn: null, pph: false } }));
});

describe('applySaveResult (evict-on-ack)', () => {
  it('sukses menghapus key dari outbox', () =>
    assert.deepEqual(applySaveResult({ a: { ppn: null, pph: true } }, 'a', true), {}));
  it('gagal mempertahankan key (data tak hilang)', () =>
    assert.deepEqual(applySaveResult({ a: { ppn: null, pph: true } }, 'a', false), { a: { ppn: null, pph: true } }));
  it('key lain tidak tersentuh', () =>
    assert.deepEqual(
      applySaveResult({ a: { ppn: null, pph: true }, b: { ppn: null, pph: true } }, 'a', true),
      { b: { ppn: null, pph: true } }));
});

describe('resolveTaxAmount mengikuti charges terbaru', () => {
  it('persen sama di-resolve ulang saat charges berubah (sync Sheets)', () => {
    const entry = { enabled: true, mode: 'percent', percent: 10, amount: 0 };
    assert.equal(resolveTaxAmount(entry, 1000000), 100000);
    assert.equal(resolveTaxAmount(entry, 500000), 50000);
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
