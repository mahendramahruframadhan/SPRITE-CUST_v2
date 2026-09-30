// Netralisasi formula injection pada CSV (temuan review M7).
// Nilai yang diawali =, +, -, @ (dan TAB/CR yang tak terlihat) bisa
// dieksekusi spreadsheet saat file dibuka → beri prefix apostrophe saat
// ekspor; unescape mengembalikan nilai asli saat impor (round-trip persis).
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvFormula(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return FORMULA_START.test(s) ? `'${s}` : s;
}

// Hapus SATU apostrophe yang tepat di depan karakter formula — apostrophe
// biasa (O'Brien, kutipan) tidak disentuh.
export function unescapeCsvFormula(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return s.startsWith("'") && FORMULA_START.test(s.slice(1)) ? s.slice(1) : s;
}
