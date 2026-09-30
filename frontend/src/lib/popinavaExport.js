// Ekspor master outlet POPI NAVA (§11): CSV ber-BOM UTF-8 dan .xlsx satu
// sheet, kolom = 18 kolom data sumber (tanpa system field aplikasi).
// Client-side dulu memakai SheetJS; saat backend siap, tombol Ekspor pindah
// ke GET /popinava/export (alasan: stream + audit server).
// SheetJS di-import dinamis: ekspor CSV tidak perlu memuat pustaka itu.
import { SOURCE_FIELDS } from './popinavaValidate.js';
import { recordToSource } from './popinavaRecord.js';
import { escapeCsvFormula } from './csvFormula.js';

export const EXPORT_HEADERS = SOURCE_FIELDS; // urutan = urutan sheet sumber

function csvCell(v) {
  const s = escapeCsvFormula(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// BOM di depan supaya Excel membuka UTF-8 dengan benar.
export function toCsvString(matrix) {
  const body = matrix.map((row) => row.map(csvCell).join(',')).join('\r\n');
  return `\uFEFF${body}\r\n`;
}

export function recordsToMatrix(records) {
  const header = [...EXPORT_HEADERS];
  const rows = records.map((rec) => {
    const src = recordToSource(rec);
    return EXPORT_HEADERS.map((f) => src[f] ?? '');
  });
  return [header, ...rows];
}

// Template unduhan langkah 1 wizard: header + 1 baris contoh (§9 /template).
export function buildTemplateMatrix() {
  const contoh = {
    uuid: '11111111-2222-4333-8444-555555555555',
    brand_name: 'NAMA BRAND',
    rvt_custcode: 'RVT-XYZ',
    dept_code: '03010501',
    dept_name: 'SHOP',
    dept_channel_name: 'Nama Outlet Contoh',
    dept_reference: '',
    iso_code: 'ID-JB',
    address: 'JL. CONTOH NO. 1',
    city: 'BANDUNG',
    province: 'JAWA BARAT',
    postcode: '40111',
    country: 'INDONESIA',
    area: 'P.JAWA',
    region: 'WIB',
    email: '',
    notes: '',
    created_at: '2026-01-01 00:00:00',
  };
  return [EXPORT_HEADERS, EXPORT_HEADERS.map((f) => contoh[f] ?? '')];
}

export async function toXlsxArrayBuffer(matrix) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'POPI NAVA');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Nama file ekspor: popinava-outlet-YYYY-MM-DD.<ext>
export function exportFileName(ext, today = new Date()) {
  const d = today.toISOString().slice(0, 10);
  return `popinava-outlet-${d}.${ext}`;
}

// Satu pintu ekspor dipakai tombol halaman.
export async function exportRecords(records, format) {
  const matrix = recordsToMatrix(records);
  if (format === 'xlsx') {
    const buf = await toXlsxArrayBuffer(matrix);
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportFileName('xlsx'));
  } else {
    downloadBlob(new Blob([toCsvString(matrix)], { type: 'text/csv;charset=utf-8' }), exportFileName('csv'));
  }
  return matrix.length - 1;
}

export function downloadTemplate() {
  downloadBlob(new Blob([toCsvString(buildTemplateMatrix())], { type: 'text/csv;charset=utf-8' }), 'template-popinava.csv');
}
