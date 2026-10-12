// Builder CSV Billing & Audit — satu jalur untuk tab kategori dan
// "Semua kategori". Urutan kolom mengikuti ekspor lama di BillingPage.
const HEADERS = [
  'NO', 'DATE ISSUE', 'CLIENT', 'ISSUE', 'PIC NAME', 'MODULE',
  'BILLING STATUS', 'BILLING CATEGORY', 'SUPPORT TYPE', 'CHARGES',
  'STATUS VALIDASI', 'COMPLETION NOTES', 'RECORD_UUID',
];

export function buildBillingCsv(rows, caseAuditStatus = {}) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    HEADERS.join(','),
    ...rows.map((c) =>
      [
        c.no, c.dateIssue, c.client, c.issue, c.picName, c.module,
        c.billingStatus, c.billingCategory, c.supportType, c.charges,
        caseAuditStatus[c.recordUuid] || '', c.completionNotes, c.recordUuid,
      ]
        .map(esc)
        .join(',')
    ),
  ].join('\n');
}

export function billingCsvFilename(scope, cat) {
  return scope === 'all'
    ? 'billing-audit-semua-kategori.csv'
    : `billing-audit-${String(cat).toLowerCase()}.csv`;
}
