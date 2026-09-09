import { useMemo, useState } from 'react';
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
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { useInvoiceState } from '../hooks/useInvoiceState.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

/* ================= Helpers ================= */
const fmtNum = (n) => n.toLocaleString('id-ID');
const fmtRp = (n) => 'Rp ' + fmtNum(Math.round(n));
const fmtRpShort = (n) => {
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (n >= 1e3) return 'Rp ' + (n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
  return fmtRp(n);
};
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

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

const gridOpt = { color: '#f1f5f9' };

const BILL_BADGE = {
  FREE: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'ON-CALL': 'bg-amber-50 text-amber-600 border-amber-200',
  MONTHLY: 'bg-sky-50 text-sky-600 border-sky-200',
};

/* ================= Page ================= */
export default function DashboardPage() {
  const { cases: allCases, loading, error, reload } = useCases();
  const { caseAuditStatus } = useAuditState();
  const { invoiceStatus } = useInvoiceState();
  const [spinning, setSpinning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => stampNow());

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
      CASES, TOTAL, ymMap, ymKeys, ymLabels, latestYM, billMap, moduleMap, chanMap,
      clientMap, teamMap, priceRefs, paidCases, totalCharge, uniqueClients, recent, teamPerf,
    };
  }, [allCases]);

  const {
    TOTAL, ymMap, ymKeys, ymLabels, latestYM, billMap, moduleMap, chanMap,
    clientMap, priceRefs, paidCases, totalCharge, uniqueClients, recent, teamPerf,
  } = stats;

  /* ---- Chart datasets ---- */
  const trendData = {
    labels: ymLabels,
    datasets: [{
      label: 'Kasus',
      data: ymKeys.map((k) => ymMap[k].count),
      borderColor: '#4a4fe9',
      backgroundColor: 'rgba(74,79,233,.12)',
      fill: true,
      tension: 0.35,
      pointRadius: 4,
      pointBackgroundColor: '#4a4fe9',
      borderWidth: 2.5,
    }],
  };
  const BILL_COLORS = { FREE: '#10b981', 'ON-CALL': '#f59e0b', MONTHLY: '#0ea5e9', LAINNYA: '#cbd5e1' };
  const billEntries = topEntries(billMap);
  const billingData = {
    labels: billEntries.map((e) => e[0]),
    datasets: [{
      data: billEntries.map((e) => e[1]),
      backgroundColor: billEntries.map((e) => BILL_COLORS[e[0]] || '#cbd5e1'),
      borderWidth: 3,
      borderColor: '#fff',
    }],
  };
  const modEntries = topEntries(moduleMap, 6);
  const moduleData = {
    labels: modEntries.map((e) => e[0]),
    datasets: [{ data: modEntries.map((e) => e[1]), backgroundColor: '#5f72f5', borderRadius: 6, maxBarThickness: 22 }],
  };
  const CHAN_COLORS = ['#4a4fe9', '#10b981', '#f59e0b', '#94a3b8'];
  const chanEntries = topEntries(chanMap);
  const channelData = {
    labels: chanEntries.map((e) => e[0]),
    datasets: [{ data: chanEntries.map((e) => e[1]), backgroundColor: CHAN_COLORS, borderWidth: 3, borderColor: '#fff' }],
  };
  const chargesData = {
    labels: ymLabels,
    datasets: [{
      label: 'Charges',
      data: ymKeys.map((k) => ymMap[k].charges),
      backgroundColor: '#f59e0b',
      borderRadius: 6,
      maxBarThickness: 26,
    }],
  };
  const clientEntries = topEntries(clientMap, 8);
  const clientData = {
    labels: clientEntries.map((e) => e[0]),
    datasets: [{ data: clientEntries.map((e) => e[1]), backgroundColor: '#3d3ece', borderRadius: 6, maxBarThickness: 30 }],
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
    datasets: [{ label: 'Outstanding (Rp)', data: outstanding.top.map((t) => t[1]), backgroundColor: '#f43f5e', borderRadius: 6, maxBarThickness: 22 }],
  };

  const noLegend = { plugins: { legend: { display: false } } };
  const doughnutOpt = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { weight: 600 } } } },
  };

  const FEATURES = [
    { title: 'Data Kasus', to: '/kasus', color: 'bg-brand-50 text-brand-600', icon: 'cases', metric: fmtNum(TOTAL) + ' kasus', desc: uniqueClients + ' klien tercatat di Google Sheets' },
    { title: 'Form Kasus', to: '/form', color: 'bg-sky-50 text-sky-500', icon: 'form', metric: fmtNum(latestYM ? ymMap[latestYM].count : 0) + ' kasus', desc: 'masuk pada bulan terakhir periode data' },
    { title: 'Billing & Audit', to: '/billing', color: 'bg-amber-50 text-amber-500', icon: 'billing', metric: fmtNum((billMap['ON-CALL'] || 0) + (billMap['MONTHLY'] || 0)) + ' tagihan', desc: 'ON-CALL: ' + fmtNum(billMap['ON-CALL'] || 0) + ' · MONTHLY: ' + fmtNum(billMap['MONTHLY'] || 0) },
    { title: 'Finance Audit', to: '/finance', color: 'bg-emerald-50 text-emerald-500', icon: 'finance', metric: fmtRpShort(totalCharge), desc: 'total nilai charges yang tercatat' },
    { title: 'Konfigurasi Sheet', to: '/cfg', color: 'bg-violet-50 text-violet-500', icon: 'cfg', metric: priceRefs + ' paket', desc: 'referensi price list yang dipakai kasus' },
    { title: 'HR Report', to: '/hrreport', color: 'bg-slate-100 text-slate-500', icon: 'report', metric: Object.keys(moduleMap).length + ' modul', desc: Object.keys(teamPerf).length + ' petugas · ' + Object.keys(chanMap).length + ' channel aktif' },
  ];

  const TEAM_COLORS = ['bg-brand-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-violet-500'];

  return (
    <div className="px-8 py-6 space-y-6">
      {/* Topbar tombol */}
      <div className="flex items-center justify-end gap-3 -mt-1">
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Terakhir diperbarui: <span className="font-semibold text-slate-700">{lastUpdated}</span>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95"
        >
          <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Muat Terbaru
        </button>
      </div>
      {loading && <p className="text-xs text-slate-400">Memuat data dari backend…</p>}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-3 text-xs text-rose-700 flex items-center justify-between">
          <span>Backend tidak terjangkau ({error}).</span>
          <button onClick={refresh} className="font-bold hover:underline">Coba lagi</button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
        <StatCard title="Total Kasus" value={fmtNum(TOTAL)} sub={`${uniqueClients} klien · ${Object.keys(moduleMap).length} modul`} icon="cases" box="bg-brand-50 text-brand-600" delay=".02s" />
        <StatCard title="Kasus Bulan Terakhir" value={fmtNum(latestYM ? ymMap[latestYM].count : 0)} sub={latestYM ? 'periode ' + ymLabels[ymLabels.length - 1] : '—'} icon="mockup" box="bg-sky-50 text-sky-500" delay=".06s" />
        <StatCard title="Kasus Berbayar" value={fmtNum(paidCases.length)} valueCls="text-amber-600" subCls="text-amber-600" sub={`${((paidCases.length / TOTAL) * 100).toFixed(1)}% dari total kasus`} icon="billing" box="bg-amber-50 text-amber-500" delay=".1s" />
        <StatCard title="Total Nilai Billing" value={fmtRpShort(totalCharge)} valueCls="text-emerald-600" subCls="text-emerald-600" sub={'dari ' + fmtNum(paidCases.length) + ' kasus berbayar'} icon="finance" box="bg-emerald-50 text-emerald-500" delay=".14s" />
        <StatCard title="Total Outstanding" value={fmtRpShort(outstanding.amount)} valueCls="text-rose-600" subCls="text-rose-600" sub={`${fmtNum(outstanding.count)} kasus belum PAID`} icon="finance" box="bg-rose-50 text-rose-500" delay=".18s" />
      </div>

      {/* Rekap per fitur */}
      <div>
        <h3 className="font-bold text-slate-900 mb-3">Rekap per Fitur</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Link
              key={f.title}
              to={f.to}
              className="group bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/5 transition animate-fade-in-fast"
              style={{ animationDelay: `${0.16 + i * 0.04}s` }}
            >
              <div className={`w-11 h-11 shrink-0 rounded-xl ${f.color} flex items-center justify-center`}>
                <FeatureIcon name={f.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{f.title}</p>
                <p className="mt-1 text-lg font-extrabold text-slate-900">{f.metric}</p>
                <p className="text-[11px] text-slate-400 truncate">{f.desc}</p>
              </div>
              <svg className="w-4 h-4 mt-1 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          ))}
        </div>
      </div>

      {/* Grafik tren + billing */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel className="xl:col-span-2" title="Tren Kasus per Bulan" desc="Jumlah kasus masuk berdasarkan tanggal issue" delay=".2s">
          <div className="h-64">
            <Line
              data={trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: gridOpt, ticks: { precision: 0 } }, x: { grid: { display: false } } },
              }}
            />
          </div>
        </Panel>
        <Panel title="Status Billing" desc="Pembagian FREE / ON-CALL / MONTHLY" delay=".24s">
          <div className="h-64 flex items-center justify-center">
            <Doughnut data={billingData} options={doughnutOpt} />
          </div>
        </Panel>
      </div>

      {/* Grafik modul + channel + charges */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel title="Kasus per Modul" desc="Modul terbanyak ditangani" delay=".28s">
          <div className="h-64">
            <Bar
              data={moduleData}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                ...noLegend,
                scales: { x: { beginAtZero: true, grid: gridOpt, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { font: { size: 10, weight: 600 } } } },
              }}
            />
          </div>
        </Panel>
        <Panel title="Channel Tiket" desc="Sumber masuknya kasus" delay=".32s">
          <div className="h-64 flex items-center justify-center">
            <Doughnut data={channelData} options={doughnutOpt} />
          </div>
        </Panel>
        <Panel title="Nilai Billing per Bulan" desc="Total charges (Rp) dari kasus berbayar" delay=".36s">
          <div className="h-64">
            <Bar
              data={chargesData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: (ctx) => ' ' + fmtRp(ctx.parsed.y) } },
                },
                scales: { y: { beginAtZero: true, grid: gridOpt, ticks: { callback: (v) => fmtRpShort(v) } }, x: { grid: { display: false } } },
              }}
            />
          </div>
        </Panel>
      </div>

      {/* Outstanding per brand */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel className="xl:col-span-2" title="Outstanding per Brand" desc="Top 5 brand dengan invoice belum PAID" delay=".38s">
          {outstanding.top.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">
              Tidak ada outstanding — semua invoice sudah PAID
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
                    tooltip: { callbacks: { label: (ctx) => ' ' + fmtRp(ctx.parsed.x) } },
                  },
                  scales: {
                    x: { beginAtZero: true, grid: gridOpt, ticks: { callback: (v) => fmtRpShort(v), font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { font: { size: 11, weight: 600 } } },
                  },
                }}
              />
            </div>
          )}
        </Panel>
        <Panel title="Ringkasan Outstanding" desc="Kasus tervalidasi yang belum PAID" delay=".42s">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Outstanding</p>
              <p className="mt-1 text-3xl font-extrabold text-rose-600">{fmtRpShort(outstanding.amount)}</p>
              <p className="mt-1 text-xs text-slate-400 font-medium">{fmtNum(outstanding.count)} kasus · {fmtRp(outstanding.amount)}</p>
            </div>
            <div className="space-y-4">
              {outstanding.top.slice(0, 3).map(([brand, amount]) => (
                <div key={brand}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-bold text-slate-700 truncate">{brand}</span>
                    <span className="text-xs text-slate-400 font-semibold ml-2 whitespace-nowrap">{fmtRpShort(amount)}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full transition-all duration-700" style={{ width: `${Math.round((amount / outstanding.max) * 100)}%` }} />
                  </div>
                </div>
              ))}
              {outstanding.top.length === 0 && (
                <p className="text-xs text-slate-400">Belum ada data outstanding.</p>
              )}
            </div>
            <Link to="/finance" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline">
              Buka Finance Audit
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </Panel>
      </div>

      {/* Top klien + kinerja tim */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel className="xl:col-span-2" title="Top 8 Klien" desc="Klien dengan kasus terbanyak" delay=".4s">
          <div className="h-72">
            <Bar
              data={clientData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                ...noLegend,
                scales: {
                  y: { beginAtZero: true, grid: gridOpt, ticks: { precision: 0 } },
                  x: { grid: { display: false }, ticks: { font: { size: 9, weight: 600 }, maxRotation: 45, minRotation: 45 } },
                },
              }}
            />
          </div>
        </Panel>
        <Panel title="Kinerja Tim Support" desc="Kasus ditangani per petugas" delay=".44s">
          <div className="space-y-5">
            {teamPerf.map((t, i) => (
              <div key={t.name}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-bold text-slate-700">{t.name}</span>
                  <span className="text-xs text-slate-400 font-semibold">
                    {fmtNum(t.count)} kasus · {fmtRpShort(t.charge)}
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${TEAM_COLORS[i % TEAM_COLORS.length]} rounded-full transition-all duration-700`}
                    style={{ width: `${t.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Kasus terbaru */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-fast" style={{ animationDelay: '.48s' }}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Kasus Terbaru</h3>
            <p className="text-xs text-slate-400">10 kasus terakhir dari Google Sheets</p>
          </div>
          <Link to="/kasus" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 transition">
            Lihat Semua Data
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                <th className="px-6 py-3">Tanggal</th>
                <th className="px-6 py-3">Klien</th>
                <th className="px-6 py-3">Kendala</th>
                <th className="px-6 py-3">Modul</th>
                <th className="px-6 py-3">Petugas</th>
                <th className="px-6 py-3">Billing</th>
                <th className="px-6 py-3 text-right">Biaya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map((c) => {
                const bs = (c.billingStatus || '').trim() || '-';
                return (
                  <tr key={c.recordUuid} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-3.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(c.dateIssue)}</td>
                    <td className="px-6 py-3.5 font-semibold text-slate-800 whitespace-nowrap">{c.client || '-'}</td>
                    <td className="px-6 py-3.5 text-xs text-slate-500 max-w-[280px] truncate" title={c.issue}>{c.issue || '-'}</td>
                    <td className="px-6 py-3.5">
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">{c.module || '-'}</span>
                    </td>
                    <td className="px-6 py-3.5 text-xs font-semibold text-slate-600">{c.assignTo || '-'}</td>
                    <td className="px-6 py-3.5">
                      <span className={`text-[11px] font-bold border rounded-full px-2.5 py-1 ${BILL_BADGE[bs] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>{bs}</span>
                    </td>
                    <td className={`px-6 py-3.5 text-right text-xs font-bold ${c.charges > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                      {c.charges > 0 ? fmtRp(c.charges) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ===== Sub-komponen ===== */
function StatCard({ title, value, sub, icon, box, valueCls = '', subCls = 'text-slate-400', delay }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-fade-in-fast" style={{ animationDelay: delay }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
          <p className={`mt-2 text-3xl font-extrabold text-slate-900 ${valueCls}`}>{value}</p>
          <p className={`mt-1 text-xs font-medium ${subCls}`}>{sub}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl ${box} flex items-center justify-center`}>
          <FeatureIcon name={icon} />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, desc, children, className = '', delay }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-fast ${className}`} style={{ animationDelay: delay }}>
      <div className="mb-4">
        <h3 className="font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
      {children}
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
