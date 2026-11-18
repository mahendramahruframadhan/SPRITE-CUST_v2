// Helper rekap operasional Report Summary — murni tanpa React agar bisa
// diuji unit terpisah (lihat test/workloadSummary.test.mjs).
const BILLING_ORDER = ['ON-CALL', 'MONTHLY', 'FREE', 'LAINNYA'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const ZERO = { count: 0, done: 0, open: 0, validated: 0, charges: 0, ppn: 0, subtotal: 0 };

const num = (v) => Number(v) || 0;

// Baris tabel per billing status. LAINNYA hanya ikut bila ada kasus.
export function billingRows(totals) {
  const total = num(totals?.count);
  const byBilling = totals?.byBilling || {};
  return BILLING_ORDER
    .filter((key) => key !== 'LAINNYA' || num(byBilling.LAINNYA?.count) > 0)
    .map((key) => {
      const b = { ...ZERO, ...(byBilling[key] || {}) };
      const count = num(b.count);
      return {
        key,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        done: num(b.done),
        open: num(b.open),
        validated: num(b.validated),
        charges: num(b.charges),
        ppn: num(b.ppn),
        subtotal: num(b.subtotal),
      };
    });
}

// Salinan baris per user dengan nilai ON-CALL dinormalisasi ke number.
export function userRows(byAssignee) {
  return (byAssignee || []).map((u) => ({
    ...u,
    onCallSubtotal: num(u?.onCallSubtotal),
  }));
}

// Jumlah user aktif; label sintetik TANPA USER tidak dihitung sebagai user.
export function countActiveUsers(byAssignee) {
  return (byAssignee || []).filter((u) => String(u?.assignTo || '').trim().toUpperCase() !== 'TANPA USER').length;
}

// Kartu KPI rekap operasional: total + tiap status + user aktif + TANPA USER.
// LAINNYA hanya jadi kartu bila ada kasus (di tabel selalu tampil bila > 0).
export function workloadKpiCards(totals, byAssignee) {
  const byBilling = totals?.byBilling || {};
  const cards = [
    { t: 'Total Kasus', v: num(totals?.count) },
    { t: 'ON-CALL', v: num(byBilling['ON-CALL']?.count) },
    { t: 'MONTHLY', v: num(byBilling.MONTHLY?.count) },
    { t: 'FREE', v: num(byBilling.FREE?.count) },
  ];
  if (num(byBilling.LAINNYA?.count) > 0) cards.push({ t: 'LAINNYA', v: num(byBilling.LAINNYA.count) });
  cards.push({ t: 'User Aktif', v: countActiveUsers(byAssignee) });
  cards.push({ t: 'Kasus TANPA USER', v: num((byAssignee || []).find((u) => String(u?.assignTo || '').trim().toUpperCase() === 'TANPA USER')?.count) });
  return cards;
}

// 'YYYY-MM' -> 'Okt 2026'; format lain -> ''.
export function fmtMonthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '').trim());
  if (!m) return '';
  const month = Number(m[2]);
  if (month < 1 || month > 12) return '';
  return `${MONTHS[month - 1]} ${m[1]}`;
}

// Ringkasan filter tabel detail: 'ON-CALL · RAMA · Tervalidasi'.
// Semua default -> ''.
export function detailFilterLabel(billing, assignee, validation) {
  const validationLabel = validation === 'validated' ? 'Tervalidasi' : validation === 'unvalidated' ? 'Belum' : '';
  return [billing, assignee, validationLabel].map((v) => String(v || '').trim()).filter(Boolean).join(' · ');
}

// Hint di section finansial saat periode ini tidak punya ON-CALL tervalidasi
// tetapi masih ada kasus operasional.
export function financialHint(workload, financialCount) {
  if (num(financialCount) !== 0) return '';
  if (num(workload?.totals?.count) <= 0) return '';
  const base = 'Belum ada kasus ON-CALL tervalidasi pada periode ini.';
  const last = fmtMonthLabel(workload?.options?.lastValidatedMonth);
  return last ? `${base} Terakhir tervalidasi: ${last}.` : base;
}
