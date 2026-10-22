// Waktu relatif utk notifikasi: "baru saja" (<1m), "X menit lalu" (<1h),
// "X jam lalu" (<1d), "X hari lalu" (<7d), else tanggal singkat id-ID.
// now diparameter agar test deterministik.
export function relTimeID(isoDate, now = new Date()) {
  const t = new Date(isoDate || '');
  if (isNaN(t)) return '';
  const diffMs = Math.max(0, now - t);
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} hari lalu`;
  return t.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
