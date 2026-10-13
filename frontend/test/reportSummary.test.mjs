// Agregasi Report Summary: pool tervalidasi (VALID - SIAP INVOICE,
// ON-CALL + MONTHLY, FREE dikecualikan). PPN menambah charges, PPh hanya
// count tanpa potongan — konsisten dengan lib/taxSummary.js.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportSummary } from '../src/lib/reportSummary.js';

describe('buildReportSummary (pool tervalidasi)', () => {
  it('charges + PPN persen ON-CALL, PPh hanya count', () => {
    const rows = [
      { recordUuid: 'a', charges: 1000000, billingStatus: 'ON-CALL' },
      { recordUuid: 'b', charges: 2000000, billingStatus: 'MONTHLY' },
    ];
    const taxMap = {
      a: { ppn: { enabled: true, mode: 'percent', percent: 11, amount: 0 }, pph: true },
    };
    const s = buildReportSummary(rows, taxMap, {}, 'MENUNGGU INVOICE');
    assert.equal(s.count, 2);
    assert.equal(s.charges, 3000000);
    assert.equal(s.ppn, 110000);
    assert.equal(s.subtotal, 3110000);
    assert.equal(s.pphCount, 1);
  });

  it('PPN rupiah dipakai apa adanya', () => {
    const rows = [{ recordUuid: 'a', charges: 1000000, billingStatus: 'ON-CALL' }];
    const taxMap = {
      a: { ppn: { enabled: true, mode: 'rupiah', percent: 0, amount: 50000 }, pph: false },
    };
    const s = buildReportSummary(rows, taxMap, {}, 'MENUNGGU INVOICE');
    assert.equal(s.ppn, 50000);
    assert.equal(s.subtotal, 1050000);
  });

  it('MONTHLY tidak pernah menyumbang PPN', () => {
    const rows = [{ recordUuid: 'b', charges: 2000000, billingStatus: 'MONTHLY' }];
    const taxMap = {
      b: { ppn: { enabled: true, mode: 'percent', percent: 11, amount: 0 }, pph: false },
    };
    const s = buildReportSummary(rows, taxMap, {}, 'MENUNGGU INVOICE');
    assert.equal(s.ppn, 0);
    assert.equal(s.subtotal, 2000000);
  });

  it('FREE dikecualikan walau masuk rows', () => {
    const rows = [
      { recordUuid: 'f', charges: 9000000, billingStatus: 'FREE' },
      { recordUuid: 'a', charges: 1000000, billingStatus: 'ON-CALL' },
    ];
    const s = buildReportSummary(rows, {}, {}, 'MENUNGGU INVOICE');
    assert.equal(s.count, 1);
    assert.equal(s.charges, 1000000);
  });

  it('pecahan PAID vs outstanding dari subtotal', () => {
    const rows = [
      { recordUuid: 'a', charges: 1000000, billingStatus: 'ON-CALL' },
      { recordUuid: 'b', charges: 2000000, billingStatus: 'ON-CALL' },
    ];
    const s = buildReportSummary(rows, {}, { a: 'PAID', b: 'DIKIRIM' }, 'MENUNGGU INVOICE');
    assert.equal(s.paid.count, 1);
    assert.equal(s.paid.subtotal, 1000000);
    assert.equal(s.outstanding.count, 1);
    assert.equal(s.outstanding.subtotal, 2000000);
    assert.equal(s.byInvoice.PAID.count, 1);
    assert.equal(s.byInvoice.DIKIRIM.count, 1);
  });

  it('status invoice tak dikenal memakai default', () => {
    const rows = [{ recordUuid: 'a', charges: 500000, billingStatus: 'ON-CALL' }];
    const s = buildReportSummary(rows, {}, {}, 'MENUNGGU INVOICE');
    assert.equal(s.byInvoice['MENUNGGU INVOICE'].count, 1);
  });

  it('pool kosong menghasilkan semua nol', () => {
    const s = buildReportSummary([], {}, {}, 'MENUNGGU INVOICE');
    assert.equal(s.count, 0);
    assert.equal(s.charges, 0);
    assert.equal(s.ppn, 0);
    assert.equal(s.subtotal, 0);
    assert.equal(s.pphCount, 0);
    assert.equal(s.paid.count, 0);
    assert.equal(s.outstanding.count, 0);
  });

  it('pecahan per billing status ON-CALL vs MONTHLY', () => {
    const rows = [
      { recordUuid: 'a', charges: 1000000, billingStatus: 'ON-CALL' },
      { recordUuid: 'b', charges: 2000000, billingStatus: 'MONTHLY' },
    ];
    const s = buildReportSummary(rows, {}, {}, 'MENUNGGU INVOICE');
    assert.equal(s.byBilling['ON-CALL'].count, 1);
    assert.equal(s.byBilling['ON-CALL'].charges, 1000000);
    assert.equal(s.byBilling.MONTHLY.count, 1);
    assert.equal(s.byBilling.MONTHLY.charges, 2000000);
  });
});
