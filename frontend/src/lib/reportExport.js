// Builder CSV Report Summary — satu jalur untuk tombol Export di
// halaman /report. Urutan seksi: kop periode, per status invoice,
// per billing status, ringkas akhir. Tanpa BOM (keterbatasan Excel
// non-ASCII yang sama seperti billingExport.js).
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function sectionRow(label, b) {
  return [label, b.count, b.charges, b.ppn, b.subtotal].map(esc).join(',');
}

export function buildReportCsv(summary, { periode = '' } = {}) {
  const s = summary || {};
  const byInvoice = s.byInvoice && typeof s.byInvoice === 'object' ? s.byInvoice : {};
  const byBilling = s.byBilling && typeof s.byBilling === 'object' ? s.byBilling : {};
  const cols = ['KATEGORI', 'JUMLAH KASUS', 'CHARGES', 'PPN', 'SUBTOTAL'].join(',');
  const lines = [
    ['REPORT SUMMARY — KASUS TERVALIDASI'].map(esc).join(','),
    ['PERIODE', periode].map(esc).join(','),
    '',
    ['RINCIAN PER STATUS INVOICE'].map(esc).join(','),
    cols,
    ...Object.keys(byInvoice).map((k) => sectionRow(k, byInvoice[k] || {})),
    sectionRow('TOTAL', s),
    '',
    ['RINCIAN PER BILLING STATUS'].map(esc).join(','),
    cols,
    ...Object.keys(byBilling).map((k) => sectionRow(k, byBilling[k] || {})),
    '',
    ['TOTAL CHARGES', s.charges ?? 0].map(esc).join(','),
    ['TOTAL PPN', s.ppn ?? 0].map(esc).join(','),
    ['SUBTOTAL AKHIR', s.subtotal ?? 0].map(esc).join(','),
    [`KASUS BER-FLAG PPh (tanpa potongan): ${s.pphCount ?? 0}`].map(esc).join(','),
  ];
  return lines.join('\n');
}

export function reportCsvFilename(periode = '') {
  const m = String(periode).match(/(\d{4})-(\d{2})-(\d{2})\s*s\.d\.\s*(\d{4})-(\d{2})-(\d{2})/);
  const stamp = m
    ? `${m[4]}${m[5]}${m[6]}`
    : (() => {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
      })();
  return `report-summary-${stamp}.csv`;
}
