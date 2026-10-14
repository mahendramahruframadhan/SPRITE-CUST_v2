// Builder CSV Report Summary — satu jalur untuk tombol Export di
// halaman /report. Urutan seksi: kop periode, per status invoice,
// per billing status, ringkas akhir. Tanpa BOM (keterbatasan Excel
// non-ASCII yang sama seperti billingExport.js).
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function sectionRow(label, b) {
  return [label, b.count, b.charges, b.ppn, b.subtotal].map(esc).join(',');
}

export function buildReportCsv(summary, { periode = '', aging = null, top = [], brandBreak = [], moduleBreak = [] } = {}) {
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
  if (aging && Array.isArray(aging.buckets)) {
    lines.push(
      '',
      ['AGING TUNGGAKAN (umur = hari ini - tanggal issue)'].map(esc).join(','),
      ['BUCKET', 'STATUS', 'JUMLAH KASUS', 'SUBTOTAL'].join(','),
      ...aging.buckets.map((b) => [b.label, b.status, b.count, b.subtotal].map(esc).join(',')),
      ['TOTAL TUNGGAKAN', '', aging.total?.count ?? 0, aging.total?.subtotal ?? 0].map(esc).join(','),
    );
  }
  if (Array.isArray(top) && top.length) {
    lines.push(
      '',
      ['TOP 10 TUNGGAKAN TERBESAR'].map(esc).join(','),
      ['RANK', 'NO', 'BRAND', 'TANGGAL', 'SUBTOTAL', 'STATUS INVOICE'].join(','),
      ...top.slice(0, 10).map((c, i) => [i + 1, c.no ?? '', c.client ?? '', c.dateIssue ?? '', c.subtotal ?? 0, c.invStatus ?? ''].map(esc).join(',')),
    );
  }
  for (const [title, rows] of [['NILAI PER BRAND', brandBreak], ['NILAI PER MODULE', moduleBreak]]) {
    if (Array.isArray(rows) && rows.length) {
      lines.push(
        '',
        [title].map(esc).join(','),
        cols,
        ...rows.map((g) => sectionRow(g.name, g)),
      );
    }
  }
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
