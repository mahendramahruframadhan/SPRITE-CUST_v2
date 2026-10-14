// Agregasi Report Summary (halaman /report): pool tervalidasi
// (ON-CALL; FREE dan MONTHLY dikecualikan). Murni tanpa React agar bisa
// diuji unit terpisah (lihat test/reportSummary.test.mjs).
// Aturan pajak ikut lib/taxSummary.js: PPN menambah charges per baris
// ON-CALL, PPh hanya flag count tanpa potongan rupiah.
import {
  sumPpn,
  pphActiveCount,
  computeSubtotal,
  isTaxableRow,
} from './taxSummary.js';

// Pool report: hanya baris ON-CALL yang tervalidasi. Monthly berbeda jalur,
// FREE dan status lain dikecualikan.
function inPool(row) {
  return isTaxableRow(row?.billingStatus);
}

const zeroBucket = () => ({ count: 0, charges: 0, ppn: 0, subtotal: 0 });

function summarize(rows, taxMap) {
  const b = zeroBucket();
  b.count = rows.length;
  b.charges = rows.reduce((a, r) => a + (+r.charges || 0), 0);
  // PPN hanya dari baris ON-CALL (MONTHLY sudah dikecualikan dari pool).
  b.ppn = sumPpn(rows.filter((r) => isTaxableRow(r?.billingStatus)), taxMap);
  b.subtotal = computeSubtotal({ total: b.charges, ppn: b.ppn });
  return b;
}

export function buildReportSummary(rows, taxMap, invoiceStatus, defaultInvoiceStatus) {
  const pool = (rows || []).filter(inPool);
  const inv = invoiceStatus && typeof invoiceStatus === 'object' ? invoiceStatus : {};

  const byInvoice = {};
  for (const r of pool) {
    const st = inv[r.recordUuid] || defaultInvoiceStatus || 'MENUNGGU INVOICE';
    (byInvoice[st] = byInvoice[st] || []).push(r);
  }
  const byInvoiceSum = {};
  for (const k of Object.keys(byInvoice)) byInvoiceSum[k] = summarize(byInvoice[k], taxMap);

  const paid = summarize(
    pool.filter((r) => (inv[r.recordUuid] || defaultInvoiceStatus) === 'PAID'),
    taxMap
  );
  const outstanding = summarize(
    pool.filter((r) => (inv[r.recordUuid] || defaultInvoiceStatus) !== 'PAID'),
    taxMap
  );

  return {
    ...summarize(pool, taxMap),
    pphCount: pphActiveCount(pool, taxMap),
    byInvoice: byInvoiceSum,
    byBilling: { 'ON-CALL': summarize(pool, taxMap) },
    paid,
    outstanding,
  };
}
