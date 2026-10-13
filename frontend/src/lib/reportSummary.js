// Agregasi Report Summary (halaman /report): pool tervalidasi
// (ON-CALL + MONTHLY, FREE dikecualikan). Murni tanpa React agar bisa
// diuji unit terpisah (lihat test/reportSummary.test.mjs).
// Aturan pajak ikut lib/taxSummary.js: PPN menambah charges per baris
// ON-CALL, PPh hanya flag count tanpa potongan rupiah.
import {
  sumPpn,
  pphActiveCount,
  computeSubtotal,
  isTaxableRow,
} from './taxSummary.js';

const MONTHLY = 'MONTHLY';

function isMonthly(status) {
  if (typeof status !== 'string') return false;
  return status.replace(/[\s-]/g, '').toUpperCase() === MONTHLY;
}

// Pool report: baris yang bisa dipajaki (ON-CALL) atau MONTHLY.
// FREE dan status lain dikecualikan.
function inPool(row) {
  return isTaxableRow(row?.billingStatus) || isMonthly(row?.billingStatus);
}

const zeroBucket = () => ({ count: 0, charges: 0, ppn: 0, subtotal: 0 });

function summarize(rows, taxMap) {
  const b = zeroBucket();
  b.count = rows.length;
  b.charges = rows.reduce((a, r) => a + (+r.charges || 0), 0);
  // PPN hanya dari baris ON-CALL (MONTHLY kontribusi 0, ikut aturan Finance).
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

  const oncall = pool.filter((r) => isTaxableRow(r.billingStatus));
  const monthly = pool.filter((r) => isMonthly(r.billingStatus));

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
    byBilling: { 'ON-CALL': summarize(oncall, taxMap), [MONTHLY]: summarize(monthly, taxMap) },
    paid,
    outstanding,
  };
}
