// Uji laporan audit bulanan POPI NAVA — node:test bawaan, tanpa deps.
// buildAuditReport: memperluas jadwal (brand -> seluruh outletnya), menandai
// "sudah audit" bila dicentang manual ATAU foto LOCAL+WEB lengkap, lalu
// meringkas total/sudah/belum. buildAuditReportHtml: file .html mandiri,
// print-friendly, semua teks data di-escape.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditReport, buildAuditReportHtml } from '../src/lib/auditReport.js';

const OUTLETS = [
  { uuid: 'u1', brandName: 'Chambers', deptChannelName: 'Chambers Tebet', city: 'JAKARTA', rvtCustcode: 'RVT-CHM' },
  { uuid: 'u2', brandName: 'Chambers', deptChannelName: 'Chambers Bekasi', city: 'BEKASI', rvtCustcode: 'RVT-CHM' },
  { uuid: 'u3', brandName: 'SCH', deptChannelName: 'SCH Puri', city: 'YOGYAKARTA', rvtCustcode: 'RVT-SCH' },
];

const weeks = (w) => ({ W1: [], W2: [], W3: [], W4: [], W5: [], ...w });

describe('buildAuditReport — cakupan & status audit', () => {
  it('outlet terjadwal: foto lengkap dianggap sudah audit', () => {
    const report = buildAuditReport(
      OUTLETS,
      weeks({ W1: [{ id: 'i1', type: 'outlet', uuid: 'u1', brand: 'Chambers', name: 'Chambers Tebet' }] }),
      { u1: true },
    );
    assert.equal(report.total, 1);
    assert.equal(report.audited, 1);
    assert.equal(report.pending, 0);
    assert.equal(report.weeks[0].key, 'W1');
    assert.equal(report.weeks[0].groups[0].rows[0].via, 'photo');
  });

  it('brand terjadwal: seluruh outlet brand ikut, centang brand menandai semuanya', () => {
    const report = buildAuditReport(
      OUTLETS,
      weeks({ W2: [{ id: 'i2', type: 'brand', brand: 'SCH', audited: true }] }),
      {},
    );
    assert.equal(report.total, 1);
    assert.equal(report.weeks[0].key, 'W2');
    assert.equal(report.weeks[0].groups[0].brand, 'SCH');
    assert.equal(report.weeks[0].groups[0].rows[0].name, 'SCH Puri');
    assert.equal(report.weeks[0].groups[0].rows[0].via, 'brand');
  });

  it('gabungan outlet + brand: dedup outlet yang sama lintas minggu, ringkasan persen', () => {
    const report = buildAuditReport(
      OUTLETS,
      weeks({
        W1: [{ id: 'i1', type: 'outlet', uuid: 'u1', brand: 'Chambers', name: 'Chambers Tebet' }],
        W2: [{ id: 'i2', type: 'brand', brand: 'Chambers' }],
        W3: [{ id: 'i3', type: 'brand', brand: 'SCH', audited: true }],
      }),
      { u1: true },
    );
    assert.equal(report.total, 3, 'u1 hanya dihitung sekali walau ada di W1 + brand W2');
    assert.equal(report.audited, 2, 'u1 foto + u3 centang brand');
    assert.equal(report.pending, 1, 'u2 belum audit');
    assert.equal(report.percent, 67);
  });

  it('outlet tak ada di master tetap tampil dari data jadwal', () => {
    const report = buildAuditReport(
      OUTLETS,
      weeks({ W4: [{ id: 'i4', type: 'outlet', uuid: 'ghost', brand: 'HILANG', name: 'Outlet Hilang' }] }),
      {},
    );
    const row = report.weeks[0].groups[0].rows[0];
    assert.equal(row.name, 'Outlet Hilang');
    assert.equal(row.brand, 'HILANG');
    assert.equal(row.city, '-');
    assert.equal(row.audited, false);
  });

  it('bulan tanpa jadwal: total 0 dan persen 0', () => {
    const report = buildAuditReport(OUTLETS, weeks({}), {});
    assert.deepEqual(report.weeks, []);
    assert.equal(report.total, 0);
    assert.equal(report.percent, 0);
  });
});

describe('buildAuditReportHtml — file mandiri print-friendly', () => {
  const report = buildAuditReport(
    OUTLETS,
    weeks({
      W1: [{ id: 'i1', type: 'outlet', uuid: 'u1', brand: 'Chambers', name: 'Chambers Tebet' }],
      W2: [{ id: 'i2', type: 'brand', brand: 'SCH', audited: true }],
    }),
    { u1: true },
  );

  it('memuat judul bulan, ringkasan, dan status tiap toko', () => {
    const html = buildAuditReportHtml({
      monthLabel: 'November 2026',
      generatedAt: '13 Nov 2026, 16:00',
      report,
      weekRanges: { W1: '2-6 Nov', W2: '9-13 Nov' },
    });
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /Laporan Audit POPI NAVA/);
    assert.match(html, /November 2026/);
    assert.match(html, /Chambers Tebet/);
    assert.match(html, /SCH Puri/);
    assert.match(html, /Sudah audit/);
    assert.match(html, /Belum audit/);
    assert.match(html, /2-6 Nov/);
  });

  it('teks data di-escape (tidak ada HTML/script mentah dari nama brand)', () => {
    const evil = buildAuditReport(
      [{ uuid: 'x1', brandName: '<script>alert(1)</script>', deptChannelName: '<b>Toko</b>', city: 'X', rvtCustcode: 'R' }],
      weeks({ W1: [{ id: 'e1', type: 'brand', brand: '<script>alert(1)</script>' }] }),
      {},
    );
    const html = buildAuditReportHtml({
      monthLabel: 'Nov 2026',
      generatedAt: 'now',
      report: evil,
      weekRanges: { W1: '2-6 Nov' },
    });
    assert.ok(!html.includes('<script>alert(1)</script>'), 'script mentah tidak boleh lolos');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;b&gt;Toko&lt;/b&gt;'));
  });
});
