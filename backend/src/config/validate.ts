import { Logger } from '@nestjs/common';

// Validasi config saat boot — fail-fast untuk yang fatal, peringatan terstruktur
// (Nest Logger, sekali saja) untuk konfigurasi pincang yang baru terasa saat
// fitur dipakai (sync gagal / PDF nonaktif). Bedakan "salah config" vs "bug"
// dalam 10 detik pertama, bukan setelah laporan user.
// Diimpor & dipanggil dari main.ts SEBELUM app.listen agar kegagalan fatal
// menutup proses dengan jelas.
const log = new Logger('Config');

export function validateConfig(): void {
  const e = process.env;

  // --- Fatal: PORT tidak valid (backend tidak bisa listen di mana pun) ---
  const port = Number(e.PORT || 5005);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT "${e.PORT}" tidak valid — harus 1..65535. Perbaiki backend/.env lalu restart.`);
  }

  // --- Peringatan: mode live tapi kredensial kurang ---
  const mock = String(e.SHEETS_MOCK ?? 'true') !== 'false';
  if (!mock && !e.GOOGLE_SERVICE_ACCOUNT_JSON) {
    log.warn('SHEETS_MOCK=false tanpa GOOGLE_SERVICE_ACCOUNT_JSON — sync Sheets akan gagal (isi base64 key + share sheet ke service account).');
  }

  // --- Peringatan: konfigurasi R2/S3 setengah jadi (PDF nonaktif diam-diam) ---
  const r2 = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  const filled = r2.filter((k) => e[k]);
  if (filled.length > 0 && filled.length < r2.length) {
    log.warn(`Konfigurasi PDF storage tidak lengkap (${filled.join(', ')} saja) — endpoint PDF membalas R2_NOT_CONFIGURED. Isi semua: ${r2.join(', ')}.`);
  }

  // --- Peringatan: DATABASE_URL bukan postgres & bukan kosong (fallback pg-mem tak disengaja) ---
  const url = e.DATABASE_URL || '';
  if (url && !url.startsWith('postgres')) {
    log.warn('DATABASE_URL tidak diawali "postgres" — backend memakai pg-mem (data hilang saat restart). Kosongkan untuk sengaja, atau isi postgresql:// untuk persisten.');
  }
}
