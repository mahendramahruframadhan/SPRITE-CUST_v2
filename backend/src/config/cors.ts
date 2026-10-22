// Konfigurasi CORS terpusat agar bisa diuji (lihat test/cors.strict.test.ts).
//
// H6: dulu credentials:true + regex yang membuka SELURUH subnet privat
// (192.168.x.x, 10.x.x.x, 172.16-31.x.x, port berapa pun). Perangkat apa pun
// di LAN bisa membaca respons API ber-credential.
//
// M3 (cookie httpOnly): auth kini memakai cookie sesi, jadi browser HARUS
// mengirim kredensial cross-origin — credentials:true WAJIB. Aman karena
// origin tetap daftar string eksplisit (tanpa regex subnet); cookie
// sameSite=lax + pengecekan Origin/Referer untuk request mutasi (lihat
// auth/csrf.ts) menutup celah CSRF yang dibuka oleh kredensial ini.
//
// I1 (audit): literal LAN (http://192.168.1.5:5173) dihapus dari allowlist
// — kebutuhan akses via jaringan cukup disetel lewat FRONTEND_URL, bukan
// alamat mesin dev yang tertanam di kode.
export function buildCorsOptions(): { origin: string[]; credentials: boolean } {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const origins = [frontendUrl, 'http://localhost:5173', 'http://localhost:3000'];
  return { origin: [...new Set(origins)], credentials: true };
}
