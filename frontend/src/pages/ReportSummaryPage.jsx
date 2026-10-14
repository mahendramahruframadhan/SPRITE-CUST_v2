import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from '../components/Reveal.jsx';
import { useFinanceTax } from '../hooks/useFinanceTax.js';
import { useFilters } from '../hooks/useFilters.js';
import { useToast } from '../context/ToastContext.jsx';
import { fetchAnalyticsOverview, fetchAnalyticsDrilldown } from '../lib/api.js';
import { filterOnCallRows } from '../lib/onCallFilter.js';
import { analyticsRangeError } from '../lib/analyticsRange.js';
import { buildReportCsv, reportCsvFilename } from '../lib/reportExport.js';
import { printSection } from '../lib/printSection.js';
import FilterLabel from '../components/FilterLabel.jsx';
import { EmptyRow, LoadingRow, Pill } from '../components/DataTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { fmtDate8 } from '../utils/format.js';
import { invLabel, invoiceTone } from '../utils/tones.js';

// Halaman Report Summary: dokumen rekap read-only kasus tervalidasi
// (VALID - SIAP INVOICE, ON-CALL) untuk manajemen.
// Agregasi di backend (GET /analytics/overview + /analytics/drilldown);
// halaman ini tidak menulis apa pun.
const EMPTY_SUMMARY = {
  count: 0, charges: 0, ppn: 0, subtotal: 0, pphCount: 0,
  paid: { count: 0, charges: 0, ppn: 0, subtotal: 0 },
  outstanding: { count: 0, charges: 0, ppn: 0, subtotal: 0 },
  byInvoice: {},
  byBilling: {
    'ON-CALL': { count: 0, charges: 0, ppn: 0, subtotal: 0 },
  },
};
const EMPTY_AGING = { buckets: [], total: { count: 0, subtotal: 0 }, invalid: 0 };

