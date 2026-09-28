// Konfigurasi CORS terpusat agar bisa diuji (lihat test/cors.strict.test.ts).
//
// H6: dulu credentials:true + regex yang membuka SELURUH subnet privat
// (192.168.x.x, 10.x.x.x, 172.16-31.x.x, port berapa pun). Perangkat apa pun
// di LAN bisa membaca respons API ber-credential.
//
// Dua perubahan:
// 1. credentials:false — auth di sini memakai header x-auth-token dari
//    localStorage (bukan cookie), jadi cookie cross-origin tidak dibutuhkan.
//    Cookie better-auth.session_token memang di-set saat login tapi tidak
//    pernah dibaca server untuk otorisasi.
// 2. Origin = daftar string eksplisit. Host LAN user (192.168.1.5:5173)
//    tetap dicantumkan eksplisit — yang dibuang hanya regex "subnet mana
//    pun boleh".
export function buildCorsOptions(): { origin: string[]; credentials: boolean } {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const origins = [frontendUrl, 'http://localhost:5173', 'http://localhost:3000', 'http://192.168.1.5:5173'];
  return { origin: [...new Set(origins)], credentials: false };
}
