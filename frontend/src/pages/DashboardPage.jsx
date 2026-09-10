import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { triggerSync, getSyncLogs, getHealth } from '../lib/api.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { useInvoiceState } from '../hooks/useInvoiceState.js';
import { useTheme } from '../context/ThemeContext.jsx';
import CaseDetailModal from '../components/CaseDetailModal.jsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

/* ================= Helpers ================= */
const fmtNum = (n) => (+n || 0).toLocaleString('id-ID');
const fmtRp = (n) => 'Rp ' + fmtNum(Math.round(+n || 0));
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
// Ukuran angka menyesuaikan panjang nominal penuh (22px normal, mengecil bila miliaran)
const moneySize = (n) => {
  const len = fmtRp(n).length;
  if (len > 16) return 'text-[17px]';
  if (len > 13) return 'text-[20px]';
  return 'text-[22px]';
};

function parseDate(ds) {
  const s = String(ds || '').replace(/\D/g, '').padStart(8, '0');
  if (s.length !== 8 || s === '00000000') return null;
  const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  if (!y || m < 1 || m > 12 || !d) return null;
  return new Date(y, m - 1, d);
}
const fmtDate = (ds) => {
  const dt = parseDate(ds);
  return dt ? `${dt.getDate()} ${MONTH_ID[dt.getMonth()]} ${dt.getFullYear()}` : '-';
};
const countBy = (arr, fn) => {
  const m = {};
  arr.forEach((c) => { const k = fn(c); if (k) m[k] = (m[k] || 0) + 1; });
  return m;
};
const topEntries = (obj, n) =>
  Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n || Infinity);

