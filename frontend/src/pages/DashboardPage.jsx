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
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { triggerSync, getSyncLogs, getHealth } from '../lib/api.js';
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
const fmtNum = (n) => (+n || 0).toLocaleString('id-ID');
const fmtRp = (n) => 'Rp ' + fmtNum(Math.round(+n || 0));
const fmtRpShort = (n) => {
  n = +n || 0;
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

/* ---- Swiss Industrial palette: ink + paper + hazard red only ---- */
const INK = '#111111';
const PAPER = '#F4F4F0';
const HAZARD = '#E61919';
const GRAY_1 = '#6b6b66';
const GRAY_2 = '#a3a099';
const GRID = '#d8d5cc';

const gridOpt = { color: GRID };

const BILL_BADGE = {
  FREE: 'border-ink text-ink',
  'ON-CALL': 'border-hazard text-hazard',
  MONTHLY: 'bg-ink text-paper border-ink',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'SELAMAT PAGI';
  if (h < 15) return 'SELAMAT SIANG';
  if (h < 19) return 'SELAMAT SORE';
  return 'SELAMAT MALAM';
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

  /* ---- Chart datasets: solid ink/paper/hazard only, no gradients ---- */
  const trendData = {
    labels: ymLabels,
    datasets: [{
      label: 'Kasus',
      data: ymKeys.map((k) => ymMap[k].count),
      borderColor: INK,
      backgroundColor: 'rgba(17,17,17,.06)',
      fill: true,
      tension: 0,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: INK,
      pointBorderColor: PAPER,
      pointBorderWidth: 1,
      pointStyle: 'rect',
      borderWidth: 2,
    }],
  };
  const BILL_COLORS = { FREE: INK, 'ON-CALL': HAZARD, MONTHLY: GRAY_1, LAINNYA: GRAY_2 };
  const billEntries = topEntries(billMap);
  const billTotal = billEntries.reduce((s, e) => s + e[1], 0) || 1;
  const billingData = {
    labels: billEntries.map((e) => e[0]),
    datasets: [{
      data: billEntries.map((e) => e[1]),
      backgroundColor: billEntries.map((e) => BILL_COLORS[e[0]] || GRAY_2),
      hoverOffset: 4,
      borderWidth: 2,
      borderColor: PAPER,
      spacing: 1,
    }],
  };
  const modEntries = topEntries(moduleMap, 6);
  const moduleData = {
    labels: modEntries.map((e) => e[0]),
    datasets: [{
      data: modEntries.map((e) => e[1]),
      backgroundColor: INK,
      hoverBackgroundColor: HAZARD,
      borderWidth: 0,
      borderRadius: 0,
      borderSkipped: false,
      maxBarThickness: 20,
    }],
  };
  const CHAN_COLORS = [INK, HAZARD, GRAY_1, GRAY_2, '#3a3a36', '#8f8c85'];
  const chanEntries = topEntries(chanMap);
  const channelData = {
    labels: chanEntries.map((e) => e[0]),
    datasets: [{ data: chanEntries.map((e) => e[1]), backgroundColor: CHAN_COLORS, hoverOffset: 4, borderWidth: 2, borderColor: PAPER, spacing: 1 }],
  };
  const chargesData = {
    labels: ymLabels,
    datasets: [{
      label: 'Charges',
      data: ymKeys.map((k) => ymMap[k].charges),
      backgroundColor: INK,
      hoverBackgroundColor: HAZARD,
      borderWidth: 0,
      borderRadius: 0,
      borderSkipped: false,
      maxBarThickness: 24,
    }],
  };
  const clientEntries = topEntries(clientMap, 8);
  const clientData = {
    labels: clientEntries.map((e) => e[0]),
    datasets: [{
      data: clientEntries.map((e) => e[1]),
      backgroundColor: INK,
      hoverBackgroundColor: HAZARD,
      borderWidth: 0,
      borderRadius: 0,
      borderSkipped: false,
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
      backgroundColor: HAZARD,
      hoverBackgroundColor: INK,
      borderWidth: 0,
      borderRadius: 0,
      borderSkipped: false,
      maxBarThickness: 20,
    }],
  };

  const baseTooltip = {
    backgroundColor: INK,
    padding: 10,
    cornerRadius: 0,
    titleFont: { family: 'monospace', weight: '700', size: 11 },
    bodyFont: { family: 'monospace', size: 11 },
    displayColors: false,
  };
  const monoTicks = { color: GRAY_1, font: { family: 'monospace', size: 10, weight: '700' } };

  const noLegend = { plugins: { legend: { display: false }, tooltip: baseTooltip } };
  const doughnutOpt = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'rect', padding: 12, font: { family: 'monospace', weight: '700', size: 10 }, color: INK } },
      tooltip: baseTooltip,
    },
  };

  const FEATURES = [
    { code: 'D-01', title: 'DATA KASUS', to: '/kasus', icon: 'cases', metric: fmtNum(TOTAL) + ' KASUS', desc: uniqueClients + ' KLIEN TERCATAT' },
    { code: 'D-02', title: 'FORM KASUS', to: '/form', icon: 'form', metric: fmtNum(latestYM ? ymMap[latestYM].count : 0) + ' KASUS', desc: 'BULAN TERAKHIR PERIODE' },
    { code: 'D-03', title: 'BILLING + AUDIT', to: '/billing', icon: 'billing', metric: fmtNum((billMap['ON-CALL'] || 0) + (billMap['MONTHLY'] || 0)) + ' TAGIHAN', desc: 'ON-CALL ' + fmtNum(billMap['ON-CALL'] || 0) + ' /// MONTHLY ' + fmtNum(billMap['MONTHLY'] || 0) },
    { code: 'D-04', title: 'FINANCE AUDIT', to: '/finance', icon: 'finance', metric: fmtRpShort(totalCharge), desc: 'NILAI CHARGES TERCATAT' },
    { code: 'D-05', title: 'KONFIGURASI SHEET', to: '/cfg', icon: 'cfg', metric: priceRefs + ' PAKET', desc: 'REFERENSI PRICE LIST' },
    { code: 'D-06', title: 'HR REPORT', to: '/hrreport', icon: 'report', metric: Object.keys(moduleMap).length + ' MODUL', desc: Object.keys(teamPerf).length + ' PETUGAS /// ' + Object.keys(chanMap).length + ' CHANNEL' },
  ];

  const paidPct = TOTAL > 0 ? ((paidCases.length / TOTAL) * 100).toFixed(1) : '0.0';
  const momLabel = momGrowth == null ? 'DATA AWAL' : `${momGrowth >= 0 ? '+' : ''}${momGrowth}% MOM`;

  return (
    <div className="w-full min-w-0 bg-paper text-ink px-3 sm:px-4 md:px-5 py-5">
      {/* ===== MASTHEAD ===== */}
      <header className="border-2 border-ink bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
          <span>[ UNIT / D-00 /// DASHBOARD ]</span>
          <span className="hidden md:inline">REV 2.6 /// SHEETS → DB</span>
          <span className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 ${loading || syncing ? 'bg-hazard' : 'bg-ink'}`} aria-hidden="true" />
            {syncing ? 'SYNC…' : loading ? 'LOADING…' : 'LIVE'}
            {mockMode ? ' /// MOCK' : ''}
          </span>
        </div>

        <div className="px-4 pt-4 pb-5 md:px-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">{greeting()} /// RINGKASAN OPERASIONAL</p>
          <h1
            className="mt-1 font-black uppercase leading-[0.9] tracking-[-0.03em]"
            style={{ fontSize: 'clamp(2.6rem, 7vw, 6.5rem)' }}
          >
            DASHBOARD<span className="text-hazard">®</span>
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
            <span>[ {fmtNum(TOTAL)} KASUS ]</span>
            <span>[ {uniqueClients} KLIEN ]</span>
            <span>[ OUTSTANDING {fmtRpShort(outstanding.amount)} ]</span>
            <span className="text-ink/60">UPD {lastUpdated}{lastSync ? ` /// SYNC ${lastSync}` : ''}</span>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t-2 border-ink pt-4 lg:flex-row lg:items-center">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={syncAndReload}
                disabled={syncing}
                className="inline-flex items-center gap-2 border-2 border-ink bg-ink px-5 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-paper transition-none hover:bg-hazard hover:border-hazard disabled:opacity-60"
              >
                <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {!syncing ? '>>> SINCRON + MUAT ULANG' : syncStage === 'sync' ? '1/2 SINCRON…' : '2/2 MEMUAT…'}
              </button>
              <button
                onClick={refresh}
                disabled={spinning || syncing}
                className="inline-flex items-center gap-2 border-2 border-ink bg-paper px-5 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-ink hover:bg-ink hover:text-paper disabled:opacity-60"
              >
                MUAT ULANG
              </button>
            </div>
            {syncMsg && (
              <p className={`font-mono text-[11px] font-bold uppercase tracking-[0.08em] border-2 px-3 py-2 ${syncErr ? 'border-hazard text-hazard' : 'border-ink'}`}>
                {syncErr ? '[ ERR ] ' : '[ OK ] '}{syncMsg}
              </p>
            )}
            {mockMode && !syncMsg && (
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-hazard">[ MOCK ] SYNC TIDAK MEMBACA SHEET ASLI</p>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="mt-4 flex items-center justify-between border-2 border-hazard px-4 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-hazard">
          <span>[ ERR ] BACKEND TIDAK TERJANGKAU ({error})</span>
          <button onClick={refresh} className="underline underline-offset-4">COBA LAGI</button>
        </div>
      )}

      {/* ===== KPI STRIP: razor grid, gap 1px ===== */}
      <section aria-label="Indikator utama" className="mt-4 grid grid-cols-2 gap-px border-2 border-ink bg-ink lg:grid-cols-5">
        <StatCell index="K-01" label="TOTAL KASUS" value={fmtNum(TOTAL)} sub={`${uniqueClients} KLIEN /// ${Object.keys(moduleMap).length} MODUL`} foot={`${fmtNum(ymKeys.length)} BLN PERIODE`} />
        <StatCell index="K-02" label="BULAN TERAKHIR" value={fmtNum(latestYM ? ymMap[latestYM].count : 0)} sub={latestYM ? 'PERIODE ' + ymLabels[ymLabels.length - 1].toUpperCase() : '—'} foot={momLabel} />
        <StatCell index="K-03" label="KASUS BERBAYAR" value={fmtNum(paidCases.length)} sub={`${paidPct}% DARI TOTAL`} foot={`${fmtNum((billMap['ON-CALL'] || 0) + (billMap['MONTHLY'] || 0))} TAGIHAN`} />
        <StatCell index="K-04" label="NILAI BILLING" value={fmtRpShort(totalCharge)} sub={'DARI ' + fmtNum(paidCases.length) + ' BERBAYAR'} foot="TERCATAT" />
        <StatCell index="K-05" label="OUTSTANDING" value={fmtRpShort(outstanding.amount)} sub={`${fmtNum(outstanding.count)} BELUM PAID`} foot="PERLU DITAGIH" alert />
      </section>

      {/* ===== REKAP FITUR ===== */}
      <section className="mt-8">
        <SectionHead no="01" eyebrow="NAVIGASI CEPAT" title="REKAP PER FITUR" desc="LONCAT KE MODUL DENGAN KONTEKS ANGKA TERKINI" />
        <div className="mt-3 grid grid-cols-1 gap-px border-2 border-ink bg-ink sm:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Link
              key={f.code}
              to={f.to}
              className="group flex items-start gap-4 bg-paper p-4 transition-none hover:bg-ink hover:text-paper focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-hazard"
            >
              <span className="font-mono text-[10px] font-bold tracking-[0.14em] opacity-60">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink group-hover:border-paper" aria-hidden="true">
                <FeatureIcon name={f.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.18em] opacity-60">{f.code} /// {f.title}</span>
                <span className="mt-1 block text-xl font-black uppercase leading-none tracking-tight">{f.metric}</span>
                <span className="mt-1 block truncate font-mono text-[10px] font-bold uppercase tracking-[0.1em] opacity-60">{f.desc}</span>
              </span>
              <span className="shrink-0 font-mono text-sm font-bold transition-none group-hover:text-hazard" aria-hidden="true">>>></span>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== TREN + BILLING ===== */}
      <section className="mt-8">
        <SectionHead no="02" eyebrow="VOLUME + KOMPOSISI" title="TREN + STATUS" desc="KASUS MASUK PER BULAN /// PEMBAGIAN BILLING" />
        <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2" code="G-01" title="TREN KASUS PER BULAN" desc="JUMLAH KASUS BERDASAR TANGGAL ISSUE" badge={`${fmtNum(TOTAL)} TOTAL`}>
            <div className="h-64">
              <Line
                data={trendData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { display: false }, tooltip: baseTooltip },
                  scales: {
                    y: { beginAtZero: true, grid: gridOpt, border: { display: true, color: INK }, ticks: { ...monoTicks, precision: 0 } },
                    x: { grid: { display: false }, border: { display: true, color: INK }, ticks: monoTicks },
                  },
                }}
              />
            </div>
          </Panel>
          <Panel code="G-02" title="STATUS BILLING" desc="FREE /// ON-CALL /// MONTHLY">
            <div className="relative h-64">
              <Doughnut data={billingData} options={doughnutOpt} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
                <p className="text-4xl font-black leading-none tracking-tight">{fmtNum(billTotal)}</p>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em]">KASUS</p>
              </div>
            </div>
          </Panel>
        </div>
      </section>

      {/* ===== MODUL + CHANNEL + CHARGES ===== */}
      <section className="mt-8">
        <SectionHead no="03" eyebrow="DISTRIBUSI" title="MODUL /// CHANNEL /// NILAI" desc="SEGMENTASI SUMBER DAN NILAI TAGIHAN" />
        <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel code="G-03" title="KASUS PER MODUL" desc="MODUL TERBANYAK DITANGANI" badge={`TOP ${modEntries.length}`}>
            <div className="h-64">
              <Bar
                data={moduleData}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  ...noLegend,
                  scales: { x: { beginAtZero: true, grid: gridOpt, border: { display: true, color: INK }, ticks: { ...monoTicks, precision: 0 } }, y: { grid: { display: false }, border: { display: true, color: INK }, ticks: { font: { family: 'monospace', size: 10, weight: '700' }, color: INK } } },
                }}
              />
            </div>
          </Panel>
          <Panel code="G-04" title="CHANNEL TIKET" desc="SUMBER MASUKNYA KASUS">
            <div className="flex h-64 items-center justify-center">
              <Doughnut data={channelData} options={doughnutOpt} />
            </div>
          </Panel>
          <Panel code="G-05" title="NILAI BILLING PER BULAN" desc="TOTAL CHARGES DARI KASUS BERBAYAR" badge={fmtRpShort(totalCharge)}>
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
                  scales: { y: { beginAtZero: true, grid: gridOpt, border: { display: true, color: INK }, ticks: { ...monoTicks, callback: (v) => fmtRpShort(v) } }, x: { grid: { display: false }, border: { display: true, color: INK }, ticks: monoTicks } },
                }}
              />
            </div>
          </Panel>
        </div>
      </section>

      {/* ===== OUTSTANDING ===== */}
      <section className="mt-8">
        <SectionHead no="04" eyebrow="PERHATIAN" title="OUTSTANDING" desc="TOP 5 BRAND DENGAN INVOICE BELUM PAID" alert />
        <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2" code="G-06" title="OUTSTANDING PER BRAND" desc="NILAI BELUM PAID PER BRAND" badge={`${fmtNum(outstanding.count)} KASUS`} alert>
            {outstanding.top.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
                <p className="text-lg font-black uppercase tracking-tight">[ NIHIL ]</p>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]">SEMUA INVOICE SUDAH PAID</p>
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
                      x: { beginAtZero: true, grid: gridOpt, border: { display: true, color: INK }, ticks: { ...monoTicks, callback: (v) => fmtRpShort(v) } },
                      y: { grid: { display: false }, border: { display: true, color: INK }, ticks: { font: { family: 'monospace', size: 10, weight: '700' }, color: INK } },
                    },
                  }}
                />
              </div>
            )}
          </Panel>
          <Panel code="G-07" title="RINGKASAN OUTSTANDING" desc="KASUS TERVALIDASI BELUM PAID" alert>
            <div className="border-2 border-hazard p-4">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-hazard">[ TOTAL OUTSTANDING ]</p>
              <p className="mt-1 text-4xl font-black leading-none tracking-tight">{fmtRpShort(outstanding.amount)}</p>
              <p className="mt-2 font-mono text-[11px] font-bold uppercase">{fmtNum(outstanding.count)} KASUS /// {fmtRp(outstanding.amount)}</p>
            </div>
            <div className="mt-4 space-y-4">
              {outstanding.top.slice(0, 3).map(([brand, amount]) => (
                <div key={brand}>
                  <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[11px] font-bold uppercase">
                    <span className="truncate">{brand}</span>
                    <span className="whitespace-nowrap">{fmtRpShort(amount)}</span>
                  </div>
                  <div className="h-2 border border-ink bg-paper">
                    <div className="h-full bg-hazard" style={{ width: `${Math.round((amount / outstanding.max) * 100)}%` }} />
                  </div>
                </div>
              ))}
              {outstanding.top.length === 0 && (
                <p className="font-mono text-[11px] uppercase">BELUM ADA DATA OUTSTANDING.</p>
              )}
            </div>
            <Link to="/finance" className="mt-5 inline-flex items-center gap-2 border-2 border-ink bg-ink px-4 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-paper hover:bg-hazard hover:border-hazard">
              BUKA FINANCE AUDIT >>>
            </Link>
          </Panel>
        </div>
      </section>

      {/* ===== TOP KLIEN + TIM ===== */}
      <section className="mt-8">
        <SectionHead no="05" eyebrow="AKTOR" title="KLIEN + TIM" desc="KLIEN TERBANYAK /// KINERJA PETUGAS" />
        <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2" code="G-08" title="TOP 8 KLIEN" desc="KLIEN DENGAN KASUS TERBANYAK" badge={`${uniqueClients} KLIEN`}>
            <div className="h-72">
              <Bar
                data={clientData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  ...noLegend,
                  scales: {
                    y: { beginAtZero: true, grid: gridOpt, border: { display: true, color: INK }, ticks: { ...monoTicks, precision: 0 } },
                    x: { grid: { display: false }, border: { display: true, color: INK }, ticks: { font: { family: 'monospace', size: 9, weight: '700' }, color: INK, maxRotation: 45, minRotation: 45 } },
                  },
                }}
              />
            </div>
          </Panel>
          <Panel code="G-09" title="KINERJA TIM SUPPORT" desc="KASUS PER PETUGAS">
            <div className="max-h-72 space-y-4 overflow-y-auto scrollbar-thin pr-1">
              {teamPerf.map((t) => (
                <div key={t.name}>
                  <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[11px] font-bold uppercase">
                    <span className="truncate">+ {t.name}</span>
                    <span className="whitespace-nowrap opacity-60">{fmtNum(t.count)} /// {fmtRpShort(t.charge)}</span>
                  </div>
                  <div className="h-2 border border-ink bg-paper">
                    <div className="h-full bg-ink" style={{ width: `${t.pct}%` }} />
                  </div>
                </div>
              ))}
              {teamPerf.length === 0 && <p className="font-mono text-[11px] uppercase">BELUM ADA DATA TIM.</p>}
            </div>
          </Panel>
        </div>
      </section>

      {/* ===== KASUS TERBARU ===== */}
      <section className="mt-8 border-2 border-ink bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">T-10 /// LOG TERAKHIR</p>
            <h3 className="text-xl font-black uppercase leading-none tracking-tight">KASUS TERBARU</h3>
          </div>
          <Link to="/kasus" className="inline-flex items-center gap-2 border-2 border-ink bg-ink px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-paper hover:bg-hazard hover:border-hazard">
            SEMUA DATA >>>
          </Link>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[820px] font-mono text-[11px] uppercase">
            <thead>
              <tr className="bg-ink text-left font-bold tracking-[0.12em] text-paper">
                <th className="px-4 py-2.5">TANGGAL</th>
                <th className="px-4 py-2.5">KLIEN</th>
                <th className="px-4 py-2.5">KENDALA</th>
                <th className="px-4 py-2.5">MODUL</th>
                <th className="px-4 py-2.5">PETUGAS</th>
                <th className="px-4 py-2.5">BILLING</th>
                <th className="px-4 py-2.5 text-right">BIAYA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/20">
              {recent.map((c) => {
                const bs = (c.billingStatus || '').trim() || '-';
                return (
                  <tr key={c.recordUuid} className="hover:bg-ink hover:text-paper">
                    <td className="whitespace-nowrap px-4 py-2.5">{fmtDate(c.dateIssue).toUpperCase()}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-bold">{c.client || '-'}</td>
                    <td className="max-w-[280px] truncate px-4 py-2.5 normal-case" title={c.issue}>{c.issue || '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className="whitespace-nowrap border border-current px-2 py-0.5 font-bold">{c.module || '-'}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">{c.assignTo || '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`whitespace-nowrap border-2 px-2 py-0.5 font-bold ${BILL_BADGE[bs] || 'border-ink'}`}>[ {bs} ]</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold">
                      {c.charges > 0 ? fmtRp(c.charges) : '—'}
                    </td>
                  </tr>
                );
              })}
              {recent.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center">BELUM ADA DATA KASUS.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-ink py-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
        <span>/// END OF REPORT ///</span>
        <span>UPD {lastUpdated} /// SHEETS VIA BACKEND</span>
        <span>© PUSAT DATA BANTUAN</span>
      </footer>
    </div>
  );
}

