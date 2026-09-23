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

// Tampilan panjang untuk input kalender: "6 Oktober 2026".
export function fmtDateLong(s) {
  if (!s) return '';
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

const MONTH_ID = {
  januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
  juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', agu: '08', agust: '08',
  sep: '09', sept: '09', okt: '10', nov: '11', des: '12',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISO(y, m, d) {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// Parse input ketikan menjadi yyyy-MM-dd. Menerima ISO, dd/mm/yyyy (dan
// varian - .), serta "6 Okt 2026" / "6 Oktober 2026". Kembalikan null bila
// tidak valid — anti format ambigu (ux: locale-aware dates).
export function parseDateInput(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toISO(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return toISO(+m[3], +m[2], +m[1]);
  m = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_ID[m[2]];
    if (mo) return toISO(+m[3], +mo, +m[1]);
  }
  return null;
}
