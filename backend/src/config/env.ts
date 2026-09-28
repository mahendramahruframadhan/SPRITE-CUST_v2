// Sumber KEBENARAN TUNGGAL untuk ambient environment backend.
//
// Kritis #1: sebelumnya tiap file menulis sendiri
//   `String(process.env.NODE_ENV || '').toLowerCase() !== 'production'`
// Env KOSONG menghasilkan '' yang !== 'production' → bernilai true → seluruh
// guard produksi (SETUP_TOKEN wajib, DATABASE_URL wajib postgres, seed demo
// dinonaktifkan) MATI tanpa error. Salah ketik 'prod' juga lolos.
//
// Aturan baru: hanya env yang EKSPLISIT disebut boleh membuka perilaku
// development-sensitive. Env kosong, salah ketik, atau beda huruf/spasi
// diperlakukan sebagai tidak aman (fail-closed), bukan sebagai development.

const KNOWN_ENVS = ['production', 'development', 'test'] as const;

// '' = kosong atau tak dikenal. Tidak ada case-folding dan tidak ada trim:
// 'Production' / 'production ' adalah env yang salah tulis, dan konsekuensi
// salah tulis di sini adalah matinya proteksi — jadi harus gagal, bukan
// ditebak.
export function nodeEnv(): string {
  const v = String(process.env.NODE_ENV ?? '');
  return (KNOWN_ENVS as readonly string[]).includes(v) ? v : '';
}

export function isKnownEnv(): boolean {
  return nodeEnv() !== '';
}

export function isProduction(): boolean {
  return nodeEnv() === 'production';
}

// Satu-satunya env yang boleh: seed 6 user demo berpassword lemah, bypass
// setup token, dan backfill role hard-coded. 'test' TIDAK cukup — test runner
// tidak menjalankan initDb, dan seed demo di database uji tidak pernah
// dibutuhkan.
export function isDevSeedAllowed(): boolean {
  return nodeEnv() === 'development';
}
