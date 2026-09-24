// Helper localStorage terpusat — SATU-SATUNYA akses langsung ke localStorage
// untuk state aplikasi (auth, cache status, preferensi).
// - get(key, fallback): baca aman (JSON invalid / storage mati → fallback).
// - set(key, value): tulis aman (objek di-JSON-kan otomatis; gagal diam).
// - remove(...keys): hapus beberapa kunci sekaligus.
// - getJSON/setJSON: alias eksplisit untuk nilai objek/array.
// Catatan: kunci lama yang sudah tersebar (userEmail, caseAuditStatus, ...)
// dipertahankan apa adanya agar sesi/cache user tidak hilang saat update.
export function get(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // abaikan — storage penuh / mode privat, aplikasi tetap jalan
  }
}

export function remove(...keys) {
  try {
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // abaikan
  }
}

export function getJSON(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    if (v === null || v === undefined) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export const setJSON = set;
