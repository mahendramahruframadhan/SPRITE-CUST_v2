// Pengaturan dokumen untuk Laporan Billing On-Call.
// Format nomor dokumen; {ymd} = tanggal periode (YYYYMMDD, hari pertama data),
// {y} = tahun. Contoh: Februari 2026 -> 20260201 / BA / 2026.
export const REPORT_DOC_FORMAT = '{ymd} / BA / {y}';

// periodStart: string 'YYYYMMDD' (atau Date) — biasanya tanggal terawal data laporan.
export function reportDocNumber(periodStart = new Date()) {
  const ymd =
    typeof periodStart === 'string' && periodStart.length === 8
      ? periodStart
      : `${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}${String(periodStart.getDate()).padStart(2, '0')}`;
  return REPORT_DOC_FORMAT.replace('{ymd}', ymd).replace('{y}', ymd.slice(0, 4));
}
