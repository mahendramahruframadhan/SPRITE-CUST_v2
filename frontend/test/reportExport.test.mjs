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
  it('memuat kop periode + baris status invoice (legacy tervalidasi)', () => {
    const csv = buildReportCsv(SUMMARY, { periode: '2026-10-01 s.d. 2026-10-31' });
    assert.match(csv, /^"REPORT SUMMARY — KASUS TERVALIDASI"/);
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

  it('memuat seksi operasional + per user saat workload ada', () => {
    const workload = {
      totals: { count: 10, done: 8, open: 2, validated: 3, byBilling: {
        'ON-CALL': { count: 2, done: 2, open: 0, validated: 1, charges: 1000, ppn: 110, subtotal: 1110 },
        MONTHLY: { count: 3, done: 3, open: 0, validated: 1, charges: 0, ppn: 0, subtotal: 0 },
        FREE: { count: 5, done: 3, open: 2, validated: 1, charges: 0, ppn: 0, subtotal: 0 },
        LAINNYA: { count: 0, done: 0, open: 0, validated: 0, charges: 0, ppn: 0, subtotal: 0 },
      } },
      byAssignee: [{ assignTo: 'RAMA', count: 5, done: 4, open: 1, validated: 1, byBilling: { 'ON-CALL': 2, MONTHLY: 1, FREE: 2, LAINNYA: 0 }, brandCount: 2, moduleCount: 3, onCallSubtotal: 1110 }],
      byBrand: [{ brand: 'ERIGO', count: 5, byBilling: { 'ON-CALL': 2, MONTHLY: 1, FREE: 2, LAINNYA: 0 }, onCallSubtotal: 1110 }],
      byModule: [{ module: 'POS', count: 4, byBilling: { 'ON-CALL': 1, MONTHLY: 1, FREE: 2, LAINNYA: 0 }, onCallSubtotal: 500 }],
    };
    const csv = buildReportCsv({ count: 1, subtotal: 1110 }, { periode: 'P', workload });
    assert.match(csv, /^"REPORT SUMMARY — REKAP OPERASIONAL & FINANSIAL"/);
    assert.match(csv, /RINGKASAN OPERASIONAL/);
    assert.match(csv, /RINCIAN PER USER/);
    assert.match(csv, /RAMA/);
    assert.match(csv, /RINCIAN PER BILLING STATUS \(OPERASIONAL\)/);
    assert.match(csv, /"ON-CALL","2","20","2","0","1","1000","110","1110"/);
    assert.match(csv, /"MONTHLY","3","30","3","0","1","0","0","0"/);
    assert.match(csv, /"FREE","5","50","3","2","1","0","0","0"/);
    assert.match(csv, /"USER","ON-CALL","MONTHLY","FREE","LAINNYA","TOTAL","DONE","OPEN","PORSI","BRAND","MODUL","NILAI ON-CALL","TERVALIDASI"/);
    assert.match(csv, /"RAMA","2","1","2","0","5","4","1","50","2","3","1110","1"/);
    assert.match(csv, /"BRAND","ON-CALL","MONTHLY","FREE","LAINNYA","TOTAL","NILAI ON-CALL"/);
    assert.match(csv, /"ERIGO","2","1","2","0","5","1110"/);
    assert.match(csv, /"MODULE","ON-CALL","MONTHLY","FREE","LAINNYA","TOTAL","NILAI ON-CALL"/);
    assert.match(csv, /"POS","1","1","2","0","4","500"/);
  });

  it('tanpa workload tidak memuat seksi operasional (kompatibel output lama)', () => {
    const csv = buildReportCsv({ count: 1, subtotal: 0 }, { periode: 'P' });
    assert.match(csv, /^"REPORT SUMMARY — KASUS TERVALIDASI"/);
    assert.doesNotMatch(csv, /RINGKASAN OPERASIONAL/);
    assert.match(csv, /RINCIAN PER STATUS INVOICE/);
  });
});

describe('reportCsvFilename', () => {
  it('dari tanggal akhir periode', () =>
    assert.equal(reportCsvFilename('2026-10-01 s.d. 2026-10-31'), 'report-summary-20261031.csv'));
  it('fallback hari ini bila periode kosong', () =>
    assert.match(reportCsvFilename(''), /^report-summary-\d{8}\.csv$/));
});
