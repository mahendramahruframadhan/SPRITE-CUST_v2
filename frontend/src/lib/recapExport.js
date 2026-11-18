// Ekspor CSV satu tab rekap /report. Tanpa BOM, konsisten dengan
// reportExport.js; setiap sel dinetralkan dari formula spreadsheet.
import { escapeCsvFormula } from './csvFormula.js';

const cell = (v) => `"${escapeCsvFormula(v).replace(/"/g, '""')}"`;

export function buildRecapCsv(tab, data, { periode = '', basis = '' } = {}) {
  const kpis = tab?.kpis || [];
  const cols = tab?.columns || [];
  const kpiValues = data?.kpis || {};
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const lines = [
    [tab?.label || 'Rekap'].map(cell).join(','),
    ['PERIODE', periode].map(cell).join(','),
    ['BASIS', basis || tab?.basis || ''].map(cell).join(','),
    '',
    ['KPI', 'NILAI'].map(cell).join(','),
    ...kpis.map((k) => [k.label, kpiValues[k.key] ?? ''].map(cell).join(',')),
    '',
    cols.map((c) => c.label).map(cell).join(','),
    ...rows.map((r) => cols.map((c) => r[c.key] ?? '').map(cell).join(',')),
  ];
  return lines.join('\n');
}

export function recapCsvFilename(tabId, to = '') {
  const m = String(to || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const stamp = m
    ? `${m[1]}${m[2]}${m[3]}`
    : (() => {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
      })();
  return `recap-${tabId || 'tab'}-${stamp}.csv`;
}
