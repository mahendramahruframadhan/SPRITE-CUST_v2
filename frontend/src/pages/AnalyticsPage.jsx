import { useEffect, useMemo, useRef, useState } from 'react';
import { Reveal } from '../components/Reveal.jsx';
import { Line, Doughnut } from 'react-chartjs-2';
import { useFinanceTax } from '../hooks/useFinanceTax.js';
import { useFilters } from '../hooks/useFilters.js';
import { useToast } from '../context/ToastContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { fetchAnalyticsOverview, fetchAnalyticsDrilldown } from '../lib/api.js';
import { analyticsRangeError } from '../lib/analyticsRange.js';
import FilterLabel from '../components/FilterLabel.jsx';
import { EmptyRow, LoadingRow, Pill } from '../components/DataTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { fmtDate8 } from '../utils/format.js';
import { invLabel, invoiceTone, moduleTone, billingTone } from '../utils/tones.js';
import { filterOnCallRows } from '../lib/onCallFilter.js';

// Halaman Analitik: visual tren + distribusi + KPI dari pool tervalidasi
// (VALID - SIAP INVOICE, ON-CALL). Agregasi di backend
// (GET /analytics/overview + /analytics/drilldown); halaman ini read-only.
const EMPTY_SUMMARY = { count: 0, charges: 0, ppn: 0, subtotal: 0, paid: { count: 0, subtotal: 0 }, outstanding: { count: 0, subtotal: 0 }, byInvoice: {} };

function fmtMoney(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

const isoDay = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const sixMonthsAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 5, 1);
  return isoDay(d);
};

