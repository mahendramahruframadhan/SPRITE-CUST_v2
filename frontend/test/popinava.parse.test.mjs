// Parser impor POPI NAVA (spec §9/§10.3) — node:test murni dengan SheetJS.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseCsv, matrixToRecords, parseImportFile, MAX_FILE_BYTES } from '../src/lib/popinavaParse.js';

describe('parseCsv', () => {
  it('kutip ganda, koma di dalam kutip, \r\n, dan BOM', () => {
    const rows = parseCsv('\uFEFFuuid,alamat\r\nabc,"Jl. A, No. 1"\r\nxyz,"kata ""kutip"""\r\n');
    assert.deepEqual(rows[0], ['uuid', 'alamat']);
    assert.deepEqual(rows[1], ['abc', 'Jl. A, No. 1']);
    assert.deepEqual(rows[2], ['xyz', 'kata "kutip"']);
  });
});

const HEADER = [
  'uuid', 'rvt_custcode', 'dept_code', 'dept_name', 'dept_channel_name',
  'dept_reference', 'iso_code', 'address', 'city', 'province', 'postcode',
  'country', 'area', 'region', 'email', 'notes', 'created_at',
];

function blockMatrix() {
  // Meniru sheet: judul, jarak kosong, header di baris 5, label brand, data.
  return [
    ['SERVICE - POPI NAVA'],
    [],
    ['Filter: aktif'],
    [],
    HEADER,
    ['HAPPY GO LUCKY'],
    ['83e50b99-ecf6-4f58-a7a4-386def231b2f', 'RVT-HGL', '03010301', 'DISTRIBUTION', 'DISTRIBUTION HQ', '-', 'ID-JB', 'Jl. Ciliwung', 'BANDUNG', 'JAWA BARAT', 40114, 'INDONESIA', 'P.JAWA', 'WIB', '-', '-', '2023-05-03 09:11:20'],
    ['MAYOUTFIT'],
    ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'RVT-MYO', '03010501', 'SHOP', 'MYO Mall', '-', 'ID-JK', 'Jl. Sudirman', 'JAKARTA', 'DKI JAKARTA', 10110, 'INDONESIA', 'P.JAWA', 'WIB', '-', '-', '2024-01-10 08:00:00'],
  ];
}

describe('matrixToRecords', () => {
  it('header ditemukan di baris mana pun (bukan indeks tetap)', () => {
    const { headerRow, entries } = matrixToRecords(blockMatrix());
    assert.equal(headerRow, 5);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].row, 7);
    assert.equal(entries[1].row, 9);
  });

  it('label blok brand menempel ke baris data berikutnya', () => {
    const { entries } = matrixToRecords(blockMatrix());
    assert.equal(entries[0].data.brand_name, 'HAPPY GO LUCKY');
    assert.equal(entries[1].data.brand_name, 'MAYOUTFIT');
  });

  it('tanpa header kolom dikenal → UNSUPPORTED_FILE', () => {
    assert.throws(
      () => matrixToRecords([['a', 'b'], ['c', 'd']]),
      (e) => e.code === 'UNSUPPORTED_FILE'
    );
  });

  it('CSV dengan kolom brand_name (pola lama tanpa blok label)', () => {
    const csv = [
      'brand_name,rvt_custcode,dept_code,city',
      'STARCROSS,RVT-STR,03010501,BANDUNG',
      'STARCROSS,RVT-STR,03010502,SURABAYA',
    ].join('\n');
    const { entries } = matrixToRecords(parseCsv(csv));
    assert.equal(entries.length, 2);
    assert.equal(entries[0].data.brand_name, 'STARCROSS');
    assert.equal(entries[1].data.brand_name, 'STARCROSS');
  });
});

function xlsxFile(rows, name = 'POPI NAVA') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], 'DOC. CUSTOMER ACTIVE.xlsx');
}

describe('parseImportFile', () => {
  it('baca .xlsx sheet POPI NAVA (preferensi nama sheet)', async () => {
    const file = xlsxFile(blockMatrix());
    const res = await parseImportFile(file);
    assert.equal(res.fileName, 'DOC. CUSTOMER ACTIVE.xlsx');
    assert.equal(res.entries.length, 2);
    assert.equal(res.entries[0].data.brand_name, 'HAPPY GO LUCKY');
    // cell numerik Excel sudah dipetakan ke string saat parse
    assert.equal(res.entries[0].data.postcode, '40114');
  });

  it('tanpa sheet POPI NAVA pakai sheet pertama', async () => {
    const file = xlsxFile(blockMatrix(), 'Data Lain');
    const res = await parseImportFile(file);
    assert.equal(res.entries.length, 2);
  });

  it('baca .csv', async () => {
    const csv = 'uuid,rvt_custcode,dept_code,dept_name,city,created_at\n' +
      '11111111-1111-4111-8111-111111111111,RVT-ABC,03010501,SHOP,BANDUNG,2025-01-01 00:00:00\n';
    const file = new File([csv], 'outlet.csv');
    const res = await parseImportFile(file);
    assert.equal(res.entries.length, 1);
    assert.equal(res.entries[0].data.rvt_custcode, 'RVT-ABC');
  });

  it('ekstensi tak didukung → UNSUPPORTED_FILE', async () => {
    const file = new File(['x'], 'data.txt');
    await assert.rejects(parseImportFile(file), (e) => e.code === 'UNSUPPORTED_FILE');
  });

  it('file > 5 MB → FILE_TOO_LARGE', async () => {
    const file = new File([new ArrayBuffer(MAX_FILE_BYTES + 1)], 'besar.xlsx');
    await assert.rejects(parseImportFile(file), (e) => e.code === 'FILE_TOO_LARGE');
  });

  it('xlsx rusak/kosong → UNSUPPORTED_FILE', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['judul saja']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const file = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'kosong.xlsx');
    await assert.rejects(parseImportFile(file), (e) => e.code === 'UNSUPPORTED_FILE');
  });
});
