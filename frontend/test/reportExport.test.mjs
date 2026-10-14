// Builder CSV Report Summary — rekap per status invoice +
// per billing status + kop periode. Ikut pola billingExport.js.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportCsv, reportCsvFilename } from '../src/lib/reportExport.js';

const SUMMARY = {
  count: 2, charges: 3000000, ppn: 110000, subtotal: 3110000, pphCount: 1,
  byInvoice: {
    PAID: { count: 1, charges: 1000000, ppn: 110000, subtotal: 1110000 },
    DIKIRIM: { count: 1, charges: 2000000, ppn: 0, subtotal: 2000000 },
  },
  byBilling: {
    'ON-CALL': { count: 1, charges: 1000000, ppn: 110000, subtotal: 1110000 },
  },
  paid: { count: 1, charges: 1000000, ppn: 110000, subtotal: 1110000 },
  outstanding: { count: 1, charges: 2000000, ppn: 0, subtotal: 2000000 },
};

describe('buildReportCsv', () => {
  it('memuat kop periode + baris status invoice', () => {
    const csv = buildReportCsv(SUMMARY, { periode: '2026-10-01 s.d. 2026-10-31' });
    assert.match(csv, /2026-10-01 s\.d\. 2026-10-31/);
    assert.match(csv, /PAID/);
    assert.match(csv, /DIKIRIM/);
  });

  it('memuat seksi billing ON-CALL + info PPh', () => {
    const csv = buildReportCsv(SUMMARY, { periode: 'P' });
    assert.match(csv, /ON-CALL/);
    assert.match(csv, /PPh/);
  });

  it('escape kutip ganda', () => {
    const csv = buildReportCsv(SUMMARY, { periode: 'Bulan "Oktober"' });
    assert.match(csv, /Bulan ""Oktober""/);
  });
});

describe('reportCsvFilename', () => {
  it('dari tanggal akhir periode', () =>
    assert.equal(reportCsvFilename('2026-10-01 s.d. 2026-10-31'), 'report-summary-20261031.csv'));
  it('fallback hari ini bila periode kosong', () =>
    assert.match(reportCsvFilename(''), /^report-summary-\d{8}\.csv$/));
});