/* ===== Sub-komponen: rigid cells, 90° corners ===== */
function StatCell({ index, label, value, sub, foot, alert = false }) {
  return (
    <div className="bg-paper p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">[{index}] {label}</p>
      <p className={`mt-2 text-4xl font-black leading-none tracking-tight ${alert ? 'text-hazard' : ''}`}>{value}</p>
      <p className="mt-2 truncate font-mono text-[10px] font-bold uppercase tracking-[0.1em] opacity-60">{sub}</p>
      <p className={`mt-2 inline-block border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${alert ? 'border-hazard text-hazard' : 'border-ink'}`}>
        {foot}
      </p>
    </div>
  );
}

function SectionHead({ no, eyebrow, title, desc, alert = false }) {
  return (
    <div>
      <p className={`font-mono text-[11px] font-bold uppercase tracking-[0.2em] ${alert ? 'text-hazard' : ''}`}>/// {no} — {eyebrow}</p>
      <h3 className="mt-1 text-2xl font-black uppercase leading-none tracking-tight">{title}</h3>
      <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">[ {desc} ]</p>
      <hr className={`mt-3 border-t-2 ${alert ? 'border-hazard' : 'border-ink'}`} />
    </div>
  );
}

function Panel({ code, title, desc, badge, children, className = '', alert = false }) {
  return (
    <div className={`border-2 bg-paper ${alert ? 'border-hazard' : 'border-ink'} ${className}`}>
      <div className={`flex items-start justify-between gap-3 border-b-2 px-4 py-2.5 ${alert ? 'border-hazard' : 'border-ink'}`}>
        <div className="min-w-0">
          <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${alert ? 'text-hazard' : 'opacity-60'}`}>[ {code} ]</p>
          <h4 className="font-black uppercase leading-tight tracking-tight">{title}</h4>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] opacity-60">{desc}</p>
        </div>
        {badge && (
          <span className="shrink-0 whitespace-nowrap border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase">[ {badge} ]</span>
        )}
      </div>
      <div className="p-4">{children}</div>
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
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="square" strokeLinejoin="miter" d={MINI_PATHS[name] || ''} />
    </svg>
  );
}
