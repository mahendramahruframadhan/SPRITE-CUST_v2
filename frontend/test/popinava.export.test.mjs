// Ekspor POPI NAVA (spec §11) — node:test murni.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_HEADERS,
  toCsvString,
  recordsToMatrix,
  buildTemplateMatrix,
  exportFileName,
} from '../src/lib/popinavaExport.js';

const record = {
  uuid: '83e50b99-ecf6-4f58-a7a4-386def231b2f',
  brandName: 'HAPPY GO LUCKY',
  rvtCustcode: 'RVT-HGL',
  deptCode: '03010301',
  deptName: 'DISTRIBUTION',
  deptChannelName: 'DISTRIBUTION HQ, Lantai 2',
  deptReference: '',
  isoCode: 'ID-JB',
  address: 'JL. CILIWUNG NO.14',
  city: 'BANDUNG',
  province: 'JAWA BARAT',
  postcode: '40114',
  country: 'INDONESIA',
  area: 'P.JAWA',
  region: 'WIB',
  email: '',
  notes: '',
  sourceCreatedAt: '2023-05-03 09:11:20',
  status: 'active',
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
};

describe('export POPI NAVA', () => {
  it('header = 18 kolom data sumber, urut seperti sheet', () => {
    assert.equal(EXPORT_HEADERS.length, 18);
    assert.deepEqual(EXPORT_HEADERS.slice(0, 4), ['uuid', 'brand_name', 'rvt_custcode', 'dept_code']);
    assert.equal(EXPORT_HEADERS[17], 'created_at');
    // tanpa system field aplikasi (§11)
    assert.ok(!EXPORT_HEADERS.includes('updated_at'));
    assert.ok(!EXPORT_HEADERS.includes('updated_by'));
  });

  it('matrix ekspor: header + 1 baris, system field tidak ikut', () => {
    const matrix = recordsToMatrix([record]);
    assert.equal(matrix.length, 2);
    assert.deepEqual(matrix[0], EXPORT_HEADERS);
    assert.equal(matrix[1][1], 'HAPPY GO LUCKY');
    assert.equal(matrix[1][5], 'DISTRIBUTION HQ, Lantai 2'); // koma di-quote
    assert.equal(matrix[1][17], '2023-05-03 09:11:20');
    assert.ok(!matrix[0].includes('updated_at'));
  });

  it('CSV memakai BOM UTF-8, quote koma/kutip, baris \r\n', () => {
    const csv = toCsvString(recordsToMatrix([record]));
    assert.ok(csv.startsWith('\uFEFF'), 'BOM di awal supaya Excel benar');
    assert.ok(csv.includes('"DISTRIBUTION HQ, Lantai 2"'));
    assert.ok(csv.endsWith('\r\n'));
    const dataLine = csv.slice(1).split('\r\n')[1];
    assert.equal(dataLine.split(',').length >= 18 || dataLine.includes('"'), true);
  });

  it('template: header + 1 baris contoh', () => {
    const t = buildTemplateMatrix();
    assert.equal(t.length, 2);
    assert.deepEqual(t[0], EXPORT_HEADERS);
    assert.equal(t[1][2], 'RVT-XYZ');
    assert.equal(t[1][4], 'SHOP');
  });

  it('nama file ekspor pakai tanggal', () => {
    assert.equal(exportFileName('csv', new Date('2026-09-29T08:00:00Z')), 'popinava-outlet-2026-09-29.csv');
    assert.equal(exportFileName('xlsx', new Date('2026-09-29T08:00:00Z')), 'popinava-outlet-2026-09-29.xlsx');
  });
});
