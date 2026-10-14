// Validasi rentang tanggal halaman Analitik — murni tanpa React agar bisa
// diuji unit terpisah. Pesan kembali dipakai sebagai banner validasi
// (tanpa prefix "Backend tidak terjangkau" yang menyesatkan).
export function analyticsRangeError(from, to) {
  if (from && to && from > to) return 'Rentang tanggal tidak valid (Date From melebihi Date Until)';
  return null;
}
