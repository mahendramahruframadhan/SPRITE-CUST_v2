// Uji struktural tabel: setiap colSpan numerik (EmptyRow/LoadingRow) harus sama
// dengan jumlah <th> pada tabel yang menaunginya — cegah sel melebar/sempit
// diam-diam saat kolom berubah. Murni baca sumber (tanpa DOM).
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../src/pages/', import.meta.url);
const baca = (f) => readFileSync(new URL(f, ROOT), 'utf8');

// colSpan numerik yang diharapkan per file (EmptyRow + LoadingRow per tabel)
const TABEL_NUMERIK = {
  'DashboardPage.jsx': [8, 8],
  'DataKasusPage.jsx': [13, 13],
  'BillingPage.jsx': [12, 12],
  'FinanceAuditPage.jsx': [13, 13],
  'HrReportPage.jsx': [7, 7], // tabel detail; rekap memakai ekspresi dinamis (tes terpisah)
  'MockupPage.jsx': [12, 12],
  'LogsPage.jsx': [4],
};

const BLOK_TABEL = /<table[\s\S]*?<\/table>/g;
const TH = /<th[\s>]/g;
const COLSPAN_NUMERIK = /colSpan=\{(\d+)\}/g;

describe('colSpan tabel vs jumlah kolom', () => {
  for (const [file, ekspektasi] of Object.entries(TABEL_NUMERIK)) {
    it(`${file}: colSpan numerik cocok dengan <th>`, () => {
      const src = baca(file);
      const blok = [...src.matchAll(BLOK_TABEL)];
      assert.ok(blok.length > 0, 'tidak ada <table>');
      const semua = [];
      for (const b of blok) {
        const th = (b[0].match(TH) || []).length;
        for (const m of b[0].matchAll(COLSPAN_NUMERIK)) semua.push({ th, span: +m[1] });
      }
      assert.ok(semua.length > 0, 'tidak ada colSpan numerik');
      for (const { th, span } of semua) assert.equal(span, th, `colSpan ${span} != ${th} <th>`);
      assert.deepEqual(
        semua.map((s) => s.span).sort((a, b) => a - b),
        [...ekspektasi].sort((a, b) => a - b)
      );
    });
  }

  it('HrReportPage.jsx: rekap memakai KPI_COLS.length + 2 di kedua baris', () => {
    const src = baca('HrReportPage.jsx');
    const pakai = src.match(/colSpan=\{KPI_COLS\.length \+ 2\}/g) || [];
    assert.equal(pakai.length, 2, 'EmptyRow + LoadingRow rekap harus sama');
  });
});
