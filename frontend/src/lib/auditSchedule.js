// Jadwal audit mingguan POPI NAVA: minggu kalender per bulan + adapter
// penyimpanan. Mengikuti kalender asli: W1 mulai Senin pertama, satu minggu
// = Senin penentu bulan (1-2 Okt ikut W4 September), bulan boleh punya 4-5
// minggu (revisi owner 2026-10-02). Penyimpanan: server /api/audit-schedule
// sumber kebenaran bila terjangkau; localStorage = fallback offline + lazy
// seed (server kosong, local ada data → di-PUT sekali). Adapter juga
// membawa status sinkron: source ('server'|'local') + updatedBy/updatedAt
// dari backend; saveSchedule mengembalikan {synced, ...} agar UI bisa
// menandai "belum terkirim" tanpa melempar error.
import { getJSON, setJSON } from './storage.js';
import { get as apiGet, put as apiPut } from './api.js';

const STORAGE_KEY = 'sprite.auditSchedule.v1';
const WEEK_KEYS = ['W1', 'W2', 'W3', 'W4', 'W5'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export const WEEK_LABELS = WEEK_KEYS;

export function emptyWeeks() {
  return { W1: [], W2: [], W3: [], W4: [], W5: [] };
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

// Minggu kalender (year 0-based month, mengikuti Date). Semua minggu yang
// Seninnya jatuh di bulan ini — 4 atau 5 kartu. Tiap minggu memuat hari kerja
// Sen-Jum penuh, jadi rentang bisa lintas bulan (28 Sep - 2 Okt). Sabtu &
// Minggu tidak pernah masuk.
export function monthWeeks(year, month) {
  const first = utc(year, month, 1);
  // offset ke Senin pertama (dow: 0=Min .. 6=Sab).
  const firstMonday = 1 + ((8 - first.getUTCDay()) % 7);
  const monday = utc(year, month, firstMonday);
  const weeks = [];
  let i = 0;
  while (monday.getUTCMonth() === month) {
    const dates = [];
    for (let d = 0; d < 5; d++) {
      const day = new Date(monday);
      day.setUTCDate(day.getUTCDate() + d);
      dates.push(day);
    }
    weeks.push({ key: WEEK_KEYS[i], dates });
    i += 1;
    monday.setUTCDate(monday.getUTCDate() + 7);
  }
  return weeks;
}

// "2-6 Feb" (satu bulan) atau "28 Sep - 2 Okt" (lintas bulan).
export function formatWeekRange(week) {
  const dates = week?.dates || [];
  if (!dates.length) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const monFirst = MONTH_SHORT[first.getUTCMonth()];
  if (first.getUTCMonth() === last.getUTCMonth()) {
    if (first.getUTCDate() === last.getUTCDate()) return `${first.getUTCDate()} ${monFirst}`;
    return `${first.getUTCDate()}-${last.getUTCDate()} ${monFirst}`;
  }
  return `${first.getUTCDate()} ${monFirst} - ${last.getUTCDate()} ${MONTH_SHORT[last.getUTCMonth()]}`;
}

function normalizeWeeks(raw) {
  const weeks = emptyWeeks();
  if (!raw || typeof raw !== 'object') return weeks;
  for (const k of WEEK_KEYS) {
    if (Array.isArray(raw[k])) weeks[k] = raw[k];
  }
  return weeks;
}

// --- Adapter penyimpanan (async): server dulu, localStorage fallback ---

function readLocal(monthKey) {
  const all = getJSON(STORAGE_KEY, {}) || {};
  const entry = all[monthKey];
  if (!entry || typeof entry !== 'object') return emptyWeeks();
  return normalizeWeeks(entry.weeks);
}

function writeLocal(monthKey, weeks) {
  const all = getJSON(STORAGE_KEY, {}) || {};
  all[monthKey] = { month: monthKey, weeks: normalizeWeeks(weeks) };
  setJSON(STORAGE_KEY, all);
}

function hasItems(weeks) {
  return WEEK_KEYS.some((k) => Array.isArray(weeks?.[k]) && weeks[k].length > 0);
}

// Meta sinkron dari respons backend (GET/PUT): siapa & kapan terakhir ubah.
function serverMeta(raw) {
  return {
    updatedBy: raw?.updatedBy ?? null,
    updatedAt: raw?.updatedAt ?? null,
  };
}

export async function getSchedule(monthKey) {
  try {
    const data = await apiGet(`/audit-schedule?month=${encodeURIComponent(monthKey)}`);
    const weeks = normalizeWeeks(data?.weeks);
    const meta = serverMeta(data);
    if (!hasItems(weeks)) {
      const local = readLocal(monthKey);
      if (hasItems(local)) {
        // Lazy seed: data local lama (sebelum backend ada) dipindah ke server.
        // Gagal (offline / tanpa izin tulis) tidak fatal: local tetap dipakai
        // dan status jadi 'local' (belum terkirim).
        let seeded = false;
        try {
          const res = await apiPut('/audit-schedule', { month: monthKey, weeks: local });
          seeded = true;
          Object.assign(meta, serverMeta(res));
        } catch {
          /* abaikan */
        }
        return {
          month: monthKey,
          weeks: local,
          updatedBy: meta.updatedBy,
          updatedAt: meta.updatedAt,
          source: seeded ? 'server' : 'local',
        };
      }
    }
    return { month: monthKey, weeks, updatedBy: meta.updatedBy, updatedAt: meta.updatedAt, source: 'server' };
  } catch {
    // Server tak terjangkau / sesi bermasalah → jadwal tetap jalan dari local.
    return { month: monthKey, weeks: readLocal(monthKey), updatedBy: null, updatedAt: null, source: 'local' };
  }
}

export async function saveSchedule(monthKey, weeks) {
  const norm = normalizeWeeks(weeks);
  // Selalu tulis lokal dulu: cadangan offline + fallback bila PUT gagal.
  writeLocal(monthKey, norm);
  try {
    const res = await apiPut('/audit-schedule', { month: monthKey, weeks: norm });
    return { synced: true, ...serverMeta(res) };
  } catch {
    // Offline / tanpa izin tulis: perubahan tetap hidup di localStorage,
    // UI diberi tahu lewat synced:false (bukan error yang dilempar).
    return { synced: false, updatedBy: null, updatedAt: null };
  }
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
