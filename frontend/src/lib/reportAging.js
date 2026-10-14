// Agregasi section baru halaman /report: aging tunggakan, top outstanding,
// breakdown grup (brand/module). Murni tanpa React agar bisa diuji unit
// terpisah. Input = baris yang SUDAH membawa { dateIssue, charges, ppn,
// subtotal } (dihitung pemanggil via aturan taxSummary.js); pool
// (tervalidasi/outstanding) juga dipilih pemanggil.

// 'YYYYMMDD' -> Date tengah malam lokal, null bila tak valid.
export function parseDate8(v) {
  const m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

// Umur dalam hari kalender (hari ini - tanggal), null bila tak valid.
export function ageDays(dateIssue, today = new Date()) {
  const d = parseDate8(dateIssue);
  if (!d) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t - d) / 86400000);
}

const BUCKETS = [
  { key: '0-30', label: '0–30 hari', min: 0, max: 30, status: 'Baik' },
  { key: '31-60', label: '31–60 hari', min: 31, max: 60, status: 'Normal' },
  { key: '61-90', label: '61–90 hari', min: 61, max: 90, status: 'Perhatian' },
  { key: '91-180', label: '91–180 hari', min: 91, max: 180, status: 'Risiko' },
  { key: '>180', label: '>180 hari', min: 181, max: Infinity, status: 'Risiko' },
];

export function bucketOf(age) {
  return BUCKETS.find((b) => age >= b.min && age <= b.max) || null;
}

// items: [{ dateIssue, subtotal }] (umur negatif = masa depan -> bucket 0-30).
export function buildAgingBuckets(items, today = new Date()) {
  const buckets = BUCKETS.map((b) => ({ ...b, count: 0, subtotal: 0, percentage: 0 }));
  const at = (age) => buckets.find((b) => age >= b.min && age <= b.max);
  let invalid = 0;
  for (const it of items || []) {
    const age = ageDays(it?.dateIssue, today);
    if (age === null) {
      invalid += 1;
      continue;
    }
    const b = at(Math.max(0, age));
    if (!b) {
      invalid += 1;
      continue;
    }
    b.count += 1;
    b.subtotal += Number(it?.subtotal) || 0;
  }
  const total = { count: buckets.reduce((a, b) => a + b.count, 0), subtotal: buckets.reduce((a, b) => a + b.subtotal, 0) };
  for (const b of buckets) b.percentage = total.subtotal > 0 ? Math.round((b.subtotal / total.subtotal) * 100) : 0;
  return { buckets, total, invalid };
}

// N subtotal terbesar desc; tidak mengubah array input.
export function getTopOutstanding(items, n = 10) {
  return [...(items || [])].sort((a, b) => (Number(b?.subtotal) || 0) - (Number(a?.subtotal) || 0)).slice(0, n);
}

// Kelompok per kunci (brand/module): count + charges + ppn + subtotal +
// persen thd total, urut subtotal desc.
export function buildGroupBreakdown(items, getKey) {
  const m = new Map();
  for (const it of items || []) {
    const name = getKey(it) || '-';
    if (!m.has(name)) m.set(name, { name, count: 0, charges: 0, ppn: 0, subtotal: 0, percentage: 0 });
    const g = m.get(name);
    g.count += 1;
    g.charges += Number(it?.charges) || 0;
    g.ppn += Number(it?.ppn) || 0;
    g.subtotal += Number(it?.subtotal) || 0;
  }
  const out = [...m.values()].sort((a, b) => b.subtotal - a.subtotal);
  const total = out.reduce((a, g) => a + g.subtotal, 0);
  for (const g of out) g.percentage = total > 0 ? Math.round((g.subtotal / total) * 100) : 0;
  return out;
}