export default function AnalyticsPage() {
  const { notify } = useToast();
  // Badge "pajak menunggu sinkron" (outbox lokal) — angka halaman dari server.
  const { pendingUuids } = useFinanceTax({ notify });
  const { theme } = useTheme();
  const dark = theme === 'dark';

  // Default 6 bulan terakhir agar tren langsung bermakna.
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rangeOfMonth = (ym) => {
    if (!ym) return { from: '', to: '' };
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const p = (n) => String(n).padStart(2, '0');
    return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${last}` };
  };
  const [filters, , resetFilterValues, setManyFilters] = useFilters({
    month: '', from: sixMonthsAgo(), to: isoDay(new Date()),
  });
  const { month, from, to } = filters;
  const applyMonth = (ym) => {
    const r = rangeOfMonth(ym);
    setManyFilters({ month: ym, from: r.from, to: r.to });
  };

  // Overview agregasi dari backend (ganti hitung client-side).
  // Rentang tak valid tidak menembak request yang pasti 422.
  const rangeError = analyticsRangeError(from, to);
  const invalidRange = !!rangeError;
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const ovSeq = useRef(0);
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
    fetchAnalyticsOverview({ from, to }).then(
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
  }, [from, to, rangeError]);

  const summary = useMemo(() => {
    if (!overview) return EMPTY_SUMMARY;
    const k = overview.kpis || {};
    return {
      count: k.count || 0,
      charges: k.charges || 0,
      ppn: k.ppn || 0,
      subtotal: k.subtotal || 0,
      paid: k.paid || { count: 0, subtotal: 0 },
      outstanding: k.outstanding || { count: 0, subtotal: 0 },
      byInvoice: overview.byInvoice || {},
    };
  }, [overview]);
  const trend = overview?.trend || [];
  const byBrand = overview?.byBrand || [];
  const byModule = overview?.byModule || [];

  const periodeLabel = from || to ? `${from || 'Awal'} s.d. ${to || 'Akhir'}` : 'Semua tanggal';  const todayLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const paidShare = summary.subtotal > 0 ? Math.round((summary.paid.subtotal / summary.subtotal) * 100) : 0;

  // Tabel detail dari backend (server-side cari + paginasi + drill-down).
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [dim, setDim] = useState(''); // '' | 'brand' | 'module'
  const [dimKey, setDimKey] = useState('');

  // Debounce pencarian agar tidak request per ketikan.
  const [debQ, setDebQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debQ, from, to, perPage, dim, dimKey]);

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
    fetchAnalyticsDrilldown({ dim, key: dimKey, from, to, q: debQ, page, limit: perPage }).then(
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
  }, [dim, dimKey, from, to, debQ, page, perPage, rangeError]);

  const rows = useMemo(
    () => filterOnCallRows(drill.data || [])
      .map((c) => ({ ...c, invStatus: c.invoiceStatus || 'MENUNGGU INVOICE' })),
    [drill]
  );
  const paged = rows;
  const detailTotal = drill.subtotal || 0;
  const detailCount = drill.total || 0;
  const totalPages = drill.totalPages || 1;
  const safePage = Math.min(page, totalPages);
  const tableLoading = drLoading;
  const tableError = drError;
  const pageNums = (() => {
    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  })();

  const kpis = [
    { t: 'Subtotal Akhir', v: fmtMoney(summary.subtotal), sub: `${summary.count} kasus tervalidasi`, color: 'text-emerald-600', darkColor: 'dark:text-emerald-400', up: true },
    { t: 'Sudah Dibayar', v: fmtMoney(summary.paid.subtotal), sub: `${paidShare}% dari subtotal`, color: 'text-brand-600', darkColor: 'dark:text-brand-300', up: true },
    { t: 'Outstanding', v: fmtMoney(summary.outstanding.subtotal), sub: `${summary.outstanding.count} kasus belum dibayar`, color: 'text-rose-600', darkColor: 'dark:text-rose-400', up: false },
    { t: 'Total PPN', v: fmtMoney(summary.ppn), sub: `dari charges ${fmtMoney(summary.charges)}`, color: 'text-amber-600', darkColor: 'dark:text-amber-400', up: true },
  ];

  const sliceBorder = dark ? '#0f172a' : '#ffffff';
  const legendColor = dark ? '#94a3b8' : '#111111';
  const barGrid = dark ? '#1e293b' : '#f1f5f9';
  const barTick = '#94a3b8';
  const axisLine = dark ? '#334155' : '#111111';
  const tooltipDark = {
    backgroundColor: '#111111',
    padding: 10,
    cornerRadius: 0,
    titleFont: { family: 'monospace', weight: '700', size: 11 },
    bodyFont: { family: 'monospace', size: 11 },
    displayColors: false,
  };

  const trendData = {
    labels: trend.map((t) => t.label),
    datasets: [
      {
        label: 'Subtotal (Rp)',
        data: trend.map((t) => t.subtotal),
        borderColor: '#059669',
        backgroundColor: dark ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#059669',
        borderWidth: 2.5,
      },
      {
        label: 'Charges (Rp)',
        data: trend.map((t) => t.charges),
        borderColor: '#94a3b8',
        borderDash: [6, 4],
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1.5,
      },
    ],
  };

  const invOrder = ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'DIKIRIM', 'PAID'];
  const invKeys = [
    ...invOrder.filter((k) => summary.byInvoice[k]),
    ...Object.keys(summary.byInvoice).filter((k) => !invOrder.includes(k)),
  ];
  const invPalette = { 'MENUNGGU INVOICE': '#f59e0b', 'INVOICE TERBIT': '#8b5cf6', DIKIRIM: '#0ea5e9', PAID: '#10b981' };
  const distData = {
    labels: invKeys,
    datasets: [{
      data: invKeys.map((k) => summary.byInvoice[k].count),
      backgroundColor: invKeys.map((k, i) => invPalette[k] || ['#64748b', '#f43f5e', '#06b6d4'][i % 3]),
      hoverOffset: 6,
      borderWidth: 3,
      borderColor: sliceBorder,
      spacing: 2,
    }],
  };

  const filterCls =
    'mt-1 block min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 transition';

  return (
    <div className="page">
      <div className="print-kop" aria-hidden="true">
        <h1>Analitik — Kasus Tervalidasi</h1>
        <p>Periode: {periodeLabel} · Dicetak: {todayLabel}</p>
      </div>

      {/* ===== HERO ===== */}
      <Reveal className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1e1b4b] via-[#4a4fe9] to-[#7c3aed] text-white shadow-2xl shadow-brand-600/25">
        <div aria-hidden="true" className="absolute -right-24 -top-24 w-96 h-96 bg-white/15 rounded-full blur-3xl" />
        <div aria-hidden="true" className="absolute -left-16 -bottom-28 w-80 h-80 bg-violet-300/20 rounded-full blur-3xl" />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] bg-white/15 border border-white/20 rounded-full px-3 py-1">
              [ ANALYTICS /// TREND ]
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white/10 border border-white/15 rounded-full px-3 py-1">
              Periode: {periodeLabel}
            </span>
            {(pendingUuids || []).length > 0 && (
              <span className="no-print inline-flex items-center gap-1.5 text-[11px] font-semibold bg-amber-400/20 border border-amber-200/30 rounded-full px-3 py-1">
                {(pendingUuids || []).length} pajak menunggu sinkron
              </span>
            )}
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
            Analitik
          </h1>
          <p className="mt-2 text-sm text-white/90 max-w-2xl leading-relaxed">
            Tren subtotal per bulan dari <span className="font-bold">{summary.count} kasus</span> tervalidasi ·
            kolektibilitas <span className="font-bold tabular-nums">{paidShare}%</span> ·
            outstanding <span className="font-bold tabular-nums">{fmtMoney(summary.outstanding.subtotal)}</span>.
          </p>
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
            onClick={() => setManyFilters({ month: '', from: sixMonthsAgo(), to: isoDay(new Date()) })}
            className="text-[13px] hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 dark:hover:bg-brand-500/10"
          >
            6 Bulan Terakhir
          </Button>
          <Button
            variant="secondary"
            onClick={() => resetFilterValues()}
            className="text-[13px] hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10"
          >
            Reset
          </Button>
          <div>
            <FilterLabel>Drill-down Brand</FilterLabel>
            <select
              value={dim === 'brand' ? dimKey : ''}
              onChange={(e) => { setDim(e.target.value ? 'brand' : ''); setDimKey(e.target.value); }}
              className={filterCls}
            >
              <option value="">Semua brand</option>
              {byBrand.map((b) => (
                <option key={b.brand} value={b.brand}>{b.brand} · {b.count}</option>
              ))}
            </select>
          </div>
          <div>
            <FilterLabel>Drill-down Module</FilterLabel>
            <select
              value={dim === 'module' ? dimKey : ''}
              onChange={(e) => { setDim(e.target.value ? 'module' : ''); setDimKey(e.target.value); }}
              className={filterCls}
            >
              <option value="">Semua module</option>
              {byModule.map((b) => (
                <option key={b.module} value={b.module}>{b.module} · {b.count}</option>
              ))}
            </select>
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

      {/* ===== Chart besar + kolom samping ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Reveal className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 p-6 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">Tren Subtotal per Bulan</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Charges vs subtotal (charges + PPN), kasus tervalidasi</p>
            </div>
            <span className="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-full px-2.5 py-1 whitespace-nowrap tabular-nums">
              {trend.length} bulan
            </span>
          </div>
          <div className="h-72">
            {loading ? (
              <table className="w-full text-sm"><tbody><LoadingRow colSpan={1} /></tbody></table>
            ) : (
              <Line
                data={trendData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 8, boxHeight: 8, padding: 12, font: { size: 11, weight: 600 }, color: legendColor } },
                    tooltip: { ...tooltipDark, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}` } },
                  },
                  scales: {
                    x: { grid: { display: false }, border: { display: true, color: axisLine }, ticks: { color: barTick, font: { size: 11, weight: 700 } } },
                    y: { beginAtZero: true, grid: { color: barGrid }, border: { display: true, color: axisLine }, ticks: { color: barTick, font: { size: 10 }, maxTicksLimit: 5, callback: (v) => fmtMoney(v) } },
                  },
                }}
              />
            )}
          </div>
        </Reveal>

        <div className="flex flex-col gap-4">
          <Reveal className="p-6 rounded-3xl bg-slate-900 text-white flex flex-col justify-between shadow-lg dark:bg-slate-900 dark:border dark:border-slate-700">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">
                Kolektibilitas
              </p>
              <h4 className="text-xl font-bold tracking-tight">
                Sudah Dibayar
              </h4>
            </div>
            <div className="mt-8">
              <div className="flex justify-between items-end mb-2">
                <span className="text-3xl font-semibold tracking-tighter tabular-nums">{paidShare}%</span>
                <span className="text-xs font-medium text-slate-400 mb-1 tabular-nums">{fmtMoney(summary.paid.subtotal)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={paidShare} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${paidShare}%` }} />
              </div>
            </div>
          </Reveal>

          <Reveal className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
            <h4 className="font-bold text-slate-900 dark:text-white">Perlu Perhatian</h4>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Outstanding <span className="text-slate-900 dark:text-white font-semibold tabular-nums">{fmtMoney(summary.outstanding.subtotal)}</span>{' '}
              dari <span className="text-slate-900 dark:text-white font-semibold">{summary.outstanding.count} kasus</span>{' '}
              belum dibayar pada periode ini.
            </p>
          </Reveal>
        </div>
      </div>

      {/* ===== KPI row ===== */}
      <Reveal className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((d) => (
          <div
            key={d.t}
            className={`p-6 rounded-3xl border bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800 transition-colors shadow-[0_1px_2px_rgba(16,24,40,.05)] ${
              d.up
                ? 'hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/5'
                : 'hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/5'
            }`}
          >
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.12em] mb-2">{d.t}</p>
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums ${d.color} ${d.darkColor || ''}`}>{d.v}</p>
            </div>
            <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{d.sub}</p>
          </div>
        ))}
      </Reveal>

      {/* ===== Distribusi status invoice ===== */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 p-6 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">Distribusi Status Invoice</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jumlah kasus tervalidasi per status</p>
          </div>
          <span className="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-full px-2.5 py-1 whitespace-nowrap tabular-nums">
            {summary.count} kasus
          </span>
        </div>
        <div className="h-64 max-w-xl mx-auto">
          <Doughnut
            data={distData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 8, boxHeight: 8, padding: 12, font: { size: 11, weight: 600 }, color: legendColor } },
                tooltip: tooltipDark,
              },
            }}
          />
        </div>
      </Reveal>

      {/* ===== Detail lengkap kasus tervalidasi (per baris) ===== */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,.05),0_12px_32px_-16px_rgba(16,24,40,.15)]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-800/60 dark:to-slate-900">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Detail Kasus Tervalidasi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tableLoading ? 'Memuat dari backend…' : `${detailCount} kasus${dimKey ? ` · ${dim === 'brand' ? 'Brand' : 'Module'} ${dimKey}` : ''} · total subtotal ${fmtMoney(detailTotal)}`}
              </p>
            </div>
            <div className="ml-auto relative no-print">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Cari no / brand / issue / PIC…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 pr-3 py-2.5 min-h-[44px] w-full sm:w-auto text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[1280px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/70">
                <th className="px-6 py-3 font-bold">No</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Tanggal</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Brand</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">PIC</th>
                <th className="px-4 py-3 font-bold min-w-[220px]">Issue</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Module</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Billing Status</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Billing Category</th>
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
                <tr key={c.recordUuid} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-brand-50/50 dark:hover:bg-slate-800 transition">
                  <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 tabular-nums">{c.no || '-'}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap tabular-nums">{fmtDate8(c.dateIssue)}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{c.client || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.picName || c.assignTo || '-'}</td>
                  <td className="px-4 py-3.5 max-w-[320px]">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{c.issue || '-'}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Pill tone={moduleTone(c.module)}>{c.module || '-'}</Pill>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Pill dot tone={billingTone(c.billingStatus)}>{c.billingStatus || '-'}</Pill>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2.5 py-1 whitespace-nowrap">{c.billingCategory || '-'}</span>
                  </td>
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
                <LoadingRow colSpan={15} />
              ) : invalidRange ? (
                <EmptyRow colSpan={15}>Rentang tanggal tidak valid (Date From melebihi Date Until)</EmptyRow>
              ) : detailCount === 0 && (
                <EmptyRow colSpan={15}>Tidak ada data tervalidasi pada periode ini</EmptyRow>
              )}
            </tbody>
          </table>
        </div>
        {/* Varian kartu untuk HP */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {paged.map((c) => (
            <div key={c.recordUuid} className="px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{c.client || '-'} <span className="font-medium text-slate-400">#{c.no || '-'}</span></p>
                <Pill dot tone={invoiceTone(c.invStatus)}>{invLabel(c.invStatus)}</Pill>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{c.issue || '-'}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{fmtDate8(c.dateIssue)} · {c.picName || '-'} · {c.billingStatus || '-'}{c.pph ? ' · PPH23' : ''}</p>
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
