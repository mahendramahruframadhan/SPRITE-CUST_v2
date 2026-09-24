// Helper format bersama seluruh aplikasi

export function fmtDate8(s) {
  if (!s || String(s).length !== 8) return '-';
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  return new Date(`${y}-${m}-${d}`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function iso8(s) {
  if (!s || String(s).length !== 8) return '';
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function fmtMoney(n) {
  return n ? 'Rp ' + Number(n).toLocaleString('id-ID') : '-';
}

export function statusMeta(s) {
  return (s || '').toUpperCase() === 'DONE'
    ? { label: 'Selesai', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' }
    : { label: 'Dalam Proses', cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' };
}

// Warna label Module (satu sumber untuk semua tabel):
// DISTRIBUSI = hijau, SHOP = biru, PRODUKSI = coklat, sisanya netral.
export function moduleTone(m) {
  switch (String(m || '').toUpperCase()) {
    case 'DISTRIBUSI':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
    case 'SHOP':
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20';
    case 'PRODUKSI':
      return 'bg-[#92400e]/10 text-[#92400e] border-[#92400e]/25 dark:bg-[#fbbf24]/10 dark:text-[#fbbf24] dark:border-[#fbbf24]/30';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
}

// Warna label Status Billing (satu sumber untuk semua tabel).
export function billingTone(s) {
  switch (String(s || '').toUpperCase()) {
    case 'FREE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
    case 'ON-CALL':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
    case 'MONTHLY':
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20';
    default:
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  }
}

// "recordUuid" -> "Record Uuid"
export function prettyKey(k) {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

const KEY_FMT = { dateIssue: 'date', startDate: 'date', finishDate: 'date', charges: 'money' };

export function fmtField(k, v) {
  if (v === null || v === undefined || v === '') return '-';
  if (KEY_FMT[k] === 'date') return fmtDate8(String(v));
  if (KEY_FMT[k] === 'money') return fmtMoney(Number(v));
  return v;
}

export const uniqueBy = (arr, key) =>
  [...new Set(arr.map((c) => c[key]).filter(Boolean))].sort();
