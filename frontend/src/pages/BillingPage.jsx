import { useEffect, useMemo, useState } from 'react';
import { Doughnut, Bar, Pie } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { fmtDate8 } from '../utils/format.js';
import { useAuditState, DEFAULT_ACTIONS } from '../hooks/useAuditState.js';
import { recordActivity } from '../lib/activity.js';
import CaseDetailModal from '../components/CaseDetailModal.jsx';

const BILL_BADGE = {
  FREE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  'ON-CALL': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  MONTHLY: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
};

// Ukuran angka menyesuaikan panjang nominal penuh (22px normal, mengecil bila miliaran)
const moneySize = (v) => {
  const len = String(v ?? '').length;
  if (len > 16) return 'text-[17px]';
  if (len > 13) return 'text-[20px]';
  return 'text-[22px]';
};

// Teks panjang (Issue/Notes): 2 baris + tombol "Selengkapnya" untuk buka penuh per baris
function ExpandableText({ text }) {
  const [open, setOpen] = useState(false);
  const value = text || '-';
  return (
    <div className="min-w-[220px] max-w-[360px]">
      <p className={`text-xs text-slate-600 dark:text-slate-300 ${open ? 'whitespace-normal break-words' : 'line-clamp-2'}`}>
        {value}
      </p>
      {value.length > 120 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 hover:underline"
        >
          {open ? 'Tutup' : 'Selengkapnya'}
        </button>
      )}
    </div>
  );
}

