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

// F4 — Express `trust proxy` HANYA dari parser ini (main.ts memakainya).
// Fail-closed konsisten filosofi di atas: kosong, salah kapitalisasi, berspasi,
// pecahan, negatif, dan sinonim bebas ('yes') semuanya = proxy TIDAK dipercaya.
// Konsekuensi tanpa ini: di belakang reverse proxy/LB semua request berasal
// dari IP proxy → kunci rate-limit (signin/signup/first-admin/AI) seragam →
// pelambatan brute-force mati dan satu penyerang bisa mengunci akun orang.
// Nilai: 'true' → percaya semua; digit murni > 0 → jumlah hop; selain itu false.
export function trustProxy(raw: string | undefined = process.env.TRUST_PROXY): boolean | number | false {
  const v = String(raw ?? '');
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  if (/^[0-9]+$/.test(v)) {
    const n = Number(v);
    return n > 0 ? n : false;
  }
  return false;
}

// F7 — mode development mem-bind 0.0.0.0 (terbuka di LAN) dan SETUP_TOKEN
// dapat dilewati; boot wajib memperingatkan operator. Perilaku TIDAK diubah —
// hanya visibilitas (main.ts mencatatnya ke log saat bootstrap).
export function devModeWarnings(): string[] {
  if (isProduction()) return [];
  const warnings = [
    'MODE DEVELOPMENT: server mem-bind 0.0.0.0 (terbuka di LAN) dan SETUP_TOKEN dapat dilewati — jangan dipakai untuk data produksi.',
  ];
  if (trustProxy() === false) {
    warnings.push(
      'TRUST_PROXY belum diset: di belakang reverse proxy/LB, IP asli pelanggan tidak terbaca sehingga rate-limit jadi seragam untuk semua orang. Set TRUST_PROXY=<jumlah hop>.',
    );
  }
  return warnings;
}
