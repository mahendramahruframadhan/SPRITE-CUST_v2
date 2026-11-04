// Pengaturan dokumen untuk Laporan Billing On-Call.
// Format nomor dokumen; {n} = nomor urut (isi manual/otomatis nanti), {y} = tahun.
export const REPORT_DOC_FORMAT = '{n} / BA / {y}';

export function reportDocNumber(date = new Date(), seq = '__') {
  return REPORT_DOC_FORMAT.replace('{n}', seq).replace('{y}', date.getFullYear());
}