const BILL_BADGE = {
  FREE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  'ON-CALL': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  MONTHLY: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

/* ================= Page ================= */
export default function DashboardPage() {
  const { cases: allCases, loading, error, reload } = useCases();
  const { caseAuditStatus } = useAuditState();
  const { invoiceStatus } = useInvoiceState();
  const [spinning, setSpinning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => stampNow());
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [syncErr, setSyncErr] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [mockMode, setMockMode] = useState(false);
  const [detailUuid, setDetailUuid] = useState(null);

  // Palet chart mengikuti tema (terang/gelap)
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const gridOpt = { color: dark ? '#1e293b' : '#eef2f7' };
  const sliceBorder = dark ? '#0f172a' : '#ffffff';
  const legendColor = dark ? '#94a3b8' : '#64748b';
  const axisLabelColor = dark ? '#94a3b8' : '#334155';

  function stampNow() {
    const now = new Date();
    return (
      `${now.getDate()} ${MONTH_ID[now.getMonth()]} ${now.getFullYear()}, ` +
      `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
    );
  }
  function refresh() {
    setSpinning(true);
    reload().finally(() => {
      setSpinning(false);
      setLastUpdated(stampNow());
    });
  }

  const fmtSyncTime = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getDate()} ${MONTH_ID[d.getMonth()]} ${d.getFullYear()}, ` +
      `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // SATU tombol: 1) Sync Sheets (Spreadsheet → DB, upsert) lalu 2) Muat Terbaru (DB → layar)
  async function syncAndReload() {
    if (syncing) return;
    setSyncing(true);
    setSyncStage('sync');
    setSyncMsg('');
    setSyncErr(false);
    try {
      const r = await triggerSync();
      if (r && r.ok === false) throw new Error(r.error || 'Sinkron ditolak backend');
      const secs = r?.durationMs != null ? ` dalam ${(r.durationMs / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk` : '';
      setSyncStage('reload');
      await reload();
      setLastUpdated(stampNow());
      const logs = await getSyncLogs().catch(() => null);
      const latest = Array.isArray(logs) ? logs[0] : null;
      if (latest) setLastSync(fmtSyncTime(latest.finished_at || latest.started_at));
      if ((r?.rows ?? 0) === 0 && (r?.unchanged ?? 0) > 0) {
        setSyncMsg(`Sudah sinkron — tidak ada perubahan (${r.readRows} dibaca${secs})`);
      } else if ((r?.rows ?? 0) === 0 && (r?.readRows ?? 0) > 0) {
        setSyncMsg(`${r.readRows} baris dibaca, ${r.skippedRows ?? 0} dilewati — cek kolom recordUuid di Sheet`);
      } else if ((r?.rows ?? 0) === 0) {
        setSyncMsg('Tab terbaca tapi kosong — cek nama tab & isi Sheet');
      } else {
        const same = r?.unchanged ? ` (${r.unchanged} sudah sama, dilewati)` : '';
        setSyncMsg(`${(r?.rows ?? 0).toLocaleString('id-ID')} baris baru/berubah${secs}${same} • data dimuat ulang`);
      }
      setTimeout(() => setSyncMsg(''), 10000);
    } catch (e) {
      setSyncErr(true);
      setSyncMsg(e?.message || 'Gagal sinkron — coba lagi');
    } finally {
      setSyncing(false);
      setSyncStage('');
    }
  }

  // Info sinkron terakhir + status mode mock saat halaman dibuka
  useEffect(() => {
    let ignore = false;
    getHealth()
      .then((h) => {
        if (!ignore && h) setMockMode(!!h.sheetsMock);
      })
      .catch(() => {});
    getSyncLogs()
      .then((logs) => {
        if (ignore || !Array.isArray(logs) || !logs[0]) return;
        setLastSync(fmtSyncTime(logs[0].finished_at || logs[0].started_at));
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const stats = useMemo(() => {
    const CASES = allCases.map((c) => ({ ...c, charges: +c.charges || 0, _dt: parseDate(c.dateIssue) }));
    const TOTAL = CASES.length;

    const ymMap = {};
    CASES.forEach((c) => {
      if (!c._dt) return;
      const k = `${c._dt.getFullYear()}-${String(c._dt.getMonth() + 1).padStart(2, '0')}`;
      if (!ymMap[k]) ymMap[k] = { count: 0, charges: 0 };
      ymMap[k].count++;
      ymMap[k].charges += c.charges;
    });
    const ymKeys = Object.keys(ymMap).sort();
    const ymLabels = ymKeys.map((k) => MONTH_ID[+k.split('-')[1] - 1] + ' ' + k.split('-')[0].slice(2));
    const latestYM = ymKeys[ymKeys.length - 1];
    const prevYM = ymKeys[ymKeys.length - 2];
    const momGrowth =
      latestYM && prevYM && ymMap[prevYM].count > 0
        ? Math.round(((ymMap[latestYM].count - ymMap[prevYM].count) / ymMap[prevYM].count) * 100)
        : null;

    const billMap = countBy(CASES, (c) => (c.billingStatus || '').trim() || 'LAINNYA');
    const moduleMap = countBy(CASES, (c) => (c.module || '').trim());
    const chanMap = countBy(CASES, (c) => (c.channelTicket || '').trim());
    const clientMap = countBy(CASES, (c) => (c.client || '').trim());
    const teamMap = countBy(CASES, (c) => (c.assignTo || '').trim());
    const priceRefs = new Set(CASES.map((c) => (c.refPriceList || '').trim()).filter(Boolean)).size;

    const paidCases = CASES.filter((c) => c.charges > 0);
    const totalCharge = paidCases.reduce((s, c) => s + c.charges, 0);
    const uniqueClients = Object.keys(clientMap).length;

    const recent = [...CASES]
      .sort((a, b) => b._dt - a._dt || (+b.no || 0) - (+a.no || 0))
      .slice(0, 10);

    const teamEntries = topEntries(teamMap);
    const maxTeam = teamEntries.length ? teamEntries[0][1] : 1;
    const teamPerf = teamEntries.map(([name, count]) => ({
      name,
      count,
      charge: CASES.filter((c) => (c.assignTo || '').trim() === name).reduce((s, c) => s + c.charges, 0),
      pct: Math.round((count / maxTeam) * 100),
    }));

    return {
      CASES, TOTAL, ymMap, ymKeys, ymLabels, latestYM, prevYM, momGrowth, billMap, moduleMap, chanMap,
      clientMap, teamMap, priceRefs, paidCases, totalCharge, uniqueClients, recent, teamPerf,
    };
  }, [allCases]);

  const {
    TOTAL, ymMap, ymKeys, ymLabels, latestYM, momGrowth, billMap, moduleMap, chanMap,
    clientMap, priceRefs, paidCases, totalCharge, uniqueClients, recent, teamPerf,
  } = stats;

  /* ---- Chart datasets ---- */
  const trendData = {
    labels: ymLabels,
    datasets: [{
      label: 'Kasus',
      data: ymKeys.map((k) => ymMap[k].count),
      borderColor: '#4a4fe9',
      backgroundColor: (ctx) => {
        const { chart } = ctx;
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return 'rgba(74,79,233,.12)';
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, 'rgba(74,79,233,.28)');
        g.addColorStop(.6, 'rgba(74,79,233,.08)');
        g.addColorStop(1, 'rgba(74,79,233,0)');
        return g;
      },
      fill: true,
      tension: 0.45,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBackgroundColor: '#4a4fe9',
      pointBorderColor: sliceBorder,
      pointBorderWidth: 2,
      borderWidth: 2.5,
    }],
  };
  const BILL_COLORS = { FREE: '#10b981', 'ON-CALL': '#f59e0b', MONTHLY: '#0ea5e9', LAINNYA: '#cbd5e1' };
  const billEntries = topEntries(billMap);
  const billTotal = billEntries.reduce((s, e) => s + e[1], 0) || 1;
  const billingData = {
    labels: billEntries.map((e) => e[0]),
    datasets: [{
      data: billEntries.map((e) => e[1]),
      backgroundColor: billEntries.map((e) => BILL_COLORS[e[0]] || '#cbd5e1'),
      hoverOffset: 8,
      borderWidth: 3,
      borderColor: sliceBorder,
      spacing: 2,
    }],
  };
  const modEntries = topEntries(moduleMap, 6);
  const moduleData = {
    labels: modEntries.map((e) => e[0]),
    datasets: [{
      data: modEntries.map((e) => e[1]),
      backgroundColor: (ctx) => {
        const { chart } = ctx;
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return '#5f72f5';
        const g = c.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
        g.addColorStop(0, '#4a4fe9');
        g.addColorStop(1, '#8b5cf6');
        return g;
      },
      borderRadius: 8,
      maxBarThickness: 20,
    }],
  };
  const CHAN_COLORS = ['#4a4fe9', '#10b981', '#f59e0b', '#94a3b8', '#8b5cf6', '#06b6d4'];
  const chanEntries = topEntries(chanMap);
  const channelData = {
    labels: chanEntries.map((e) => e[0]),
    datasets: [{ data: chanEntries.map((e) => e[1]), backgroundColor: CHAN_COLORS, hoverOffset: 8, borderWidth: 3, borderColor: sliceBorder, spacing: 2 }],
  };
  const chargesData = {
    labels: ymLabels,
    datasets: [{
      label: 'Charges',
      data: ymKeys.map((k) => ymMap[k].charges),
      backgroundColor: (ctx) => {
        const { chart } = ctx;
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return '#f59e0b';
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, '#fbbf24');
        g.addColorStop(1, '#f59e0b');
        return g;
      },
      hoverBackgroundColor: '#d97706',
      borderRadius: 8,
      maxBarThickness: 24,
    }],
  };
  const clientEntries = topEntries(clientMap, 8);
  const clientData = {
    labels: clientEntries.map((e) => e[0]),
    datasets: [{
      data: clientEntries.map((e) => e[1]),
      backgroundColor: '#4a4fe9',
      hoverBackgroundColor: '#3d3ece',
      borderRadius: 8,
      maxBarThickness: 28,
    }],
  };

  // Outstanding: kasus tervalidasi (ON-CALL/MONTHLY) yang invoicenya belum PAID — sama seperti halaman Finance
  const outstanding = useMemo(() => {
    const pool = allCases.filter(
      (c) =>
        (c.billingStatus === 'ON-CALL' || c.billingStatus === 'MONTHLY') &&
        caseAuditStatus[c.recordUuid] === 'VALID - SIAP INVOICE' &&
        (invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE') !== 'PAID'
    );
    const byBrand = {};
    pool.forEach((c) => {
      const b = (c.client || '').trim() || '-';
      byBrand[b] = (byBrand[b] || 0) + (+c.charges || 0);
    });
    const top = topEntries(byBrand, 5);
    const amount = pool.reduce((s, c) => s + (+c.charges || 0), 0);
    return { count: pool.length, amount, top, max: top.length ? top[0][1] : 1 };
  }, [allCases, caseAuditStatus, invoiceStatus]);
  const outstandingData = {
    labels: outstanding.top.map((t) => t[0]),
    datasets: [{
      label: 'Outstanding (Rp)',
      data: outstanding.top.map((t) => t[1]),
      backgroundColor: (ctx) => {
        const { chart } = ctx;
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return '#f43f5e';
        const g = c.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
        g.addColorStop(0, '#fb7185');
        g.addColorStop(1, '#e11d48');
        return g;
      },
      borderRadius: 8,
      maxBarThickness: 20,
    }],
  };

  const baseTooltip = {
    backgroundColor: '#0f172a',
    padding: 12,
    cornerRadius: 12,
    titleFont: { weight: '700', size: 12 },
    bodyFont: { size: 12 },
    displayColors: false,
  };

  const noLegend = { plugins: { legend: { display: false }, tooltip: baseTooltip } };
  const doughnutOpt = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, borderRadius: 99, usePointStyle: true, pointStyle: 'circle', padding: 14, font: { weight: 600, size: 11 }, color: legendColor } },
      tooltip: baseTooltip,
    },
  };

  const FEATURES = [
    { title: 'Data Kasus', to: '/kasus', icon: 'cases', metric: fmtNum(TOTAL) + ' kasus', desc: uniqueClients + ' klien tercatat di Google Sheets', grad: 'from-indigo-500 to-violet-500', soft: 'bg-indigo-50 text-indigo-600' },
    { title: 'Form Kasus', to: '/form', icon: 'form', metric: fmtNum(latestYM ? ymMap[latestYM].count : 0) + ' kasus', desc: 'masuk pada bulan terakhir periode data', grad: 'from-sky-400 to-blue-600', soft: 'bg-sky-50 text-sky-600' },
    { title: 'Billing & Audit', to: '/billing', icon: 'billing', metric: fmtNum((billMap['ON-CALL'] || 0) + (billMap['MONTHLY'] || 0)) + ' tagihan', desc: 'ON-CALL: ' + fmtNum(billMap['ON-CALL'] || 0) + ' · MONTHLY: ' + fmtNum(billMap['MONTHLY'] || 0), grad: 'from-amber-400 to-orange-500', soft: 'bg-amber-50 text-amber-600' },
    { title: 'Finance Audit', to: '/finance', icon: 'finance', metric: fmtRp(totalCharge), desc: 'total nilai charges yang tercatat', grad: 'from-emerald-400 to-teal-600', soft: 'bg-emerald-50 text-emerald-600' },
    { title: 'Konfigurasi Sheet', to: '/cfg', icon: 'cfg', metric: priceRefs + ' paket', desc: 'referensi price list yang dipakai kasus', grad: 'from-violet-500 to-purple-600', soft: 'bg-violet-50 text-violet-600' },
    { title: 'HR Report', to: '/hrreport', icon: 'report', metric: Object.keys(moduleMap).length + ' modul', desc: Object.keys(teamPerf).length + ' petugas · ' + Object.keys(chanMap).length + ' channel aktif', grad: 'from-slate-500 to-slate-700', soft: 'bg-slate-100 text-slate-600' },
  ];

  const paidPct = TOTAL > 0 ? ((paidCases.length / TOTAL) * 100).toFixed(1) : '0.0';
  const detailCase = allCases.find((x) => x.recordUuid === detailUuid) || null;
  const TEAM_COLORS = ['from-indigo-500 to-violet-500', 'from-emerald-400 to-teal-500', 'from-amber-400 to-orange-500', 'from-sky-400 to-blue-500', 'from-fuchsia-400 to-purple-500'];

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5">
      {/* dekorasi latar */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 right-0 w-[420px] h-[420px] bg-gradient-to-br from-brand-200/50 to-violet-200/40 rounded-full blur-3xl" />
        <div className="absolute top-64 -left-24 w-[320px] h-[320px] bg-gradient-to-tr from-emerald-100/60 to-sky-100/50 rounded-full blur-3xl" />
      </div>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#2629b8] via-[#4a4fe9] to-[#7c3aed] text-white shadow-2xl shadow-brand-600/25 animate-fade-in-fast">
        {/* pola + glow */}
        <div aria-hidden="true" className="absolute inset-0 opacity-[.14]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div aria-hidden="true" className="absolute -right-24 -top-24 w-96 h-96 bg-white/15 rounded-full blur-3xl" />
        <div aria-hidden="true" className="absolute -left-16 -bottom-28 w-80 h-80 bg-emerald-300/20 rounded-full blur-3xl" />

        <div className="relative p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-center gap-8">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] bg-white/15 border border-white/20 backdrop-blur rounded-full pl-2 pr-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
                </span>
                Live · Google Sheets
              </span>
              {mockMode && (
                <span className="text-[11px] font-bold bg-amber-300/90 text-amber-950 rounded-full px-3 py-1">
                  Mode mock
                </span>
              )}
              {loading && (
                <span className="text-[11px] font-semibold bg-white/10 border border-white/15 rounded-full px-3 py-1 animate-pulse">
                  Memuat data…
                </span>
              )}
            </div>
            <h1 className="mt-4 text-2xl sm:text-3xl lg:text-[34px] font-extrabold tracking-tight leading-tight">
              {greeting()}, ini ringkasan operasionalmu.
            </h1>
            <p className="mt-2 text-sm sm:text-[15px] text-white/75 max-w-xl leading-relaxed">
              {fmtNum(TOTAL)} kasus dari {uniqueClients} klien · {fmtNum(paidCases.length)} berbayar · outstanding {fmtRp(outstanding.amount)}. Data diperbarui {lastUpdated}.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-[12px] font-semibold">
              <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 backdrop-blur rounded-xl px-3 py-2">
                <Dot /> {fmtNum(latestYM ? ymMap[latestYM].count : 0)} kasus bulan terakhir
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 backdrop-blur rounded-xl px-3 py-2">
                <Dot /> <span className="tabular-nums">{fmtRp(totalCharge)}</span>&nbsp;nilai billing
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 backdrop-blur rounded-xl px-3 py-2">
                <Dot /> {Object.keys(teamPerf).length} petugas aktif
              </span>
            </div>
          </div>

          {/* kartu aksi sinkron */}
          <div className="w-full lg:w-[340px] shrink-0">
            <div className="bg-white/[.12] border border-white/20 backdrop-blur-xl rounded-3xl p-5 shadow-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Sinkronisasi</p>
              <p className="mt-1 text-sm font-bold">{lastSync ? `Terakhir: ${lastSync}` : 'Belum pernah sinkron sesi ini'}</p>
              <div className="mt-4 grid grid-cols-1 gap-2.5">
                <button
                  onClick={syncAndReload}
                  disabled={syncing}
                  className="inline-flex items-center justify-center gap-2.5 bg-white text-brand-700 text-sm font-extrabold px-4 py-3 rounded-2xl shadow-lg hover:bg-brand-50 hover:shadow-xl transition active:scale-[.98] disabled:opacity-70 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  {!syncing ? 'Sinkron & Muat Ulang' : syncStage === 'sync' ? '1/2 Sinkron Sheets…' : '2/2 Memuat Data…'}
                </button>
                <button
                  onClick={refresh}
                  disabled={spinning || syncing}
                  className="inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white/90 bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2.5 rounded-2xl transition active:scale-[.98] disabled:opacity-60"
                >
                  <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Muat ulang tampilan
                </button>
              </div>
              {syncMsg && (
                <p className={`mt-3 text-[12px] font-semibold leading-relaxed rounded-xl px-3 py-2 border ${syncErr ? 'text-rose-100 bg-rose-500/20 border-rose-300/30' : 'text-emerald-100 bg-emerald-400/15 border-emerald-200/25'}`}>
                  {syncMsg}
                </p>
              )}
              {mockMode && !syncMsg && (
                <p className="mt-3 text-[11px] text-amber-100/90 font-medium">Mode mock: sync tidak membaca Google Sheet asli.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-white border border-rose-200 rounded-2xl px-5 py-3.5 text-[13px] text-rose-700 flex items-center justify-between shadow-sm animate-fade-in-fast">
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500" /> Backend tidak terjangkau ({error}).</span>
          <button onClick={refresh} className="font-bold hover:underline shrink-0 ml-4">Coba lagi</button>
        </div>
      )}

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard title="Total Kasus" value={fmtNum(TOTAL)} sub={`${uniqueClients} klien · ${Object.keys(moduleMap).length} modul`} icon="cases" grad="from-indigo-500 to-violet-600" glow="group-hover:shadow-indigo-500/25" delta={`${fmtNum(ymKeys.length)} bulan periode`} tone="text-indigo-600 bg-indigo-50 border-indigo-100" delay=".02s" />
        <StatCard title="Bulan Terakhir" value={fmtNum(latestYM ? ymMap[latestYM].count : 0)} sub={latestYM ? 'periode ' + ymLabels[ymLabels.length - 1] : '—'} icon="mockup" grad="from-sky-400 to-blue-600" glow="group-hover:shadow-sky-500/25" delta={momGrowth == null ? 'data awal' : `${momGrowth >= 0 ? '▲' : '▼'} ${Math.abs(momGrowth)}% MoM`} tone={momGrowth != null && momGrowth < 0 ? 'text-rose-600 bg-rose-50 border-rose-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100'} delay=".06s" />
        <StatCard title="Kasus Berbayar" value={fmtNum(paidCases.length)} valueCls="text-slate-900" sub={`${paidPct}% dari total kasus`} icon="billing" grad="from-amber-400 to-orange-500" glow="group-hover:shadow-amber-500/25" delta={`${fmtNum((billMap['ON-CALL'] || 0) + (billMap['MONTHLY'] || 0))} tagihan`} tone="text-amber-700 bg-amber-50 border-amber-100" delay=".1s" />
        <StatCard title="Nilai Billing" value={fmtRp(totalCharge)} valueSize={moneySize(totalCharge)} sub={`dari ${fmtNum(paidCases.length)} kasus berbayar`} icon="finance" grad="from-emerald-400 to-teal-600" glow="group-hover:shadow-emerald-500/25" delta="tercatat" tone="text-emerald-700 bg-emerald-50 border-emerald-100" delay=".14s" />
        <StatCard title="Outstanding" value={fmtRp(outstanding.amount)} valueSize={moneySize(outstanding.amount)} sub={`${fmtNum(outstanding.count)} kasus belum PAID`} icon="finance" grad="from-rose-400 to-rose-600" glow="group-hover:shadow-rose-500/25" delta="perlu ditagih" tone="text-rose-700 bg-rose-50 border-rose-100" delay=".18s" />
      </div>

      {/* ===== NAVIGASI CEPAT (strip ramping) ===== */}
      <nav aria-label="Navigasi cepat" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm animate-fade-in-fast" style={{ animationDelay: '.2s' }}>
        <div className="flex items-stretch gap-1 overflow-x-auto scrollbar-thin px-2 py-2">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              to={f.to}
              title={`${f.title} — ${f.desc}`}
              className="group flex min-w-[178px] flex-1 items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className={`w-9 h-9 shrink-0 rounded-lg ${f.soft} flex items-center justify-center`}>
                <FeatureIcon name={f.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] truncate">{f.title}</span>
                <span className="block text-[13px] font-extrabold text-slate-900 dark:text-white truncate">{f.metric}</span>
              </span>
              <svg className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>
      </nav>

      {/* ===== TREN + BILLING ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel className="xl:col-span-2" title="Tren Kasus per Bulan" desc="Jumlah kasus masuk berdasarkan tanggal issue" delay=".24s" accent="from-indigo-500 to-violet-500" badge={`${fmtNum(TOTAL)} total`}>
          <div className="h-64">
            <Line
              data={trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false }, tooltip: baseTooltip },
                scales: {
                  y: { beginAtZero: true, grid: gridOpt, border: { display: false }, ticks: { precision: 0, color: '#94a3b8', font: { size: 11, weight: 600 } } },
                  x: { grid: { display: false }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 11, weight: 600 } } },
                },
              }}
            />
          </div>
        </Panel>
        <Panel title="Status Billing" desc="Pembagian FREE / ON-CALL / MONTHLY" delay=".28s" accent="from-emerald-400 to-teal-500">
          <div className="relative h-64">
            <Doughnut data={billingData} options={doughnutOpt} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-10">
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{fmtNum(billTotal)}</p>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">kasus</p>
            </div>
          </div>
        </Panel>
      </div>

      {/* ===== MODUL + CHANNEL + CHARGES ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Kasus per Modul" desc="Modul terbanyak ditangani" delay=".3s" accent="from-violet-500 to-purple-600" badge={`Top ${modEntries.length}`}>
          <div className="h-64">
            <Bar
              data={moduleData}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                ...noLegend,
                scales: { x: { beginAtZero: true, grid: gridOpt, border: { display: false }, ticks: { precision: 0, color: '#94a3b8', font: { size: 11 } } }, y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: 700 }, color: axisLabelColor } } },
              }}
            />
          </div>
        </Panel>
        <Panel title="Channel Tiket" desc="Sumber masuknya kasus" delay=".34s" accent="from-sky-400 to-blue-500">
          <div className="h-64 flex items-center justify-center">
            <Doughnut data={channelData} options={doughnutOpt} />
          </div>
        </Panel>
        <Panel title="Nilai Billing per Bulan" desc="Total charges (Rp) dari kasus berbayar" delay=".38s" accent="from-amber-400 to-orange-500" badge={fmtRp(totalCharge)}>
          <div className="h-64">
            <Bar
              data={chargesData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { ...baseTooltip, callbacks: { label: (ctx) => ' ' + fmtRp(ctx.parsed.y) } },
                },
                scales: { y: { beginAtZero: true, grid: gridOpt, border: { display: false }, ticks: { callback: (v) => fmtRp(v), color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 5 } }, x: { grid: { display: false }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 11, weight: 600 } } } },
              }}
            />
          </div>
        </Panel>
      </div>

      {/* ===== OUTSTANDING ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel className="xl:col-span-2" title="Outstanding per Brand" desc="Top 5 brand dengan invoice belum PAID" delay=".4s" accent="from-rose-400 to-rose-600" badge={`${fmtNum(outstanding.count)} kasus`}>
          {outstanding.top.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-center">
              <span className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
              <p className="text-sm font-bold text-slate-700">Tidak ada outstanding</p>
              <p className="text-xs text-slate-400">Semua invoice sudah PAID. Kerja bagus!</p>
            </div>
          ) : (
            <div className="h-64">
              <Bar
                data={outstandingData}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { ...baseTooltip, callbacks: { label: (ctx) => ' ' + fmtRp(ctx.parsed.x) } },
                  },
                  scales: {
                    x: { beginAtZero: true, grid: gridOpt, border: { display: false }, ticks: { callback: (v) => fmtRp(v), font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 5 } },
                    y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: 700 }, color: axisLabelColor } },
                  },
                }}
              />
            </div>
          )}
        </Panel>
        <Panel title="Ringkasan Outstanding" desc="Kasus tervalidasi yang belum PAID" delay=".42s" accent="from-rose-400 to-orange-400">
          <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-100 p-5">
            <p className="text-[11px] font-bold text-rose-400 uppercase tracking-[0.14em]">Total Outstanding</p>
            <p className="mt-1 text-[32px] leading-none font-extrabold text-slate-900 tracking-tight tabular-nums">{fmtRp(outstanding.amount)}</p>
            <p className="mt-2 text-xs text-slate-500 font-medium">{fmtNum(outstanding.count)} kasus · {fmtRp(outstanding.amount)}</p>
          </div>
          <div className="mt-5 space-y-4">
            {outstanding.top.slice(0, 3).map(([brand, amount]) => (
              <div key={brand}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{brand}</span>
                    <span className="text-xs text-slate-600 font-bold ml-2 whitespace-nowrap tabular-nums">{fmtRp(amount)}</span>
                </div>
                <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-rose-400 to-rose-600 rounded-full transition-all duration-700" style={{ width: `${Math.round((amount / outstanding.max) * 100)}%` }} />
                </div>
              </div>
            ))}
            {outstanding.top.length === 0 && (
              <p className="text-xs text-slate-400">Belum ada data outstanding.</p>
            )}
          </div>
          <Link to="/finance" className="mt-5 inline-flex items-center gap-2 text-[13px] font-extrabold text-white bg-slate-900 hover:bg-brand-600 px-4 py-2.5 rounded-xl transition shadow-lg shadow-slate-900/10">
            Buka Finance Audit
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </Panel>
      </div>

      {/* ===== TOP KLIEN + TIM ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel className="xl:col-span-2" title="Top 8 Klien" desc="Klien dengan kasus terbanyak" delay=".44s" accent="from-indigo-500 to-blue-500" badge={`${uniqueClients} klien`}>
          <div className="h-72">
            <Bar
              data={clientData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                ...noLegend,
                scales: {
                  y: { beginAtZero: true, grid: gridOpt, border: { display: false }, ticks: { precision: 0, color: '#94a3b8', font: { size: 11 } } },
                  x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10, weight: 700 }, color: '#475569', maxRotation: 45, minRotation: 45 } },
                },
              }}
            />
          </div>
        </Panel>
        <Panel title="Kinerja Tim Support" desc="Kasus ditangani per petugas" delay=".46s" accent="from-emerald-400 to-sky-500">
          <div className="space-y-4 max-h-72 overflow-y-auto scrollbar-thin pr-1">
            {teamPerf.map((t, i) => (
              <div key={t.name} className="group">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className={`w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br ${TEAM_COLORS[i % TEAM_COLORS.length]} text-white text-[11px] font-extrabold flex items-center justify-center shadow`}>
                    {t.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-700 dark:text-slate-200 text-[13px] truncate">{t.name}</span>
                      <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">
                        {fmtNum(t.count)} · {fmtRp(t.charge)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${TEAM_COLORS[i % TEAM_COLORS.length]} rounded-full transition-all duration-700`}
                        style={{ width: `${t.pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {teamPerf.length === 0 && <p className="text-xs text-slate-400">Belum ada data tim.</p>}
          </div>
        </Panel>
      </div>

      {/* ===== KASUS TERBARU ===== */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,.05),0_12px_32px_-16px_rgba(16,24,40,.15)] animate-fade-in-fast" style={{ animationDelay: '.48s' }}>
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 justify-between bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-800/60 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={MINI_PATHS.cases} /></svg>
            </span>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Kasus Terbaru</h3>
              <p className="text-xs text-slate-400">10 kasus terakhir dari Google Sheets</p>
            </div>
          </div>
          <Link to="/kasus" className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2.5 rounded-xl transition shadow-lg shadow-brand-600/25">
            Lihat Semua Data
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/70 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="pl-6 pr-2 py-3 w-12">No</th>
                <th className="px-3 py-3">Tanggal</th>
                <th className="px-3 py-3">Klien</th>
                <th className="px-3 py-3">Kendala</th>
                <th className="px-3 py-3">Modul</th>
                <th className="px-3 py-3">Petugas</th>
                <th className="px-3 py-3">Billing</th>
                <th className="px-3 pr-6 py-3 text-right">Biaya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((c) => {
                const bs = (c.billingStatus || '').trim() || '-';
                const audit = caseAuditStatus[c.recordUuid] || 'BELUM DIVALIDASI';
                const isValid = audit === 'VALID - SIAP INVOICE';
                const clientInitials = String(c.client || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                const staffInitials = String(c.assignTo || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <tr
                    key={c.recordUuid}
                    onClick={() => setDetailUuid(c.recordUuid)}
                    title="Klik untuk lihat detail kasus"
                    className="even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-brand-50/50 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <td className="pl-6 pr-2 py-3.5 text-xs text-slate-400 tabular-nums">{c.no || '-'}</td>
                    <td className="px-3 py-3.5 text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{fmtDate(c.dateIssue)}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-brand-600/10 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-500/20 text-[10px] font-extrabold flex items-center justify-center shrink-0">{clientInitials}</span>
                        <span className="min-w-0">
                          <span className="block font-bold text-slate-800 dark:text-slate-100 truncate">{c.client || '-'}</span>
                          {c.channelTicket && <span className="block text-[10px] text-slate-400 font-medium">via {c.channelTicket}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="min-w-[220px] max-w-[320px]">
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2" title={c.issue}>{c.issue || '-'}</p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDetailUuid(c.recordUuid); }}
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-lg px-2.5 py-1 transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                          </svg>
                          Lihat Detail
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-full px-2.5 py-1">{c.module || '-'}</span>
                      {c.subModule && <span className="mt-1 block text-[10px] text-slate-400 font-medium">{c.subModule}</span>}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white text-[9px] font-extrabold flex items-center justify-center shrink-0">{staffInitials}</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{c.assignTo || '-'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold border rounded-full px-2.5 py-1 ${BILL_BADGE[bs] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />{bs}
                      </span>
                      {c.billingCategory && <span className="mt-1 block text-[10px] text-slate-400 font-medium">{c.billingCategory}</span>}
                      <span className={`mt-1 block text-[10px] font-bold ${isValid ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {isValid ? '● Tervalidasi' : '○ Belum validasi'}
                      </span>
                    </td>
                    <td className={`px-3 pr-6 py-3.5 text-right whitespace-nowrap tabular-nums ${c.charges > 0 ? 'text-sm font-extrabold text-amber-700 dark:text-amber-400' : 'text-xs font-bold text-slate-300 dark:text-slate-600'}`}>
                      {c.charges > 0 ? fmtRp(c.charges) : '—'}
                    </td>
                  </tr>
                );
              })}
              {recent.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">Belum ada data kasus.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Popup detail kasus dari kolom Kendala — sama seperti Finance */}
      <CaseDetailModal
        c={detailCase}
        kicker={`Detail Kasus #${detailCase?.no || '-'}`}
        title={detailCase?.client || '-'}
        chips={detailCase ? [
          { text: detailCase.module || '-', className: 'bg-white/15 border-white/20' },
          { text: detailCase.billingStatus || '-', className: BILL_BADGE[detailCase.billingStatus] || 'bg-white/15 border-white/20' },
          { text: caseAuditStatus[detailCase.recordUuid] || 'BELUM DIVALIDASI', className: 'bg-amber-300/90 text-amber-900 border-transparent' },
        ] : []}
        sections={detailCase ? [
          { title: 'Informasi Kasus', rows: [
            ['Tgl Issue', fmtDate(detailCase.dateIssue)],
            ['Brand', detailCase.client || '-'],
            ['Channel', detailCase.channelTicket || '-'],
            ['Petugas', detailCase.assignTo || '-'],
            ['Module', detailCase.module || '-'],
            ['Sub-Module', detailCase.subModule || '-'],
            ['Lokasi', detailCase.location || '-'],
          ]},
          { title: 'Billing & Invoice', rows: [
            ['Status Billing', detailCase.billingStatus || '-'],
            ['Kategori Billing', detailCase.billingCategory || '-'],
            ['Tipe Support', detailCase.supportType || '-'],
            ['Charges', detailCase.charges > 0 ? fmtRp(detailCase.charges) : '-'],
            ['Status Validasi', caseAuditStatus[detailCase.recordUuid] || 'BELUM DIVALIDASI'],
            ['Status Invoice', invoiceStatus[detailCase.recordUuid] || 'MENUNGGU INVOICE'],
          ]},
        ] : []}
        notes={{ label: 'Completion Notes', text: detailCase?.completionNotes }}
        onClose={() => setDetailUuid(null)}
      />

      <p className="text-center text-[11px] text-slate-400 pb-4">Dashboard diperbarui {lastUpdated} · sumber Google Sheets via backend</p>
    </div>
  );
}

/* ===== Sub-komponen ===== */
function Dot() {
  return <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 inline-block" />;
}

function StatCard({ title, value, sub, icon, grad, glow = '', delta, tone, valueCls = '', valueSize = 'text-[28px]', delay }) {
  return (
    <div className={`group relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 p-5 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:shadow-xl ${glow} hover:-translate-y-1 hover:border-transparent transition-all duration-300 animate-fade-in-fast`} style={{ animationDelay: delay }}>
      <div aria-hidden="true" className={`absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br ${grad} opacity-[.08] rounded-full blur-2xl group-hover:opacity-[.18] transition`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em] truncate">{title}</p>
          <p className={`mt-2 ${valueSize} leading-tight font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white ${valueCls}`}>{value}</p>
          <p className="mt-2 text-[12px] font-medium text-slate-400 truncate">{sub}</p>
        </div>
        <div className={`w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br ${grad} text-white flex items-center justify-center shadow-lg`}>
          <FeatureIcon name={icon} />
        </div>
      </div>
      {delta && (
        <span className={`relative mt-4 inline-flex items-center gap-1 text-[11px] font-bold border rounded-full px-2.5 py-1 ${tone}`}>
          {delta}
        </span>
      )}
    </div>
  );
}

function Panel({ title, desc, children, className = '', delay, accent = 'from-brand-500 to-violet-500', badge }) {
  return (
    <div className={`relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05),0_12px_32px_-16px_rgba(16,24,40,.12)] animate-fade-in-fast ${className}`} style={{ animationDelay: delay }}>
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span aria-hidden="true" className={`mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${accent} opacity-90`} style={{ maskImage: 'linear-gradient(#000,#000)', WebkitMaskImage: 'linear-gradient(#000,#000)' }}>
              <span className="w-full h-full block bg-white/20" />
            </span>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">{title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </div>
          </div>
          {badge && (
            <span className="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-full px-2.5 py-1 whitespace-nowrap">{badge}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// Ikon kecil untuk kartu (SVG inline, stroke)
const MINI_PATHS = {
  cases: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155',
  mockup: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  form: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  billing: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
  finance: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.191-2.074-.571a1.918 1.918 0 01-1.816-1.816A2.487 2.487 0 0112 7.5a2.487 2.487 0 012.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  cfg: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75',
  report: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

function FeatureIcon({ name }) {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={MINI_PATHS[name] || ''} />
    </svg>
  );
}