export default function BillingPage() {
  const { auditActions, caseAuditStatus, defaultAuditStatus, updateAudit, addAction, removeAction, renameAuditAction } = useAuditState();
  const { cases: allCases, loading } = useCases();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [brand, setBrand] = useState('');
  const [cat, setCat] = useState('ON-CALL');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [masterOpen, setMasterOpen] = useState(false);
  const [newAction, setNewAction] = useState('');
  const [detailUuid, setDetailUuid] = useState(null);
  const [editingAction, setEditingAction] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');

  // Palet chart mengikuti tema (terang/gelap)
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const sliceBorder = dark ? '#0f172a' : '#ffffff';
  const legendColor = dark ? '#94a3b8' : '#111111';
  const barGrid = dark ? '#1e293b' : '#f1f5f9';
  const barTick = '#94a3b8';
  const axisLine = dark ? '#334155' : '#111111';
  const detailCase = allCases.find((x) => x.recordUuid === detailUuid) || null;

  const brands = useMemo(
    () => [...new Set(allCases.map((c) => c.client).filter(Boolean))].sort(),
    [allCases]
  );

  const filtered = useMemo(() => {
    const f = from.replace(/-/g, '');
    const t = to.replace(/-/g, '');
    return allCases.filter(
      (c) =>
        (!f || c.dateIssue >= f) &&
        (!t || c.dateIssue <= t) &&
        (!brand || c.client === brand)
    );
  }, [from, to, brand, allCases]);

  const CATS = ['ON-CALL', 'MONTHLY', 'FREE'];

  const catStats = useMemo(() => {
    const m = {
      'ON-CALL': { count: 0, amount: 0 },
      MONTHLY: { count: 0, amount: 0 },
      FREE: { count: 0, amount: 0 },
    };
    filtered.forEach((c) => {
      const s = m[c.billingStatus];
      if (s) {
        s.count += 1;
        s.amount += +c.charges || 0;
      }
    });
    return m;
  }, [filtered]);

  const catItems = useMemo(
    () => filtered.filter((c) => c.billingStatus === cat),
    [filtered, cat]
  );

  const stats = useMemo(() => {
    const free = filtered.filter((c) => c.billingStatus === 'FREE');
    const oncall = filtered.filter((c) => c.billingStatus === 'ON-CALL');
    const monthly = filtered.filter((c) => c.billingStatus === 'MONTHLY');
    const paidCases = oncall.concat(monthly);
    const auditCounts = {};
    auditActions.forEach((a) => (auditCounts[a] = 0));
    paidCases.forEach((c) => {
      const a = caseAuditStatus[c.recordUuid] || defaultAuditStatus;
      auditCounts[a] = (auditCounts[a] || 0) + 1;
    });
    return {
      free: { count: free.length, amount: 0 },
      oncall: { count: oncall.length, amount: oncall.reduce((a, c) => a + (+c.charges || 0), 0) },
      monthly: { count: monthly.length, amount: monthly.reduce((a, c) => a + (+c.charges || 0), 0) },
      totalAmount:
        oncall.reduce((a, c) => a + (+c.charges || 0), 0) + monthly.reduce((a, c) => a + (+c.charges || 0), 0),
      auditCounts,
    };
  }, [filtered, auditActions, caseAuditStatus]);

  const kpi = [
    { t: 'Total Kasus', v: filtered.length.toLocaleString('id-ID'), sub: 'dalam periode', color: 'text-brand-600', accent: 'from-brand-500 to-violet-500', icon: 'cases' },
    { t: 'Total Tagihan', v: fmtMoney(stats.totalAmount), sub: 'ON-CALL + MONTHLY', color: 'text-emerald-600', accent: 'from-emerald-400 to-teal-600', icon: 'money', money: true },
    { t: 'ON-CALL', v: fmtMoney(stats.oncall.amount), sub: `${stats.oncall.count} kasus`, color: 'text-amber-600', accent: 'from-amber-400 to-orange-500', icon: 'phone', money: true },
    { t: 'MONTHLY', v: fmtMoney(stats.monthly.amount), sub: `${stats.monthly.count} kasus`, color: 'text-sky-600', accent: 'from-sky-400 to-blue-600', icon: 'cal', money: true },
    {
      t: 'Valid — Siap Invoice',
      v: (stats.auditCounts['VALID - SIAP INVOICE'] || 0).toLocaleString('id-ID'),
      sub: `${stats.auditCounts['PERLU DICEK ULANG'] || 0} kasus perlu dicek ulang`,
      color: 'text-emerald-600',
      accent: 'from-emerald-400 to-teal-600',
      icon: 'check',
    },
  ];

  const distData = {
    labels: ['ON-CALL', 'MONTHLY', 'FREE'],
    datasets: [{
      data: [stats.oncall.count, stats.monthly.count, stats.free.count],
      backgroundColor: ['#f59e0b', '#0ea5e9', '#10b981'],
      hoverOffset: 6,
      borderWidth: 3,
      borderColor: sliceBorder,
      spacing: 2,
    }],
  };
  const amountData = {
    labels: ['ON-CALL', 'MONTHLY', 'FREE'],
    datasets: [{
      label: 'Tagihan (Rp)',
      data: [stats.oncall.amount, stats.monthly.amount, stats.free.amount],
      backgroundColor: ['#f59e0b', '#0ea5e9', '#10b981'],
      hoverBackgroundColor: '#111111',
      borderRadius: 8,
      maxBarThickness: 64,
    }],
  };
  const auditData = {
    labels: auditActions,
    datasets: [{
      data: auditActions.map((a) => stats.auditCounts[a] || 0),
      backgroundColor: ['#94a3b8', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4'],
      hoverOffset: 6,
      borderWidth: 3,
      borderColor: sliceBorder,
      spacing: 2,
    }],
  };

  const tooltipDark = {
    backgroundColor: '#111111',
    padding: 10,
    cornerRadius: 0,
    titleFont: { family: 'monospace', weight: '700', size: 11 },
    bodyFont: { family: 'monospace', size: 11 },
    displayColors: false,
  };

  const legendBottom = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 8, boxHeight: 8, padding: 12, font: { size: 11, weight: 600 }, color: legendColor } },
      tooltip: tooltipDark,
    },
  };
  const legendRight = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 8, boxHeight: 8, padding: 10, font: { size: 10, weight: 600 }, color: legendColor } },
      tooltip: tooltipDark,
    },
  };

  const items = catItems.filter((c) =>
    `${c.client} ${c.issue} ${c.billingCategory} ${c.picName}`.toLowerCase().includes(q.toLowerCase())
  );
  const grandTotal = items.reduce((a, c) => a + (+c.charges || 0), 0);

  useEffect(() => {
    setPage(1);
  }, [cat, q, from, to, brand, perPage]);

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = items.slice((safePage - 1) * perPage, safePage * perPage);
  const pageNums = (() => {
    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  })();

  function handleAudit(uuid, action) {
    const c = allCases.find((x) => x.recordUuid === uuid);
    updateAudit(uuid, action);
    const label = c ? `kasus #${c.no} (${c.client})` : `kasus ${String(uuid).slice(0, 8)}`;
    recordActivity(`mengubah status validasi ${label}`, `menjadi ${action}`, 'Validasi');
  }

  function exportData() {
    const headers = ['NO', 'DATE ISSUE', 'CLIENT', 'ISSUE', 'PIC NAME', 'MODULE', 'BILLING STATUS', 'BILLING CATEGORY', 'SUPPORT TYPE', 'CHARGES', 'STATUS VALIDASI', 'COMPLETION NOTES', 'RECORD_UUID'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...catItems.map((c) =>
        [
          c.no, c.dateIssue, c.client, c.issue, c.picName, c.module, c.billingStatus, c.billingCategory,
          c.supportType, c.charges, caseAuditStatus[c.recordUuid] || '', c.completionNotes, c.recordUuid,
        ]
          .map(esc)
          .join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-audit-${cat.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const CAT_META = {
    'ON-CALL': {
      gradient: 'from-amber-500 to-orange-500',
      softIcon: 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />,
    },
    MONTHLY: {
      gradient: 'from-sky-500 to-blue-600',
      softIcon: 'bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
    },
    FREE: {
      gradient: 'from-emerald-500 to-teal-600',
      softIcon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
    },
  };

  const filterCls =
    'mt-1 block text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 transition';

  // Tema hero mengikuti tab kategori aktif (crossfade via tumpukan layer).
  const HERO_THEME = {
    'ON-CALL': {
      layers: 'from-[#92400e] via-[#f59e0b] to-[#fbbf24]',
      shadow: 'shadow-amber-600/25',
      btnText: 'text-amber-700',
      btnHover: 'hover:bg-amber-50',
      iconBg: 'bg-amber-500',
    },
    MONTHLY: {
      layers: 'from-[#0c4a6e] via-[#0284c7] to-[#38bdf8]',
      shadow: 'shadow-sky-600/25',
      btnText: 'text-sky-700',
      btnHover: 'hover:bg-sky-50',
      iconBg: 'bg-sky-500',
    },
    FREE: {
      layers: 'from-[#064e3b] via-[#059669] to-[#34d399]',
      shadow: 'shadow-emerald-600/25',
      btnText: 'text-emerald-700',
      btnHover: 'hover:bg-emerald-50',
      iconBg: 'bg-emerald-500',
    },
  };
  const heroTheme = HERO_THEME[cat] || HERO_THEME['ON-CALL'];

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5">
      {/* ===== HERO (warna mengikuti kategori aktif) ===== */}
      <section className={`relative overflow-hidden rounded-[28px] text-white shadow-2xl ${heroTheme.shadow} animate-fade-in-fast`}>
        {Object.entries(HERO_THEME).map(([key, t]) => (
          <div
            key={key}
            aria-hidden="true"
            className={`absolute inset-0 bg-gradient-to-br ${t.layers} transition-opacity duration-700 ease-in-out motion-reduce:transition-none ${key === cat ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        <div aria-hidden="true" className="absolute inset-0 opacity-[.14]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div aria-hidden="true" className="absolute -right-24 -top-24 w-96 h-96 bg-white/20 rounded-full blur-3xl" />
        <div aria-hidden="true" className="absolute -left-16 -bottom-28 w-80 h-80 bg-black/10 rounded-full blur-3xl" />
        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] bg-white/15 border border-white/20 backdrop-blur rounded-full px-3 py-1">
                [ BILLING /// VALIDASI ]
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white/10 border border-white/15 rounded-full px-3 py-1">
                {filtered.length} kasus dalam periode
              </span>
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              Billing & Audit
            </h1>
            <p className="mt-2 text-sm text-white/80 max-w-xl leading-relaxed">
              Total tagihan <span className="font-bold text-white tabular-nums">{fmtMoney(stats.totalAmount)}</span> ·{' '}
              {stats.auditCounts['VALID - SIAP INVOICE'] || 0} valid siap invoice ·{' '}
              {stats.auditCounts['PERLU DICEK ULANG'] || 0} perlu dicek ulang.
            </p>
          </div>
          <div className="flex flex-wrap lg:flex-col gap-2.5 shrink-0">
            <button
              onClick={() => setMasterOpen(true)}
              className={`inline-flex items-center justify-center gap-2 bg-white ${heroTheme.btnText} ${heroTheme.btnHover} text-sm font-extrabold px-4 py-3 rounded-2xl shadow-lg transition-colors duration-500 motion-reduce:transition-none active:scale-[.98]`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Master Status Validasi
            </button>
            <button
              onClick={exportData}
              className="inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white/90 bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2.5 rounded-2xl transition active:scale-[.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {kpi.map((d, i) => (
          <div key={d.t} className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 p-5 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:shadow-xl hover:-translate-y-1 hover:border-transparent transition-all duration-300 animate-fade-in-fast" style={{ animationDelay: `${0.06 + i * 0.04}s` }}>
            <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${d.accent}`} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em] truncate">{d.t}</p>
                <p className={`mt-2 ${d.money ? moneySize(d.v) : 'text-[28px]'} leading-tight font-extrabold tracking-tight tabular-nums ${d.color} dark:brightness-125`}>{d.v}</p>
                <p className="mt-1.5 text-xs font-medium text-slate-400 truncate">{d.sub}</p>
              </div>
              <span className={`w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br ${d.accent} text-white flex items-center justify-center shadow-lg`}>
                <KpiIcon name={d.icon} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartPanel title="Distribusi Billing" desc="Jumlah kasus per kategori billing" accent="from-amber-400 to-orange-500" badge={`${filtered.length} kasus`}>
          <Doughnut data={distData} options={legendBottom} />
        </ChartPanel>
        <ChartPanel title="Total Tagihan per Kategori" desc="Dalam Rupiah penuh" accent="from-emerald-400 to-teal-600" badge={fmtMoney(stats.totalAmount)}>
          <Bar
            data={amountData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { ...tooltipDark, callbacks: { label: (ctx) => ' ' + fmtMoney(ctx.parsed.y) } },
              },
              scales: {
                x: { grid: { display: false }, border: { display: true, color: axisLine }, ticks: { color: barTick, font: { size: 11, weight: 700 } } },
                y: { beginAtZero: true, grid: { color: barGrid }, border: { display: true, color: axisLine }, ticks: { color: barTick, font: { size: 10 }, maxTicksLimit: 5, callback: (v) => fmtMoney(v) } },
              },
            }}
          />
        </ChartPanel>
        <ChartPanel title="Distribusi Status Validasi" desc="Status validasi kasus berbayar" accent="from-brand-500 to-violet-500" badge={`${stats.auditCounts['VALID - SIAP INVOICE'] || 0} valid`}>
          <Pie data={auditData} options={legendRight} />
        </ChartPanel>
      </div>

      {/* Tab Kategori Billing */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-4 sm:p-5 animate-fade-in-fast" style={{ animationDelay: '.2s' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Kategori Billing</h3>
            <p className="text-xs text-slate-400">Pilih kategori untuk memfilter tabel di bawah</p>
          </div>
          <p className="text-xs text-slate-400 tabular-nums">
            Total <span className="font-extrabold text-slate-900 dark:text-white">{fmtMoney((catStats[cat] || {}).amount || 0)}</span>
            {' '}• {((catStats[cat] || {}).count || 0).toLocaleString('id-ID')} kasus {cat}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-1.5">
          {CATS.map((c) => {
            const active = cat === c;
            const meta = CAT_META[c];
            const s = catStats[c] || { count: 0, amount: 0 };
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-all duration-200 ${
                    active
                      ? `bg-gradient-to-r ${meta.gradient} text-white shadow-md`
                      : 'text-slate-500 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm'
                  }`}
              >
                <span className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${active ? 'bg-white/20' : meta.softIcon}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    {meta.icon}
                  </svg>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-extrabold tracking-wide">{c}</span>
                  <span className={`block text-[11px] font-medium truncate ${active ? 'text-white/85' : 'text-slate-400'}`}>
                    {s.count.toLocaleString('id-ID')} kasus • {fmtMoney(s.amount)}
                  </span>
                </span>
                {active && (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail Kasus */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,.05),0_12px_32px_-16px_rgba(16,24,40,.15)] animate-fade-in-fast" style={{ animationDelay: '.24s' }}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-800/60 dark:to-slate-900">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Date From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={filterCls} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Date Until</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={filterCls} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Brand</label>
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className={`${filterCls} min-w-[200px]`}>
                <option value="">Semua Brand</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                setFrom('');
                setTo('');
                setBrand('');
              }}
              className="text-[13px] font-bold text-slate-500 dark:text-slate-300 hover:text-rose-600 border border-slate-200 dark:border-slate-700 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-4 py-2.5 rounded-xl transition"
            >
              Reset
            </button>
            <div className="ml-auto text-xs text-slate-400">
              Periode:{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {from || to ? `${from || 'Awal'} s.d. ${to || 'Akhir'}` : 'Semua tanggal'}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <span className={`w-10 h-10 rounded-2xl ${heroTheme.iconBg} text-white flex items-center justify-center shadow-lg transition-colors duration-500 motion-reduce:transition-none`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </span>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Detail Kasus — {cat}</h3>
              <p className="text-xs text-slate-400">{items.length} kasus · total {fmtMoney(grandTotal)}</p>
            </div>
          </div>
          <div className="ml-auto relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Cari kasus..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 pr-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition"
            />
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[1240px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/70">
                <th className="px-6 py-3 font-bold" title="Nomor kasus">No</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap" title="Tanggal issue (tahun-bulan-tanggal)">Tgl Issue</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap" title="Nama brand / client">Brand</th>
                <th className="px-4 py-3 font-bold min-w-[220px]" title="Uraian masalah">Issue</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap" title="Nama PIC penanggung jawab">PIC Name</th>
                <th className="px-4 py-3 font-bold" title="Modul aplikasi">Module</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap" title="Status billing: ON-CALL / MONTHLY / FREE">Status Billing</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap" title="Kategori billing">Billing Category</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap" title="Jenis support">Support Type</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap" title="Biaya (Rupiah)">Charges</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap" title="Status validasi oleh tim billing">Status Validasi</th>
                <th className="px-6 py-3 font-bold" title="Catatan penyelesaian">Completion Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paged.map((c) => (
                <tr key={c.recordUuid} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-amber-50/50 dark:hover:bg-slate-800 transition">
                  <td className="px-6 py-3.5 text-slate-400 tabular-nums">{c.no || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-semibold whitespace-nowrap tabular-nums">{fmtDate8(c.dateIssue)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                        {String(c.client || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{c.client || '-'}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="min-w-[220px] max-w-[320px]">
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{c.issue || '-'}</p>
                      <button
                        type="button"
                        onClick={() => setDetailUuid(c.recordUuid)}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-600 dark:text-brand-300 hover:text-brand-700 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 border border-brand-100 dark:border-brand-500/20 rounded-lg px-2.5 py-1 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                        Lihat Detail
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.picName || c.assignTo || '-'}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-full px-2.5 py-1">{c.module || '-'}</span>
                    {c.subModule && <span className="mt-1 block text-[10px] text-slate-400 font-medium">{c.subModule}</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold border rounded-full px-2.5 py-1 whitespace-nowrap ${BILL_BADGE[c.billingStatus] || 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />{c.billingStatus || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.billingCategory || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.supportType || '-'}</td>
                  <td className={`px-4 py-3.5 text-right tabular-nums whitespace-nowrap ${+c.charges > 0 ? 'font-extrabold text-amber-700 dark:text-amber-400' : 'font-semibold text-slate-300 dark:text-slate-600'}`}>{fmtMoney(c.charges)}</td>
                  <td className="px-4 py-3.5">
                    {c.billingStatus === 'ON-CALL' ? (
                        (() => {
                          const current = caseAuditStatus[c.recordUuid] || defaultAuditStatus;
                          const idx = auditActions.indexOf(current);
                          const next = auditActions[(idx + 1) % auditActions.length] || current;
                          const isDefault = idx <= 0;
                          return (
                            <div className="flex flex-col items-start gap-1.5 min-w-[150px]">
                              <span
                                title={`Status saat ini: ${current}`}
                                 className={`text-[11px] font-bold border rounded-full px-2.5 py-1 whitespace-nowrap ${isDefault ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'}`}
                              >
                                {current}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAudit(c.recordUuid, next)}
                                title={`Sekali klik: ubah menjadi ${next}`}
                                aria-label={`Ubah status kasus #${c.no} menjadi ${next}`}
                                 className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-300 hover:text-white bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-600 border border-brand-200 dark:border-brand-500/20 hover:border-brand-600 rounded-lg px-2 py-1 transition max-w-full"
                              >
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" />
                                </svg>
                                <span className="truncate">{next}</span>
                              </button>
                            </div>
                          );
                        })()
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5"><ExpandableText text={c.completionNotes} /></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Tidak ada data {cat} yang cocok dengan filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs text-slate-400 bg-slate-50/60 dark:bg-slate-800/40">
          <span className="tabular-nums">
            Menampilkan {items.length === 0 ? 0 : (safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, items.length)} dari {items.length} data
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              ‹
            </button>
            {pageNums.map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`min-w-[32px] px-2 py-1.5 rounded-lg border font-bold transition ${
                  n === safePage
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              ›
            </button>
          </div>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-200"
          >
            <option value={10}>10 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
          </select>
          <span className="tabular-nums">{items.length} kasus · <span className="text-base font-extrabold text-slate-900 dark:text-white">Total: {fmtMoney(grandTotal)}</span></span>
        </div>
      </div>

      {/* Modal Master Status Validasi */}
      {masterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMasterOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-fast overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-50/80 to-white dark:from-slate-800 dark:to-slate-900">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Master Status Validasi</h3>
                <p className="text-xs text-slate-400">Kelola opsi status validasi</p>
              </div>
              <button onClick={() => setMasterOpen(false)} aria-label="Tutup" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4">
              <ul className="divide-y divide-slate-100">
                {auditActions.map((a) => {
                  const used = Object.values(caseAuditStatus).filter((s) => s === a).length;
                  const isEditing = editingAction === a;
                  return (
                    <li key={a} className="py-3 flex items-center justify-between gap-2">
                      {isEditing ? (
                        <form
                          className="flex-1 flex items-center gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (editBusy) return;
                            setEditErr('');
                            setEditBusy(true);
                            try {
                              const r = await renameAuditAction(a, editValue);
                              const finalName = r?.to || String(editValue).trim().toUpperCase();
                              recordActivity(
                                `mengubah nama status validasi "${a}" menjadi "${finalName}"`,
                                `${r?.migrated ?? 0} kasus dimigrasi`,
                                'Konfigurasi'
                              );
                              setEditingAction(null);
                              setEditValue('');
                            } catch (err) {
                              setEditErr(err?.message || 'Gagal menyimpan.');
                            } finally {
                              setEditBusy(false);
                            }
                          }}
                        >
                          <input
                            autoFocus
                            type="text"
                            value={editValue}
                            maxLength={40}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 min-w-0 text-sm font-bold border-2 border-amber-300 dark:border-amber-500/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 uppercase"
                          />
                          <button
                            type="submit"
                            disabled={editBusy}
                            className="shrink-0 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-3 py-1.5 rounded-lg transition"
                          >
                            {editBusy ? '…' : 'Simpan'}
                          </button>
                          <button
                            type="button"
                            disabled={editBusy}
                            onClick={() => { setEditingAction(null); setEditValue(''); setEditErr(''); }}
                            className="shrink-0 text-xs font-semibold text-slate-500 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition"
                          >
                            Batal
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="min-w-0">
                            <span className="block text-sm text-slate-700 dark:text-slate-200 font-bold truncate">{a}</span>
                            <span className="block text-[10px] text-slate-400 font-medium">
                              {DEFAULT_ACTIONS.includes(a) ? 'Default' : 'Kustom'} · dipakai {used} kasus
                            </span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => { setEditingAction(a); setEditValue(a); setEditErr(''); }}
                              title={`Ubah nama "${a}"`}
                              className="text-xs font-semibold text-brand-600 hover:bg-brand-50 px-2 py-1 rounded transition"
                            >
                              Edit
                            </button>
                            {DEFAULT_ACTIONS.includes(a) ? null : (
                              <button
                                onClick={() => {
                                  if (confirm(`Yakin hapus status "${a}"? ${used} kasus yang menggunakannya akan kembali ke status default.`)) {
                                    removeAction(a);
                                    recordActivity(`menghapus status validasi "${a}"`, 'kasus terkait kembali ke status default', 'Konfigurasi');
                                  }
                                }}
                                className="text-xs font-semibold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded transition"
                              >
                                Hapus
                              </button>
                            )}
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {editErr && <p className="mt-1 text-xs font-semibold text-rose-600">{editErr}</p>}
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = newAction.trim();
                  if (!val) return;
                  if (auditActions.includes(val)) {
                    alert('Action sudah ada');
                    return;
                  }
                  addAction(val);
                  recordActivity(`menambah status validasi baru "${val}"`, '', 'Konfigurasi');
                  setNewAction('');
                }}
              >
                <input
                  type="text"
                  placeholder="Status validasi baru..."
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                />
                <button className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 rounded-lg transition">Tambah</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Popup detail kasus dari kolom Issue */}
      <CaseDetailModal
        c={detailCase}
        kicker={`Detail Kasus #${detailCase?.no || '-'}`}
        title={detailCase?.client || '-'}
        chips={detailCase ? [
          { text: detailCase.module || '-', className: 'bg-white/15 border-white/20' },
          { text: detailCase.billingStatus || '-', className: BILL_BADGE[detailCase.billingStatus] || 'bg-white/15 border-white/20' },
          ...(detailCase.billingStatus !== 'FREE'
            ? [{ text: caseAuditStatus[detailCase.recordUuid] || defaultAuditStatus, className: 'bg-amber-300/90 text-amber-900 border-transparent' }]
            : []),
        ] : []}
        sections={detailCase ? [
          { title: 'Informasi Kasus', rows: [
            ['Tgl Issue', fmtDate8(detailCase.dateIssue)],
            ['Brand', detailCase.client || '-'],
            ['Channel', detailCase.channelTicket || '-'],
            ['PIC Name', detailCase.picName || detailCase.assignTo || '-'],
            ['Module', detailCase.module || '-'],
            ['Sub-Module', detailCase.subModule || '-'],
            ['Lokasi', detailCase.location || '-'],
          ]},
          { title: 'Billing & Validasi', rows: [
            ['Status Billing', detailCase.billingStatus || '-'],
            ['Kategori Billing', detailCase.billingCategory || '-'],
            ['Tipe Support', detailCase.supportType || '-'],
            ['Charges', fmtMoney(detailCase.charges)],
            ['Status Validasi', caseAuditStatus[detailCase.recordUuid] || 'BELUM DIVALIDASI'],
          ]},
        ] : []}
        notes={{ label: 'Completion Notes', text: detailCase?.completionNotes }}
        onClose={() => setDetailUuid(null)}
      />
    </div>
  );
}

function fmtMoney(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

const KPI_PATHS = {
  cases: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155',
  money: 'M2.25 18.75a60.07 60.07 0 0115.365-2.105c.993.392 1.397 1.44 1.397 2.105v.001M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z',
  phone: 'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z',
  cal: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  check: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

function KpiIcon({ name }) {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={KPI_PATHS[name] || ''} />
    </svg>
  );
}
function ChartPanel({ title, desc, children, accent = 'from-brand-500 to-violet-500', badge }) {
  return (
    <div className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05),0_12px_32px_-16px_rgba(16,24,40,.12)] animate-fade-in-fast">
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">{title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
          </div>
          {badge && (
            <span className="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-full px-2.5 py-1 whitespace-nowrap tabular-nums">{badge}</span>
          )}
        </div>
        <div className="h-64">{children}</div>
      </div>
    </div>
  );
}

function SummaryBox({ label, value, cls }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-extrabold ${cls}`}>{value}</p>
    </div>
  );
}
