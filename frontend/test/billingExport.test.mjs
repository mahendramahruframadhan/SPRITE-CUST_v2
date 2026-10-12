// Export CSV Billing & Audit: builder dipakai "Kategori ini" dan "Semua kategori".
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBillingCsv, billingCsvFilename } from '../src/lib/billingExport.js';

const row = (over = {}) => ({
  no: 1,
  dateIssue: '20260901',
  client: 'Acme Corp',
  issue: 'Login gagal',
  picName: 'Budi',
  module: 'Auth',
  billingStatus: 'ON-CALL',
  billingCategory: 'Incident',
  supportType: 'Remote',
  charges: 150000,
  completionNotes: 'Selesai',
  recordUuid: 'uuid-1',
  ...over,
});

const cells = (line) =>
  line
    .split('","')
    .map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));

describe('buildBillingCsv', () => {
  it('header menyimpan urutan kolom lama, termasuk BILLING STATUS dan STATUS VALIDASI', () => {
    // Header tidak dikutip (join koma polos, sama seperti ekspor lama).
    const [header] = buildBillingCsv([row()], {}).split('\n');
    const cols = header.split(',');
    assert.equal(cols[6], 'BILLING STATUS');
    assert.equal(cols[10], 'STATUS VALIDASI');
    assert.equal(cols[12], 'RECORD_UUID');
  });

  it('semua kategori (ON-CALL, MONTHLY, FREE) ikut terexport bila semua baris diberikan', () => {
    const rows = [
      row({ recordUuid: 'a', billingStatus: 'ON-CALL', charges: 100000 }),
      row({ recordUuid: 'b', billingStatus: 'MONTHLY', charges: 200000 }),
      row({ recordUuid: 'c', billingStatus: 'FREE', charges: 0 }),
    ];
    const lines = buildBillingCsv(rows, {}).split('\n');
    assert.equal(lines.length, 4, 'header + tiga baris data');
    const statuses = lines.slice(1).map((l) => cells(l)[6]);
    assert.deepEqual(statuses, ['ON-CALL', 'MONTHLY', 'FREE']);
  });

  it('status validasi diambil dari peta, kosong bila belum divalidasi', () => {
    const rows = [
      row({ recordUuid: 'a', billingStatus: 'ON-CALL' }),
      row({ recordUuid: 'b', billingStatus: 'ON-CALL' }),
    ];
    const lines = buildBillingCsv(rows, { a: 'VALID - SIAP INVOICE' }).split('\n');
    assert.equal(cells(lines[1])[10], 'VALID - SIAP INVOICE');
    assert.equal(cells(lines[2])[10], '');
  });

  it('kutip ganda pada nilai dipertahankan lewat quote doubling', () => {
    const lines = buildBillingCsv([row({ client: 'Foo "Bar" Baz' })], {}).split('\n');
    assert.equal(cells(lines[1])[2], 'Foo "Bar" Baz');
  });
});

describe('billingCsvFilename', () => {
  it('kategori aktif memakai nama kategori huruf kecil', () => {
    assert.equal(billingCsvFilename('category', 'ON-CALL'), 'billing-audit-on-call.csv');
    assert.equal(billingCsvFilename('category', 'MONTHLY'), 'billing-audit-monthly.csv');
  });

  it('semua kategori memakai nama tetap', () => {
    assert.equal(billingCsvFilename('all', 'MONTHLY'), 'billing-audit-semua-kategori.csv');
  });
});
