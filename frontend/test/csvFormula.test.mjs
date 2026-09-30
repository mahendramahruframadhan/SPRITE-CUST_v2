// M7: formula injection CSV — nilai yang diawali =, +, -, @ (dan TAB/CR)
// harus dineutralisasi saat ekspor dan dipulihkan saat impor (round-trip).
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeCsvFormula, unescapeCsvFormula } from '../src/lib/csvFormula.js';
import { toCsvString } from '../src/lib/popinavaExport.js';
import { parseCsv, matrixToRecords } from '../src/lib/popinavaParse.js';
import { SOURCE_FIELDS } from '../src/lib/popinavaValidate.js';

describe('escapeCsvFormula', () => {
  it('menprefix apostrophe pada awalan formula', () => {
    for (const v of ['=SUM(A1)', '+1+2', '-2+3', '@cmd', '\tx', '\rx']) {
      assert.equal(escapeCsvFormula(v), `'${v}`, `harus diprefiks: ${JSON.stringify(v)}`);
    }
  });

  it('nilai biasa tidak diubah', () => {
    for (const v of ['normal', 'RVT-HGL', '2026-01-05', 'a=b', '', null, undefined, 42]) {
      assert.equal(escapeCsvFormula(v), v === null || v === undefined ? '' : String(v));
    }
  });
});

describe('unescapeCsvFormula', () => {
  it('menghapus satu apostrophe tepat sebelum awalan formula', () => {
    assert.equal(unescapeCsvFormula("'=SUM(A1)"), '=SUM(A1)');
    assert.equal(unescapeCsvFormula("'-2+3"), '-2+3');
    assert.equal(unescapeCsvFormula("'@cmd"), '@cmd');
  });

  it('apostrophe biasa disentuh (O’Brien dll tetap utuh)', () => {
    assert.equal(unescapeCsvFormula("'O'Brien"), "'O'Brien");
    assert.equal(unescapeCsvFormula('plain'), 'plain');
    assert.equal(unescapeCsvFormula(''), '');
  });

  it('round-trip: escape → unescape identik', () => {
    for (const v of ['=1+1', '+x', '-x', '@x', "'O'Brien", 'normal', 'a=b']) {
      assert.equal(unescapeCsvFormula(escapeCsvFormula(v)), String(v));
    }
  });
});

describe('ekspor/impor POPI NAVA anti formula injection', () => {
  it('toCsvString memberprefix sel formula', () => {
    const csv = toCsvString([['notes'], ['=HYPERLINK("http://evil")']]);
    assert.match(csv, /'=HYPERLINK/);
    assert.ok(
      !csv.split('\r\n').some((line) => line.startsWith('=HYPERLINK')),
      'nilai formula tidak boleh mentah di awal baris',
    );
  });

  it('round-trip export → parse memulihkan nilai asli', () => {
    const header = [...SOURCE_FIELDS];
    const row = header.map((f) => (f === 'brand_name' ? 'BRAND X' : f === 'notes' ? '=ISBLANK(A1)' : ''));
    const csv = toCsvString([header, row]);
    const { entries } = matrixToRecords(parseCsv(csv));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].data.notes, '=ISBLANK(A1)', 'nilai asli pulih setelah parse');
  });
});
