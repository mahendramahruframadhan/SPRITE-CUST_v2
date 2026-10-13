import { useCallback, useEffect, useMemo } from 'react';
import { Reveal } from '../components/Reveal.jsx';
import { useRangedCases } from '../hooks/useCases.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { useInvoiceState } from '../hooks/useInvoiceState.js';
import { useFinanceTax } from '../hooks/useFinanceTax.js';
import { useFilters } from '../hooks/useFilters.js';
import { useToast } from '../context/ToastContext.jsx';
import { getAuditMap, getInvoiceMap } from '../lib/api.js';
import { buildReportSummary } from '../lib/reportSummary.js';
import { buildReportCsv, reportCsvFilename } from '../lib/reportExport.js';
import FilterLabel from '../components/FilterLabel.jsx';
import { EmptyRow, LoadingRow } from '../components/DataTable.jsx';
import { Button } from '../components/ui/Button.jsx';

// Halaman Report Summary: dokumen rekap read-only kasus tervalidasi
// (VALID - SIAP INVOICE, ON-CALL + MONTHLY) untuk manajemen.
// Sumber kebenaran tetap Billing & Finance; halaman ini tidak menulis apa pun.
const VALID_TAG = 'VALID - SIAP INVOICE';

function fmtMoney(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

const moneySize = (v) => {
  const len = String(v ?? '').length;
  if (len > 16) return 'text-[17px]';
  if (len > 13) return 'text-[20px]';
  return 'text-[22px]';
};

// Baris rekap dokumen: label di kiri, nilai di kanan, garis putus-putus.
function ReportRow({ label, value, cls = 'text-slate-900 dark:text-white' }) {
  return (
    <div className="report-row">
      <span className="report-row-label">{label}</span>
      <span className={`report-row-value ${cls}`}>{value}</span>
    </div>
  );
}

export default function ReportSummaryPage() {
  const { notify } = useToast();
  const { caseAuditStatus, syncAuditStatus } = useAuditState();
  const { invoiceStatus, defaultInvoiceStatus, syncInvoiceStatus } = useInvoiceState();
  const { taxMap, pendingUuids } = useFinanceTax({ notify });

  // Filter periode saja (tanpa brand): month -> from/to -> WHERE date_issue.
  // Default = bulan berjalan. Kosong = semua tanggal.
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rangeOfMonth = (ym) => {
    if (!ym) return { from: '', to: '' };
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const p = (n) => String(n).padStart(2, '0');
    return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${last}` };
  };
  const [filters, , resetFilterValues, setManyFilters] = useFilters({
    month: monthKey(), from: rangeOfMonth(monthKey()).from, to: rangeOfMonth(monthKey()).to,
  });
  const { month, from, to } = filters;
  const { cases: allCases, loading, error } = useRangedCases(from, to);
  const applyMonth = (ym) => {
    const r = rangeOfMonth(ym);
    setManyFilters({ month: ym, from: r.from, to: r.to });
  };

  // Sinkron peta status dari backend (sumber kebenaran): saat mount +
  // tiap jendela kembali fokus — ikut pola Billing/Finance.
  const syncFromServer = useCallback(() => {
    getAuditMap()
      .then((r) => {
        if (!r || typeof r.map !== 'object') return;
        Object.entries(r.map).forEach(([uuid, st]) => syncAuditStatus(uuid, st));
      })
      .catch(() => {});
    getInvoiceMap()
      .then((r) => {
        if (!r || typeof r.map !== 'object') return;
        Object.entries(r.map).forEach(([uuid, st]) => syncInvoiceStatus(uuid, st));
      })
      .catch(() => {});
  }, [syncAuditStatus, syncInvoiceStatus]);

  useEffect(() => {
    syncFromServer();
    window.addEventListener('focus', syncFromServer);
    return () => window.removeEventListener('focus', syncFromServer);
  }, [syncFromServer]);

  // Pool tervalidasi dalam periode (FREE selalu dikecualikan).
  const validatedPool = useMemo(
    () =>
      allCases.filter(
        (c) =>
          (c.billingStatus === 'ON-CALL' || c.billingStatus === 'MONTHLY') &&
          caseAuditStatus[c.recordUuid] === VALID_TAG
      ),
    [allCases, caseAuditStatus]
  );

  const summary = useMemo(
    () => buildReportSummary(validatedPool, taxMap, invoiceStatus, defaultInvoiceStatus),
    [validatedPool, taxMap, invoiceStatus, defaultInvoiceStatus]
  );

  const invalidRange = from && to && from > to;
  const periodeLabel = from || to ? `${from || 'Awal'} s.d. ${to || 'Akhir'}` : 'Semua tanggal';
  const todayLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const paidShare = summary.subtotal > 0 ? Math.round((summary.paid.subtotal / summary.subtotal) * 100) : 0;

  // Tiga KPI uang di kolom kiri (Charges / PPN / Subtotal Akhir).
  const financeKpi = [
    { t: 'Total Charges', v: summary.charges, sub: 'Σ charges pool', color: 'text-sky-600', darkColor: 'dark:text-sky-400', accent: 'from-sky-400 to-blue-600' },
    { t: 'Total PPN', v: summary.ppn, sub: 'PPN baris ON-CALL', color: 'text-amber-600', darkColor: 'dark:text-amber-400', accent: 'from-amber-400 to-orange-500' },
    { t: 'Subtotal Akhir', v: summary.subtotal, sub: 'Charges + PPN', color: 'text-emerald-600', darkColor: 'dark:text-emerald-400', accent: 'from-emerald-400 to-teal-600' },
  ];

  // Kartu info di kolom kanan (selain tiga uang di atas).
  const infoCards = [
    { t: 'Kasus Tervalidasi', v: summary.count.toLocaleString('id-ID'), sub: 'ON-CALL + MONTHLY', color: 'text-brand-600', darkColor: 'dark:text-brand-300' },
    { t: 'Kasus ber-flag PPh', v: summary.pphCount.toLocaleString('id-ID'), sub: 'info saja, tanpa potongan', color: 'text-violet-600', darkColor: 'dark:text-violet-400' },
    { t: 'Outstanding', v: fmtMoney(summary.outstanding.subtotal), sub: `${summary.outstanding.count} kasus belum dibayar`, color: 'text-rose-600', darkColor: 'dark:text-rose-400', money: true },
  ];

  const invOrder = ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'DIKIRIM', 'PAID'];
  const invRows = [
    ...invOrder.filter((k) => summary.byInvoice[k]).map((k) => [k, summary.byInvoice[k]]),
    ...Object.keys(summary.byInvoice).filter((k) => !invOrder.includes(k)).map((k) => [k, summary.byInvoice[k]]),
  ];
  const byBillingRows = [
    ['ON-CALL', summary.byBilling['ON-CALL']],
    ['MONTHLY', summary.byBilling['MONTHLY']],
  ];

  function exportData() {
    const csv = buildReportCsv(summary, { periode: periodeLabel });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportCsvFilename(periodeLabel);
    a.click();
    URL.revokeObjectURL(url);
    notify(`Export ${summary.count} kasus tervalidasi berhasil diunduh.`, 'success');
  }

  const filterCls =
    'mt-1 block min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 transition';

  return (
    <div className="page">
      {/* Kop cetak: hanya tampil saat print */}
      <div className="print-kop" aria-hidden="true">
        <h1>Report Summary — Kasus Tervalidasi</h1>
        <p>Periode: {periodeLabel} · Dicetak: {todayLabel}</p>
      </div>

      {/* ===== HERO (juga jadi kop dokumen saat print) ===== */}
      <Reveal className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#064e3b] via-[#059669] to-[#10b981] text-white shadow-2xl shadow-emerald-600/25">
        <div aria-hidden="true" className="absolute -right-24 -top-24 w-96 h-96 bg-white/15 rounded-full blur-3xl" />
        <div aria-hidden="true" className="absolute -left-16 -bottom-28 w-80 h-80 bg-teal-300/20 rounded-full blur-3xl" />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 no-print">
                <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] bg-white/15 border border-white/20 rounded-full px-3 py-1">
                  [ REPORT /// SUMMARY ]
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white/10 border border-white/15 rounded-full px-3 py-1">
                  Periode: {periodeLabel}
                </span>
                {(pendingUuids || []).length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-amber-400/20 border border-amber-200/30 rounded-full px-3 py-1">
                    {(pendingUuids || []).length} pajak menunggu sinkron
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                Report Summary
              </h1>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">
                Laporan Rekapitulasi Kasus Tervalidasi · {periodeLabel}
              </p>
              {/* Ringkasan eksekutif satu paragraf */}
              <p className="mt-3 text-sm text-white/90 max-w-2xl leading-relaxed">
                Pada periode ini, <span className="font-bold">{summary.count} kasus</span> tervalidasi
                (ON-CALL + MONTHLY) membangun subtotal{' '}
                <span className="font-bold tabular-nums">{fmtMoney(summary.subtotal)}</span>, terdiri dari
                charges <span className="tabular-nums">{fmtMoney(summary.charges)}</span> dan PPN{' '}
                <span className="tabular-nums">{fmtMoney(summary.ppn)}</span>. Dari jumlah itu,{' '}
                <span className="font-bold tabular-nums">{fmtMoney(summary.paid.subtotal)}</span> sudah dibayar
                ({paidShare}%), dengan outstanding{' '}
                <span className="font-bold tabular-nums">{fmtMoney(summary.outstanding.subtotal)}</span> yang
                masih menunggu pembayaran.
              </p>
            </div>
            <div className="flex flex-wrap lg:flex-col gap-2.5 shrink-0 no-print">
              {/* eslint-disable-next-line react/forbid-elements -- tombol hero bertema (pengecualian tercatat Task 2) */}
              <button
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 text-sm font-extrabold px-4 py-3 min-h-[44px] rounded-2xl shadow-lg hover:bg-emerald-50 transition active:scale-[.98]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M16.5 4.5V3.75a.75.75 0 00-.75-.75h-7.5a.75.75 0 00-.75.75v.75m9 0H7.5m9 0a2.25 2.25 0 012.25 2.25v.75M7.5 4.5A2.25 2.25 0 005.25 6.75v.75" />
                </svg>
                Cetak / PDF
              </button>
              {/* eslint-disable-next-line react/forbid-elements -- tombol hero bertema (pengecualian tercatat Task 2) */}
              <button
                onClick={exportData}
                className="inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white/90 bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2.5 min-h-[44px] rounded-2xl transition active:scale-[.98]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Filter periode */}
      <Reveal className="no-print bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <FilterLabel>Bulan</FilterLabel>
            <div className="flex items-center gap-2">
              <input type="month" value={month} onChange={(e) => applyMonth(e.target.value)} className={filterCls} />
              <Button
                variant="secondary"
                type="button"
                onClick={() => applyMonth(monthKey())}
                title="Kembali ke bulan berjalan"
                className="text-[13px] text-brand-600 dark:text-brand-300 hover:text-brand-700 hover:border-brand-300 whitespace-nowrap"
              >
                Bulan ini
              </Button>
            </div>
          </div>
          <div>
            <FilterLabel>Date From</FilterLabel>
            <input type="date" value={from} onChange={(e) => setManyFilters({ from: e.target.value, month: '' })} className={filterCls} />
          </div>
          <div>
            <FilterLabel>Date Until</FilterLabel>
            <input type="date" value={to} onChange={(e) => setManyFilters({ to: e.target.value, month: '' })} className={filterCls} />
          </div>
          <Button
            variant="secondary"
            onClick={() => resetFilterValues()}
            className="text-[13px] hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10"
          >
            Reset
          </Button>
          <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            Periode:{' '}
            <span className="font-semibold text-slate-600 dark:text-slate-300">{periodeLabel}</span>
          </div>
        </div>
      </Reveal>

      {error && (
        <div className="no-print bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-300" role="alert">
          Backend tidak terjangkau — {error}
        </div>
      )}

      {/* ===== Ringkasan Keuangan: 3 kartu uang + kartu info ===== */}
      <Reveal className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {financeKpi.map((d) => (
            <div key={d.t} className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 p-5 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:shadow-xl hover:-translate-y-1 hover:border-transparent transition-all duration-300">
              <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${d.accent}`} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.12em] truncate">{d.t}</p>
                  <p className={`mt-2 ${moneySize(d.v)} leading-tight font-extrabold tracking-tight tabular-nums ${d.color} ${d.darkColor || ''}`}>{fmtMoney(d.v)}</p>
                  <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{d.sub}</p>
                </div>
                <span className={`w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br ${d.accent} text-white flex items-center justify-center shadow-lg`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-white" aria-hidden="true" />
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
          {infoCards.map((d) => (
            <div key={d.t} className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 p-5 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:shadow-xl hover:-translate-y-1 hover:border-transparent transition-all duration-300">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.12em] truncate">{d.t}</p>
                  <p className={`mt-2 ${d.money ? moneySize(d.v) : 'text-[28px]'} leading-tight font-extrabold tracking-tight tabular-nums ${d.color} ${d.darkColor || ''}`}>{d.v}</p>
                  <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{d.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ===== Dua kartu rekap kecil: status invoice + billing status ===== */}
      <Reveal className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="report-card">
          <h3 className="report-card-title">Rincian per Status Invoice</h3>
          {loading ? (
            <table className="w-full text-sm"><tbody><LoadingRow colSpan={2} /></tbody></table>
          ) : invalidRange ? (
            <table className="w-full text-sm"><tbody><EmptyRow colSpan={2}>Rentang tanggal tidak valid (Date From melebihi Date Until)</EmptyRow></tbody></table>
          ) : summary.count === 0 ? (
            <table className="w-full text-sm"><tbody><EmptyRow colSpan={2}>Tidak ada data tervalidasi pada periode ini</EmptyRow></tbody></table>
          ) : (
            <>
              {invRows.map(([st, b]) => (
                <ReportRow
                  key={st}
                  label={`${st} (${b.count.toLocaleString('id-ID')} kasus)`}
                  value={fmtMoney(b.subtotal)}
                />
              ))}
              <ReportRow label="TOTAL" value={fmtMoney(summary.subtotal)} cls="text-emerald-700 dark:text-emerald-400" />
            </>
          )}
        </div>

        <div className="report-card">
          <h3 className="report-card-title">Rincian per Billing Status</h3>
          {byBillingRows.map(([bs, b]) => (
            <ReportRow
              key={bs}
              label={`${bs} (${b.count.toLocaleString('id-ID')} kasus)`}
              value={fmtMoney(b.subtotal)}
            />
          ))}
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p>
              {summary.pphCount.toLocaleString('id-ID')} kasus ber-flag PPh
              <span className="text-slate-400 dark:text-slate-500"> (info saja, tanpa potongan)</span>
            </p>
            <p>
              Paid <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtMoney(summary.paid.subtotal)}</span>
              {' '}· Outstanding <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">{fmtMoney(summary.outstanding.subtotal)}</span>
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