function fmtMoney(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

// Badge + bar aging: Baik (hijau), Normal (biru), Perhatian (kuning), Risiko (merah).
function riskTone(s) {
  if (s === 'Baik') return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
  if (s === 'Normal') return 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20';
  if (s === 'Perhatian') return 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
  return 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20';
}
function riskBar(s) {
  if (s === 'Baik') return 'bg-emerald-500';
  if (s === 'Normal') return 'bg-sky-500';
  if (s === 'Perhatian') return 'bg-amber-500';
  return 'bg-rose-500';
}

const moneySize = (v) => {
  const len = String(v ?? '').length;
  if (len > 16) return 'text-[17px]';
  if (len > 13) return 'text-[20px]';
  return 'text-[22px]';
};

// Tombol cetak satu section (A4). Disembunyikan saat print.
function PrintBtn({ id, label }) {
  return (
    // eslint-disable-next-line react/forbid-elements -- tombol cetak ikon
    <button
      type="button"
      onClick={() => printSection(id)}
      title={`Cetak ${label}`}
      aria-label={`Cetak ${label}`}
      className="no-print inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400 transition min-h-[44px] px-2"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2m-12-3h12v6H6v-6z" />
      </svg>
      Cetak
    </button>
  );
}

// Link "BRAND #no" → deep-link /finance?uuid= (filter + modal terbuka).
function CaseLink({ c, className = '' }) {
  if (!c?.recordUuid) return <span className={className}>{c?.client || '-'} <span className="font-medium text-slate-400">#{c?.no || '-'}</span></span>;
  return (
    <Link to={`/finance?uuid=${c.recordUuid}`} className={`text-emerald-700 hover:text-emerald-600 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300 ${className}`}>
      {c.client || '-'} <span className="font-medium opacity-70">#{c.no || '-'}</span>
    </Link>
  );
}
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
  // Badge "pajak menunggu sinkron" (outbox lokal) — angka halaman dari server.
  const { pendingUuids } = useFinanceTax({ notify });

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
    brand: '', module: '',
  });
  const { month, from, to, brand, module } = filters;
  const applyMonth = (ym) => {
    const r = rangeOfMonth(ym);
    setManyFilters({ month: ym, from: r.from, to: r.to });
  };

  // Rentang tak valid tidak menembak request yang pasti 422.
  const rangeError = analyticsRangeError(from, to);
  const invalidRange = !!rangeError;

  // Overview agregasi backend: angka (menyempit per brand/module) +
  // overview periode (opsi dropdown, tak menyempit).
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overviewAll, setOverviewAll] = useState(null);
  const ovSeq = useRef(0);
  const ovAllSeq = useRef(0);
  useEffect(() => {
    const my = ++ovSeq.current;
    if (rangeError) {
      setOverview(null);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    fetchAnalyticsOverview({ from, to, brand, module }).then(
      (r) => {
        if (ovSeq.current !== my) return;
        setOverview(r);
        setLoading(false);
      },
      (e) => {
        if (ovSeq.current !== my) return;
        setOverview(null);
        setError(e.message || 'Gagal memuat data');
        setLoading(false);
      }
    );
  }, [from, to, brand, module, rangeError]);
  useEffect(() => {
    const my = ++ovAllSeq.current;
    if (rangeError) {
      setOverviewAll(null);
      return;
    }
    fetchAnalyticsOverview({ from, to }).then(
      (r) => {
        if (ovAllSeq.current !== my) return;
        setOverviewAll(r);
      },
      () => {}
    );
  }, [from, to, rangeError]);

  const summary = useMemo(() => {
    if (!overview) return EMPTY_SUMMARY;
    const k = overview.kpis || {};
    return {
      count: k.count || 0,
      charges: k.charges || 0,
      ppn: k.ppn || 0,
      subtotal: k.subtotal || 0,
      pphCount: k.pphCount || 0,
      paid: k.paid || { count: 0, subtotal: 0 },
      outstanding: k.outstanding || { count: 0, subtotal: 0 },
      byInvoice: overview.byInvoice || {},
      byBilling: overview.byBilling || EMPTY_SUMMARY.byBilling,
    };
  }, [overview]);
  const aging = overview?.aging || EMPTY_AGING;
  const top10 = overview?.top || [];
  const brandBreak = overview?.byBrand || [];
  const moduleBreak = overview?.byModule || [];
  const brandOpts = useMemo(() => (overviewAll?.byBrand || []).map((b) => b.brand), [overviewAll]);
  const moduleOpts = useMemo(() => (overviewAll?.byModule || []).map((b) => b.module), [overviewAll]);

  const periodeLabel = from || to ? `${from || 'Awal'} s.d. ${to || 'Akhir'}` : 'Semua tanggal';
  const todayLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const paidShare = summary.subtotal > 0 ? Math.round((summary.paid.subtotal / summary.subtotal) * 100) : 0;

  // Tabel detail dari backend (server-side cari + paginasi).
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Debounce pencarian agar tidak request per ketikan.
  const [debQ, setDebQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debQ, from, to, perPage, brand, module]);

  const [drill, setDrill] = useState({ data: [], total: 0, totalPages: 1, subtotal: 0 });
  const [drLoading, setDrLoading] = useState(true);
  const [drError, setDrError] = useState('');
  const drSeq = useRef(0);
  useEffect(() => {
    const my = ++drSeq.current;
    if (rangeError) {
      setDrill({ data: [], total: 0, totalPages: 1, subtotal: 0 });
      setDrLoading(false);
      setDrError('');
      return;
    }
    setDrLoading(true);
    setDrError('');
    fetchAnalyticsDrilldown({ from, to, brand, module, q: debQ, page, limit: perPage }).then(
      (r) => {
        if (drSeq.current !== my) return;
        setDrill({ data: r.data || [], total: r.total || 0, totalPages: r.totalPages || 1, subtotal: r.subtotal || 0 });
        setDrLoading(false);
      },
      (e) => {
        if (drSeq.current !== my) return;
        setDrill({ data: [], total: 0, totalPages: 1, subtotal: 0 });
        setDrError(e.message || 'Gagal memuat data');
        setDrLoading(false);
      }
    );
  }, [from, to, brand, module, debQ, page, perPage, rangeError]);

  const detailItems = useMemo(
    () => filterOnCallRows(drill.data || [])
      .map((c) => ({ ...c, invStatus: c.invoiceStatus || 'MENUNGGU INVOICE' })),
    [drill]
  );
  const detailCount = detailItems.length;
  const totalPages = Math.max(1, Math.ceil(detailCount / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = detailItems.slice((safePage - 1) * perPage, safePage * perPage);

  // Tiga KPI uang di kolom kiri (Charges / PPN / Subtotal Akhir).
  const financeKpi = [
    { t: 'Total Charges', v: summary.charges, sub: 'Σ charges pool', color: 'text-sky-600', darkColor: 'dark:text-sky-400', accent: 'from-sky-400 to-blue-600' },
    { t: 'Total PPN', v: summary.ppn, sub: 'PPN baris ON-CALL', color: 'text-amber-600', darkColor: 'dark:text-amber-400', accent: 'from-amber-400 to-orange-500' },
    { t: 'Subtotal Akhir', v: summary.subtotal, sub: 'Charges + PPN', color: 'text-emerald-600', darkColor: 'dark:text-emerald-400', accent: 'from-emerald-400 to-teal-600' },
  ];

  // Kartu info di kolom kanan (selain tiga uang di atas).
  const infoCards = [
    { t: 'Kasus Tervalidasi', v: summary.count.toLocaleString('id-ID'), sub: 'ON-CALL', color: 'text-brand-600', darkColor: 'dark:text-brand-300' },
    { t: 'Kasus ber-flag PPH23', v: summary.pphCount.toLocaleString('id-ID'), sub: 'info saja, tanpa potongan', color: 'text-violet-600', darkColor: 'dark:text-violet-400' },
    { t: 'Outstanding', v: fmtMoney(summary.outstanding.subtotal), sub: `${summary.outstanding.count} kasus belum dibayar`, color: 'text-rose-600', darkColor: 'dark:text-rose-400', money: true },
  ];

  const invOrder = ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'DIKIRIM', 'PAID'];
  const invRows = [
    ...invOrder.filter((k) => summary.byInvoice[k]).map((k) => [k, summary.byInvoice[k]]),
    ...Object.keys(summary.byInvoice).filter((k) => !invOrder.includes(k)).map((k) => [k, summary.byInvoice[k]]),
  ];
  const byBillingRows = [
    ['ON-CALL', summary.byBilling['ON-CALL']],
  ];

  const detailTotal = drill.subtotal || 0;
  const tableLoading = drLoading;
  const tableError = drError;
  const pageNums = (() => {
    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  })();

  function exportData() {
    const csv = buildReportCsv(summary, { periode: periodeLabel, aging, top: top10, brandBreak, moduleBreak });
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
      <Reveal data-section="hero" className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#064e3b] via-[#059669] to-[#10b981] text-white shadow-2xl shadow-emerald-600/25">
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
                (ON-CALL) membangun subtotal{' '}
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
          <div>
            <FilterLabel>Brand</FilterLabel>
            <select value={brand} onChange={(e) => setManyFilters({ brand: e.target.value })} className={filterCls}>
              <option value="">Semua brand</option>
              {brandOpts.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <FilterLabel>Module</FilterLabel>
            <select value={module} onChange={(e) => setManyFilters({ module: e.target.value })} className={filterCls}>
              <option value="">Semua module</option>
              {moduleOpts.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            Periode:{' '}
            <span className="font-semibold text-slate-600 dark:text-slate-300">{periodeLabel}</span>
          </div>
        </div>
      </Reveal>

      {(error || tableError) && (
        <div className="no-print bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-300" role="alert">
          Backend tidak terjangkau — {error || tableError}
        </div>
      )}
      {rangeError && !(error || tableError) && (
        <div className="no-print bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl px-4 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300" role="alert">
          {rangeError}
        </div>
      )}

      {/* ===== Ringkasan Keuangan: 3 kartu uang + kartu info ===== */}
      <Reveal data-section="kpi" className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-5 flex items-center justify-between">
          <h3 className="report-card-title !mb-0">Ringkasan Keuangan</h3>
        </div>
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
        <div className="report-card" data-section="rekap-invoice">
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

        <div className="report-card" data-section="rekap-billing">
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
              {summary.pphCount.toLocaleString('id-ID')} kasus ber-flag PPH23
              <span className="text-slate-400 dark:text-slate-500"> (info saja, tanpa potongan)</span>
            </p>
            <p>
              Paid <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtMoney(summary.paid.subtotal)}</span>
              {' '}· Outstanding <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">{fmtMoney(summary.outstanding.subtotal)}</span>
            </p>
          </div>
        </div>
      </Reveal>

      {/* ===== Aging tunggakan (outstanding) + Top 10 ===== */}
      <Reveal className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="report-card" data-section="aging">
          <h3 className="report-card-title">Aging Tunggakan</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1 mb-3">
            Umur = hari ini − tanggal issue · {aging.total.count.toLocaleString('id-ID')} kasus belum dibayar
            {aging.invalid > 0 && ` · ${aging.invalid} tanpa tanggal valid dikecualikan`}
          </p>
          {loading ? (
            <table className="w-full text-sm"><tbody><LoadingRow colSpan={2} /></tbody></table>
          ) : (
            <>
              {aging.buckets.map((b) => (
                <div key={b.key} className="mb-3">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {b.label} <span className={`ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${riskTone(b.status)}`}>{b.status}</span>
                    </span>
                    <span className="tabular-nums font-extrabold text-slate-900 dark:text-white">{fmtMoney(b.subtotal)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={b.percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.label} ${b.percentage}%`}>
                    <div className={`h-full rounded-full ${riskBar(b.status)}`} style={{ width: `${b.percentage}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{b.count.toLocaleString('id-ID')} kasus · {b.percentage}% dari tunggakan</p>
                </div>
              ))}
              <ReportRow label="TOTAL TUNGGAKAN" value={fmtMoney(aging.total.subtotal)} cls="text-rose-600 dark:text-rose-400" />
            </>
          )}
        </div>

        <div className="report-card" data-section="top10">
          <h3 className="report-card-title">Top 10 Tunggakan Terbesar</h3>
          {loading ? (
            <table className="w-full text-sm"><tbody><LoadingRow colSpan={2} /></tbody></table>
          ) : top10.length === 0 ? (
            <table className="w-full text-sm"><tbody><EmptyRow colSpan={2}>Tidak ada tunggakan pada periode ini</EmptyRow></tbody></table>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {top10.map((c, i) => (
                  <tr key={c.recordUuid} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <td className="py-2 pr-2 text-slate-400 dark:text-slate-500 tabular-nums w-8">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <p className="font-bold text-slate-800 dark:text-slate-100 truncate"><CaseLink c={c} /></p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{fmtDate8(c.dateIssue)} · {c.ageDays ?? '-'} hari · {invLabel(c.invStatus)}</p>
                    </td>
                    <td className="py-2 text-right tabular-nums font-extrabold text-slate-900 dark:text-white whitespace-nowrap">{fmtMoney(c.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Reveal>

      {/* ===== Breakdown per brand + per module ===== */}
      <Reveal className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[{ sec: 'break-brand', title: 'Nilai per Brand', rows: brandBreak }, { sec: 'break-module', title: 'Nilai per Module', rows: moduleBreak }].map((s) => (
          <div key={s.title} className="report-card" data-section={s.sec}>
            <h3 className="report-card-title">{s.title}</h3>
            {loading ? (
              <table className="w-full text-sm"><tbody><LoadingRow colSpan={2} /></tbody></table>
            ) : s.rows.length === 0 ? (
              <table className="w-full text-sm"><tbody><EmptyRow colSpan={2}>Tidak ada data pada periode ini</EmptyRow></tbody></table>
            ) : (
              s.rows.slice(0, 8).map((g) => (
                <div key={g.name} className="mb-3">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{g.name}</span>
                    <span className="tabular-nums font-extrabold text-slate-900 dark:text-white whitespace-nowrap">{fmtMoney(g.subtotal)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={g.percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} ${g.percentage}%`}>
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-600" style={{ width: `${g.percentage}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{g.count.toLocaleString('id-ID')} kasus · {g.percentage}% dari subtotal</p>
                </div>
              ))
            )}
          </div>
        ))}
      </Reveal>

      {/* ===== Detail kasus tervalidasi (per baris) ===== */}
      <Reveal data-section="detail" className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,.05),0_12px_32px_-16px_rgba(16,24,40,.15)]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-800/60 dark:to-slate-900">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Detail Kasus Tervalidasi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tableLoading ? 'Memuat dari backend…' : `${detailCount} kasus · total subtotal ${fmtMoney(detailTotal)}`}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <PrintBtn id="detail" label="Detail Kasus" />
              <div className="relative no-print">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Cari no / brand…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 pr-3 py-2.5 min-h-[44px] w-full sm:w-auto text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition"
              />
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/70">
                <th className="px-6 py-3 font-bold">No</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Tanggal</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Brand</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap">Charges</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap">PPN</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap">Subtotal</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">PPH23</th>
                <th className="px-6 py-3 font-bold whitespace-nowrap">Status Invoice</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">No. Invoice</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paged.map((c) => (
                <tr key={c.recordUuid} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-emerald-50/50 dark:hover:bg-slate-800 transition">
                  <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 tabular-nums">{c.no || '-'}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap tabular-nums">{fmtDate8(c.dateIssue)}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap"><CaseLink c={c} /></td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtMoney(c.charges)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtMoney(c.ppn)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-extrabold text-slate-900 dark:text-white whitespace-nowrap">{fmtMoney(c.subtotal)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {c.pph ? (
                      <span className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-1 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20">PPH23</span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Tidak ada PPH23</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <Pill dot tone={invoiceTone(c.invStatus)}>{invLabel(c.invStatus)}</Pill>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs">{c.invoiceNo || 'Belum diisi'}</td>
                  <td className="px-4 py-3.5 text-xs max-w-[260px]"><p className="line-clamp-2">{c.invoiceNote || 'Belum diisi'}</p></td>
                </tr>
              ))}
              {tableLoading ? (
                <LoadingRow colSpan={10} />
              ) : invalidRange ? (
                <EmptyRow colSpan={10}>Rentang tanggal tidak valid (Date From melebihi Date Until)</EmptyRow>
              ) : detailCount === 0 && (
                <EmptyRow colSpan={10}>Tidak ada data tervalidasi pada periode ini</EmptyRow>
              )}
            </tbody>
          </table>
        </div>
        {/* Varian kartu untuk HP */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {paged.map((c) => (
            <div key={c.recordUuid} className="px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-800 dark:text-slate-100 truncate"><CaseLink c={c} /></p>
                <Pill dot tone={invoiceTone(c.invStatus)}>{invLabel(c.invStatus)}</Pill>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{fmtDate8(c.dateIssue)}{c.pph ? ' · PPH23' : ''}</p>
              {(c.invoiceNo || c.invoiceNote) && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {c.invoiceNo ? `No. Invoice: ${c.invoiceNo}` : 'No. Invoice: Belum diisi'}{c.invoiceNote ? ` · Keterangan: ${c.invoiceNote}` : ' · Keterangan: Belum diisi'}
                </p>
              )}
              <div className="mt-2 flex items-baseline justify-between gap-2 text-sm tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">Charges {fmtMoney(c.charges)} + PPN {fmtMoney(c.ppn)}</span>
                <span className="font-extrabold text-slate-900 dark:text-white">{fmtMoney(c.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="no-print px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-800/40">
          <span className="tabular-nums">
            Menampilkan {detailCount === 0 ? 0 : (safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, detailCount)} dari {detailCount} data
          </span>
          <div className="flex items-center gap-1 ml-auto overflow-x-auto max-w-full scrollbar-thin">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Halaman sebelumnya"
              className="shrink-0 font-bold disabled:opacity-40"
            >
              ‹
            </Button>
            {pageNums.map((n) => (
              <Button
                key={n}
                variant={n === safePage ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setPage(n)}
                aria-current={n === safePage ? 'page' : undefined}
                className="shrink-0 font-bold"
              >
                {n}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Halaman berikutnya"
              className="shrink-0 font-bold disabled:opacity-40"
            >
              ›
            </Button>
          </div>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-200"
          >
            <option value={10}>10 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
          </select>
          <span className="tabular-nums">Total subtotal: <span className="text-base font-extrabold text-slate-900 dark:text-white">{fmtMoney(detailTotal)}</span></span>
        </div>
      </Reveal>
    </div>
  );
}
