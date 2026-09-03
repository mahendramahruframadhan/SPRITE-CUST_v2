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
    ? { label: 'Selesai', cls: 'bg-emerald-50 text-emerald-600 border border-emerald-200' }
    : { label: 'Dalam Proses', cls: 'bg-amber-50 text-amber-600 border border-amber-200' };
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
