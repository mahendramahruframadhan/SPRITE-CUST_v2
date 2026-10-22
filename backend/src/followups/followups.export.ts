// Builder CSV follow-up untuk endpoint GET /api/followups/export.
// Kolom mengikuti ekspor laporan PRD §8; ekspor juga netralisasi formula
// injection (pola lib/csvFormula.js frontend) agar aman dibuka di spreadsheet.
const HEADERS = [
  'CLIENT', 'TGL ISSUE', 'MODUL', 'ISSUE', 'PRIORITAS', 'STATUS',
  'FOLLOW-UP', 'OVERDUE', 'PIC',
];

const FORMULA_START = /^[=+\-@\t\r]/;
const esc = (v: any): string =>
  `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;

export function buildFollowupsCsv(rows: any[], today: string): string {
  return [
    HEADERS.join(','),
    ...rows.map((r) =>
      [
        r.client,
        r.issueDate,
        r.module,
        r.title,
        r.priority,
        r.status,
        r.followupDate,
        r.status !== 'Selesai' && r.followupDate < today ? 'Ya' : 'Tidak',
        r.pic,
      ]
        .map(esc)
        .join(','),
    ),
  ].join('\n');
}
