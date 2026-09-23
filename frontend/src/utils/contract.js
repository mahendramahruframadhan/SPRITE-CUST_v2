// Helper murni kontrak brand — tanpa React agar bisa diuji node:test bawaan.
// Dipakai useClientBrands, ClientBrandPage, dan DashboardPage.
export function normalizeBrand(v) {
  return String(v ?? '').trim();
}

export function daysLeft(expiredAt) {
  if (!expiredAt) return null;
  const end = new Date(`${expiredAt}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - now) / 86400000);
}

export function expiryState(expiredAt) {
  const d = daysLeft(expiredAt);
  if (d === null) return 'unknown';
  if (d < 0) return 'expired';
  if (d <= 30) return 'soon';
  return 'active';
}

// Duplikat per tipe, case-insensitive (cermin validasi backend lower()).
export function isDupe(list, brand, type, exceptId) {
  const n = normalizeBrand(brand).toLowerCase();
  if (!n) return false;
  return list.some(
    (s) => s.id !== exceptId && s.type === type && normalizeBrand(s.brand).toLowerCase() === n
  );
}

export function sortFreeByExpiry(rows) {
  return rows
    .slice()
    .sort((a, b) => String(a.expiredAt || '9999').localeCompare(String(b.expiredAt || '9999')));
}

// Format tanggal cantik Indonesia: "Sen, 6 Okt 2026". Satu sumber untuk
// halaman Client & Brand dan widget Dashboard agar selalu konsisten.
export function fmtDateID(s) {
  if (!s) return '-';
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
