// Laporan Billing On-Call: filter tiket, nilai seragam, dan kedua pivot summary.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  reportTickets,
  uniformValue,
  sumCharges,
  buildPivotClientSupport,
  buildPivotCategory,
} from '../src/lib/billingReportData.js';

// Contoh nyata dari spec (10 tiket, periode 01–28 Okt 2026, total Rp 2.101.038).
const sample = [
  { recordUuid: 'e1619a43-3d94-4ea3-8661-203a55274eaf', dateIssue: '20261028', client: 'ISSUE', issue: 'UPdate transaksi receive salan consignment ', picName: 'WAHYU ', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'UPDATE TRANSAKSI', supportType: 'SUPPORT TYPE - C', charges: 83413, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: '49543724-df0f-400f-83dd-3c685c5e85c9', dateIssue: '20261026', client: 'SMITH', issue: 'ROllback transaksi picklist kasir salah subtotal', picName: 'BABIL', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'ROLLBACK TRANSAKSI', supportType: 'SUPPORT TYPE - C', charges: 83413, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: '22cea7a0-0827-4b63-9ba3-c3e52d4679e8', dateIssue: '20261023', client: 'MAYOUTFIT', issue: 'Perpanjang lisensi revota event 2 (EXP - 2026-12-07)', picName: 'NOVITA', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'PREPAID LICENSE', supportType: 'SUPPORT TYPE - B', charges: 555000, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: 'fe8bc254-23d2-4bb6-8b6d-656ca4fa7e5b', dateIssue: '20261022', client: 'SMITH', issue: 'Perpindahan server HOUSE OF SMITH expo 23', picName: 'INSAN', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'PINDAH SERVER', supportType: 'SUPPORT TYPE - B', charges: 166703, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: '2188ece3-a851-4121-a3ec-52f2b9311f79', dateIssue: '20261019', client: 'STARCROSS', issue: 'Rebuild db shop kendari ', picName: 'BAGAS', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'REBUILD DATABASE', supportType: 'SUPPORT TYPE - B', charges: 556416, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: '8101de6a-1542-42ca-b743-ad48e0d3c629', dateIssue: '20261019', client: 'MAYOUTFIT', issue: 'Perpindahan server ex serpong menjadi komputer event', picName: 'NOVITA', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'PINDAH SERVER', supportType: 'SUPPORT TYPE - B', charges: 166703, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: 'c763cfab-a3f4-4c4a-aec6-626fd4da203e', dateIssue: '20261014', client: 'DISCLOSURE SHOP JAKARTA', issue: 'PINDAH server jakarta menjadi pc event', picName: '', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'INJECT SHOP CONTROL', supportType: 'SUPPORT TYPE - A', charges: 239151, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: '5a34d884-f43c-44c6-8734-6ee34aefb7de', dateIssue: '20261013', client: 'HOY JAKARTA', issue: 'Instal system revota toko', picName: 'lutvim', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'REINSTALL TRAVICS', supportType: 'SUPPORT TYPE - B', charges: 83413, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: 'd8e2bb38-c98a-4293-a0e1-08e63982eb0f', dateIssue: '20261001', client: 'ISSUE', issue: 'Revisi report consignment payment  bulan september', picName: 'WAHYU', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'UPDATE TRANSAKSI', supportType: 'SUPPORT TYPE - C', charges: 83413, completionNotes: 'SAME DAY SERVICE' },
  { recordUuid: '2f574a66-d26d-4eb7-88b1-d4a9aa7991de', dateIssue: '20261001', client: 'RADSAMIHARBI.CO', issue: 'instal client system distribusi RADSA', picName: '', module: 'SHOP', billingStatus: 'ON-CALL', billingCategory: 'REINSTALL TRAVICS', supportType: 'SUPPORT TYPE - B', charges: 83413, completionNotes: 'SAME DAY SERVICE' },
];

describe('reportTickets', () => {
  it('hanya mengambil ON-CALL dalam periode, trim teks, terbaru di atas', () => {
    const rows = reportTickets(
      [...sample, { ...sample[0], recordUuid: 'x1', billingStatus: 'FREE' }, { ...sample[0], recordUuid: 'x2', dateIssue: '20261201' }],
      { from: '2026-10-01', to: '2026-10-31' }
    );
    assert.equal(rows.length, 10);
    assert.equal(rows[0].dateIssue, '20261028');
    assert.equal(rows[0].pic, 'WAHYU'); // ter-trim
    assert.equal(rows[6].pic, '–'); // PIC kosong
    assert.ok(rows.every((r) => r.billingStatus === 'ON-CALL'));
  });

  it('filter brand memakai nama client apa adanya', () => {
    const rows = reportTickets(sample, { from: '', to: '', brand: 'SMITH' });
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.client === 'SMITH'));
  });

  it('data kosong -> array kosong', () => {
    assert.deepEqual(reportTickets([], {}), []);
    assert.deepEqual(reportTickets(sample, { from: '2027-01-01', to: '2027-01-31' }), []);
  });
});

describe('uniformValue', () => {
  it('satu nilai bila seragam, Beragam bila beda', () => {
    assert.equal(uniformValue(sample.map((s) => ({ module: 'SHOP' })), 'module'), 'SHOP');
    assert.equal(uniformValue([{ m: 'A' }, { m: 'B' }], 'm'), 'Beragam');
    assert.equal(uniformValue([], 'm'), '–');
  });
});

describe('pivot summary (contoh spec)', () => {
  const rows = reportTickets(sample, { from: '2026-10-01', to: '2026-10-28' });

  it('total charges = Rp 2.101.038', () => {
    assert.equal(sumCharges(rows), 2101038);
  });

  it('pivot 1: grand total per support type sesuai spec', () => {
    const p = buildPivotClientSupport(rows);
    assert.equal(p.grand.total, 2101038);
    assert.equal(p.grand.tickets, 10);
    assert.equal(p.grand.byType.get('SUPPORT TYPE - A'), 239151);
    assert.equal(p.grand.byType.get('SUPPORT TYPE - B'), 1611648);
    assert.equal(p.grand.byType.get('SUPPORT TYPE - C'), 250239);
    const issue = p.body.find((r) => r.client === 'ISSUE');
    assert.equal(issue.tickets, 2);
    assert.equal(issue.byType.get('SUPPORT TYPE - C'), 166826);
  });

  it('pivot 2: urut total terbesar + grand total sama dengan total charges', () => {
    const p = buildPivotCategory(rows);
    assert.equal(p.grand.total, 2101038);
    assert.equal(p.grand.tickets, 10);
    assert.deepEqual(
      p.body.map((r) => [r.category, r.total]),
      [
        ['REBUILD DATABASE', 556416],
        ['PREPAID LICENSE', 555000],
        ['PINDAH SERVER', 333406],
        ['INJECT SHOP CONTROL', 239151],
        ['UPDATE TRANSAKSI', 166826],
        ['REINSTALL TRAVICS', 166826],
        ['ROLLBACK TRANSAKSI', 83413],
      ]
    );
  });
});
