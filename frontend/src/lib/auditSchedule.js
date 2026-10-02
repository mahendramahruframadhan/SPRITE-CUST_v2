// Jadwal audit mingguan POPI NAVA: pembagian W1-W4 per bulan + adapter
// penyimpanan. Bulan selalu dipecah jadi 4 blok hari kerja (Sen-Jum);
// 3 blok pertama sama besar, sisa hari masuk W4 (keputusan owner, REVIEW
// desain 2026-10-02). Penyimpanan sekarang localStorage dengan API async
// berbentuk {month, weeks} — saat backend siap, ganti isi get/save dengan
// fetch tanpa mengubah pemanggil (kontrak frontend-backend sudah dipisah).
import { getJSON, setJSON } from './storage.js';

const STORAGE_KEY = 'sprite.auditSchedule.v1';
const WEEK_KEYS = ['W1', 'W2', 'W3', 'W4'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export const WEEK_LABELS = WEEK_KEYS;

export function emptyWeeks() {
  return { W1: [], W2: [], W3: [], W4: [] };
}

// Date dibangun dalam UTC agar perhitungan hari kerja bebas timezone.
function utc(year, month, day) {
  return new Date(Date.UTC(year, month, day));
}

export function monthKeyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + delta, 1));
}

export function formatMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_LONG[m - 1] || ''} ${y}`;
}

// 4 blok hari kerja bulan (year 0-based month, mengikuti Date).
// Hari Sabtu/Minggu tidak pernah masuk; sisa pembagian -> W4.
export function monthWeeks(year, month) {
  const days = [];
  const d = utc(year, month, 1);
  while (d.getUTCMonth() === month) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) days.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const base = Math.floor(days.length / 4);
  const weeks = [];
  let i = 0;
  for (let w = 0; w < 4; w++) {
    const size = w < 3 ? base : days.length - i;
    weeks.push({ key: WEEK_KEYS[w], dates: days.slice(i, i + size) });
    i += size;
  }
  return weeks;
}

// "2-6 Feb": hari kerja pertama-terakhir blok, nama bulan pendek.
export function formatWeekRange(week) {
  const dates = week?.dates || [];
  if (!dates.length) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const mon = MONTH_SHORT[first.getUTCMonth()];
  if (first.getUTCDate() === last.getUTCDate()) return `${first.getUTCDate()} ${mon}`;
  return `${first.getUTCDate()}-${last.getUTCDate()} ${mon}`;
}

function normalizeWeeks(raw) {
  const weeks = emptyWeeks();
  if (!raw || typeof raw !== 'object') return weeks;
  for (const k of WEEK_KEYS) {
    if (Array.isArray(raw[k])) weeks[k] = raw[k];
  }
  return weeks;
}

// --- Adapter penyimpanan (async; siap dialihkan ke endpoint backend) ---

export async function getSchedule(monthKey) {
  const all = getJSON(STORAGE_KEY, {}) || {};
  const entry = all[monthKey];
  if (!entry || typeof entry !== 'object') return { month: monthKey, weeks: emptyWeeks() };
  return { month: monthKey, weeks: normalizeWeeks(entry.weeks) };
}

export async function saveSchedule(monthKey, weeks) {
  const all = getJSON(STORAGE_KEY, {}) || {};
  all[monthKey] = { month: monthKey, weeks: normalizeWeeks(weeks) };
  setJSON(STORAGE_KEY, all);
}

// --- Mutasi murni (immutable) — dipakai UI & diuji terpisah ---

function clone(weeks) {
  return normalizeWeeks(weeks);
}

export function addItem(weeks, weekKey, item) {
  const next = clone(weeks);
  if (!next[weekKey] || !item) return next;
  next[weekKey] = [...next[weekKey], item];
  return next;
}

export function removeItem(weeks, weekKey, id) {
  const next = clone(weeks);
  if (!next[weekKey]) return next;
  next[weekKey] = next[weekKey].filter((x) => x.id !== id);
  return next;
}

export function moveItem(weeks, fromKey, toKey, id) {
  const item = (weeks?.[fromKey] || []).find((x) => x.id === id);
  if (!item || fromKey === toKey) return clone(weeks);
  let next = removeItem(weeks, fromKey, id);
  next = addItem(next, toKey, item);
  return next;
}
