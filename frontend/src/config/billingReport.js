// Profil perusahaan & pengaturan dokumen untuk Laporan Billing On-Call.
// Ubah nilai di sini (bukan di komponen) agar kop surat & nomor dokumen mudah disesuaikan.
export const REPORT_COMPANY = {
  name: '[NAMA PERUSAHAAN]',
  contact: '[Alamat perusahaan] · [Telp / Email]',
};

// Format nomor dokumen; {n} = nomor urut (isi manual/otomatis nanti), {y} = tahun.
export const REPORT_DOC_FORMAT = '{n} / BA / {y}';

export function reportDocNumber(date = new Date(), seq = '__') {
  return REPORT_DOC_FORMAT.replace('{n}', seq).replace('{y}', date.getFullYear());
}
