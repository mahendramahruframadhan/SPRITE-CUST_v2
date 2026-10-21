// Builder CSV Client Follow-Up — pola sama dengan billingExport.js.
// Alasan (R-31): ekspor laporan adalah kebutuhan PRD §8, satu jalur untuk
// baris terfilter agar isi file persis tampilan layar.
import { escapeCsvFormula } from './csvFormula.js';

const HEADERS = [
  'CLIENT', 'TGL ISSUE', 'MODUL', 'ISSUE', 'PRIORITAS', 'STATUS',
  'FOLLOW-UP', 'OVERDUE', 'PIC',
];

export function buildFollowupsCsv(rows, isOverdue) {
  const esc = (v) => `"${escapeCsvFormula(v ?? '').replace(/"/g, '""')}"`;
  return [
    HEADERS.join(','),
    ...rows.map((r) =>
      [
        r.client, r.issueDate, r.module, r.title, r.priority,
        r.status, r.followupDate, isOverdue(r) ? 'Ya' : 'Tidak', r.pic || '',
      ]
        .map(esc)
        .join(',')
    ),
  ].join('\n');
}

export function followupsCsvFilename() {
  return 'laporan-followup.csv';
}
