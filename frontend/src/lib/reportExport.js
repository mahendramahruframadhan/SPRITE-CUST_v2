// Builder CSV Report Summary — satu jalur untuk tombol Export di
// halaman /report. Saat workload ada: kop operasional & finansial +
// seksi operasional (ringkasan, billing, user, brand/module) lalu
// rincian finansial tervalidasi. Tanpa workload: output finansial
// tervalidasi legacy (backward compatible). Tanpa BOM.
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const num = (v) => Number(v) || 0;

function sectionRow(label, b) {
  return [label, b.count, b.charges, b.ppn, b.subtotal].map(esc).join(',');
}

function operationalSections(workload) {
  const totals = workload?.totals || {};
  const byBilling = totals.byBilling || {};
  const total = num(totals.count);
  const lines = [
    '',
    ['RINGKASAN OPERASIONAL'].map(esc).join(','),
    ['METRIK', 'JUMLAH'].map(esc).join(','),
    ['TOTAL', total].map(esc).join(','),
    ['DONE', num(totals.done)].map(esc).join(','),
    ['OPEN', num(totals.open)].map(esc).join(','),
    ['TERVALIDASI', num(totals.validated)].map(esc).join(','),
  ];

  const rows = ['ON-CALL'].filter((k) => num(byBilling[k]?.count) > 0);
  if (rows.length) {
    lines.push(
      '',
      ['RINCIAN PER BILLING STATUS (OPERASIONAL)'].map(esc).join(','),
      ['BILLING STATUS', 'JUMLAH KASUS', '%', 'DONE', 'OPEN', 'TERVALIDASI', 'CHARGES', 'PPN', 'SUBTOTAL'].map(esc).join(','),
      ...rows.map((key) => {
        const b = byBilling[key] || {};
        const count = num(b.count);
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return [key, count, pct, num(b.done), num(b.open), num(b.validated), num(b.charges), num(b.ppn), num(b.subtotal)].map(esc).join(',');
      }),
    );
  }

  const users = Array.isArray(workload?.byAssignee) ? workload.byAssignee : [];
  if (users.length) {
    lines.push(
      '',
      ['RINCIAN PER USER'].map(esc).join(','),
      ['USER', 'ON-CALL', 'TOTAL', 'DONE', 'OPEN', 'NILAI ON-CALL', 'TERVALIDASI'].map(esc).join(','),
      ...users.map((u) => [u.assignTo, num(u.byBilling?.['ON-CALL']), num(u.count), num(u.done), num(u.open), num(u.onCallSubtotal), num(u.validated)].map(esc).join(',')),
    );
  }

  for (const [title, key, nameKey] of [
    ['RINCIAN PER BRAND', 'byBrand', 'brand'],
    ['RINCIAN PER MODULE', 'byModule', 'module'],
  ]) {
    const list = Array.isArray(workload?.[key]) ? workload[key] : [];
    if (!list.length) continue;
    lines.push(
      '',
      [title].map(esc).join(','),
      [nameKey.toUpperCase(), 'ON-CALL', 'TOTAL', 'NILAI ON-CALL'].map(esc).join(','),
      ...list.map((g) => [g[nameKey], num(g.byBilling?.['ON-CALL']), num(g.count), num(g.onCallSubtotal)].map(esc).join(',')),
    );
  }

  return lines;
}

export function buildReportCsv(summary, { periode = '', aging = null, top = [], brandBreak = [], moduleBreak = [], workload = null } = {}) {
  const s = summary || {};
  const byInvoice = s.byInvoice && typeof s.byInvoice === 'object' ? s.byInvoice : {};
  const byBilling = s.byBilling && typeof s.byBilling === 'object' ? s.byBilling : {};
  const cols = ['KATEGORI', 'JUMLAH KASUS', 'CHARGES', 'PPN', 'SUBTOTAL'].join(',');
  const title = workload ? 'REPORT SUMMARY — REKAP OPERASIONAL & FINANSIAL' : 'REPORT SUMMARY — KASUS TERVALIDASI';
  const lines = [
    [title].map(esc).join(','),
    ['PERIODE', periode].map(esc).join(','),
    ...(workload ? operationalSections(workload) : []),
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
