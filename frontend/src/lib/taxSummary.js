// Perhitungan pajak halaman Finance: PPN, PPH & Subtotal Akhir.
// Murni tanpa React agar bisa diuji unit terpisah (lihat test/taxSummary.test.mjs).
const toNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nonNeg = (v) => Math.max(0, toNum(v));

const NON_AKTIF = { enabled: false, mode: null, percent: 0, amount: 0 };

export function amountFromPercent(total, percent) {
  const t = toNum(total);
  const p = toNum(percent);
  if (t <= 0 || p <= 0) return 0;
  return Math.round((t * p) / 100);
}

export function computeSubtotal({ total, ppn, pph }) {
  return toNum(total) + toNum(ppn) - toNum(pph);
}

export function resolveTaxAmount(entry, total) {
  if (!entry || entry.enabled !== true) return 0;
  if (entry.mode === 'percent') return amountFromPercent(total, entry.percent);
  return toNum(entry.amount);
}

function sanitizeEntry(e) {
  if (!e || typeof e !== 'object') return { ...NON_AKTIF };
  const enabled = e.enabled === true;
  return {
    enabled,
    mode: enabled ? (e.mode === 'percent' ? 'percent' : 'rupiah') : null,
    percent: nonNeg(e.percent),
    amount: nonNeg(e.amount),
  };
}

export function sanitizeTaxState(raw) {
  let parsed = null;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  return {
    ppn: sanitizeEntry(parsed && parsed.ppn),
    pph: sanitizeEntry(parsed && parsed.pph),
  };
}

export function validateRpInput(str) {
  return typeof str === 'string' && /^\d+$/.test(str);
}

export function validatePercentInput(str) {
  return typeof str === 'string' && /^\d+(\.\d+)?$/.test(str);
}
