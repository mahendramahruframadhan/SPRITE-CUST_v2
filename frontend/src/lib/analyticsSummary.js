// Tren bulanan halaman Analitik (/analytics): agregasi murni tanpa React.
// Murni agar bisa diuji unit terpisah (lihat test/analyticsSummary.test.mjs).
import { sumPpn, computeSubtotal, isTaxableRow } from './taxSummary.js';

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function monthKeyToLabel(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(key || '');
  return `${ID_MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// dateIssue YYYYMMDD -> key YYYY-MM (null bila tidak valid).
function monthKeyOf(row) {
  const d = String(row?.dateIssue || '');
  const m = d.match(/^(\d{4})(\d{2})\d{2}$/);
  if (!m || m[2] < '01' || m[2] > '12') return null;
  return `${m[1]}-${m[2]}`;
}

// [{key, label, count, charges, ppn, subtotal}] terurut bulan menaik.
export function buildMonthlyTrend(rows, taxMap) {
  const groups = {};
  for (const r of (rows || []).filter((r) => isTaxableRow(r?.billingStatus))) {
    const key = monthKeyOf(r);
    if (!key) continue;
    (groups[key] = groups[key] || []).push(r);
  }
  return Object.keys(groups)
    .sort()
    .map((key) => {
      const g = groups[key];
      const charges = g.reduce((a, r) => a + (+r.charges || 0), 0);
      const ppn = sumPpn(g.filter((r) => isTaxableRow(r?.billingStatus)), taxMap);
      return {
        key,
        label: monthKeyToLabel(key),
        count: g.length,
        charges,
        ppn,
        subtotal: computeSubtotal({ total: charges, ppn }),
      };
    });
}
