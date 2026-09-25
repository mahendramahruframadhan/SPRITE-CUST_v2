import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useCases } from '../hooks/useCases.js';
import { useToast } from '../context/ToastContext.jsx';
import { fmtDate8 } from '../utils/format.js';
import { moduleTone } from '../utils/tones.js';
import { Pill, EmptyRow, LoadingRow } from '../components/DataTable.jsx';

const normKpi = (k) => (k || '').trim() || 'TANPA KATEGORI';

// Normalisasi nama PIC: abaikan spasi & kapital ("Rama", "RAMA", " rama " -> "rama")
const normPic = (v) => (v || '').trim().toLowerCase();

// Normalisasi tanggal ke yyyyMMdd untuk perbandingan string.
// Menerima: yyyyMMdd, yyyy-MM-dd (+ ISO datetime), dd/MM/yyyy, dd-MM-yyyy.
function normDate8(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  if (/^\d{8}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmy) return `${dmy[3]}${dmy[2].padStart(2, '0')}${dmy[1].padStart(2, '0')}`;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) return digits;
  return s.replace(/-/g, '');
}

const MAIN_KPIS = ['• AUDIT', '• GENERAL REQUEST', '• SPECIAL REQUEST'];

const KPI_BADGE = {
  '• AUDIT': 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
  '• GENERAL REQUEST': 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
  '• SPECIAL REQUEST': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  AUDIT: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
  'ON-DEMAND': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  'CUSTOM DEV': 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  '• SYSTEM UPDATE': 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  'TANPA KATEGORI': 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
};

function KpiBadge({ k }) {
  return (
    <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 whitespace-nowrap ${KPI_BADGE[k] || 'bg-slate-100 text-slate-500 dark:text-slate-400 border-slate-200'}`}>
      {k}
    </span>
  );
}

// Geser tanggal ISO (yyyy-MM-dd) sejauh N hari — untuk preset cepat
function shiftISO(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function FilterField({ label, icon, children }) {
  return (
    <div className="min-w-0">
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" aria-hidden="true">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

function defaultDates(cases) {
  const valid = cases.map((c) => normDate8(c.dateIssue)).filter((d) => /^\d{8}$/.test(d)).sort();
  if (!valid.length) return { from: '', to: '' };
  const max = valid[valid.length - 1];
  const maxDt = new Date(`${max.slice(0, 4)}-${max.slice(4, 6)}-${max.slice(6, 8)}`);
  const minDt = new Date(maxDt);
  minDt.setDate(minDt.getDate() - 6);
  const toIso = (dt) => dt.toISOString().slice(0, 10);
  return { from: toIso(minDt), to: toIso(maxDt) };
}

export default function HrReportPage() {
  const { notify } = useToast();
  const { cases: allCases, loading } = useCases();
  const extraKpis = useMemo(
    () => [...new Set(allCases.map((c) => normKpi(c.groupKpi)).filter((k) => k && !MAIN_KPIS.includes(k)))].sort(),
    [allCases]
  );
  const KPI_COLS = [...MAIN_KPIS, ...extraKpis];
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pic, setPic] = useState('');

  // Set rentang default (7 hari terakhir data) begitu data backend tiba
  useEffect(() => {
    if (allCases.length && !from && !to) {
      const d = defaultDates(allCases);
      setFrom(d.from);
      setTo(d.to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCases]);

  // Daftar PIC unik (dedup case-insensitive: "Rama"/"RAMA"/" rama " jadi satu opsi)
  const picDisplay = useMemo(() => {
    const m = new Map();
    allCases.forEach((c) => {
      const raw = (c.assignTo || '').trim();
      if (!raw) return;
      const k = raw.toLowerCase();
      if (!m.has(k)) m.set(k, raw);
    });
    return m;
  }, [allCases]);

  const pics = useMemo(
    () => [...picDisplay.values()].sort((a, b) => a.localeCompare(b)),
    [picDisplay]
  );

  const filtered = useMemo(() => {
    const f = from.replace(/-/g, '');
    const t = to.replace(/-/g, '');
    const q = normPic(pic);
    return allCases.filter((c) => {
      const d = normDate8(c.dateIssue);
      return (!f || d >= f) && (!t || d <= t) && (!q || normPic(c.assignTo) === q);
    });
  }, [from, to, pic, allCases]);

  const generatedAt = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const rangeLabel = from || to
    ? `${from ? fmtDate8(from.replace(/-/g, '')) : 'Awal'} — ${to ? fmtDate8(to.replace(/-/g, '')) : 'Akhir'}`
    : 'Semua tanggal';
  const reportPeriod = rangeLabel + (pic ? ` · PIC: ${pic}` : '');

  // Tanggal terbaru di data — acuan preset cepat (7/30 hari, bulan ini)
  const maxISO = useMemo(() => {
    const valid = allCases.map((c) => normDate8(c.dateIssue)).filter((d) => /^\d{8}$/.test(d)).sort();
    if (!valid.length) return '';
    const max = valid[valid.length - 1];
    return `${max.slice(0, 4)}-${max.slice(4, 6)}-${max.slice(6, 8)}`;
  }, [allCases]);

  function applyPreset(kind) {
    if (!maxISO) return;
    if (kind === '7') {
      setFrom(shiftISO(maxISO, -6));
      setTo(maxISO);
    } else if (kind === '30') {
      setFrom(shiftISO(maxISO, -29));
      setTo(maxISO);
    } else if (kind === 'month') {
      setFrom(`${maxISO.slice(0, 7)}-01`);
      setTo(maxISO);
    }
  }

  const activePreset =
    from && to && maxISO && to === maxISO
      ? from === shiftISO(maxISO, -6)
        ? '7'
        : from === shiftISO(maxISO, -29)
          ? '30'
          : from === `${maxISO.slice(0, 7)}-01`
            ? 'month'
            : ''
      : '';

  /* Rekapitulasi */
  const { byPic, picList, grand, grandTotal } = useMemo(() => {
    const byPic = {};
    filtered.forEach((c) => {
      // Kelompokkan varian kapital yang sama ("Rama"/"RAMA") ke satu baris rekap
      const raw = (c.assignTo || '').trim();
      const p = picDisplay.get(normPic(raw)) || raw || 'UNKNOWN';
      if (!byPic[p]) byPic[p] = {};
      const k = normKpi(c.groupKpi);
      byPic[p][k] = (byPic[p][k] || 0) + 1;
    });
    const picList = Object.keys(byPic).sort();
    const grand = {};
    let grandTotal = 0;
    KPI_COLS.forEach((k) => {
      grand[k] = picList.reduce((s, p) => s + (byPic[p][k] || 0), 0);
      grandTotal += grand[k];
    });
    return { byPic, picList, grand, grandTotal };
  }, [filtered, picDisplay]);

  const detailRows = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const pa = normPic(a.assignTo);
        const pb = normPic(b.assignTo);
        return pa.localeCompare(pb) || normDate8(a.dateIssue).localeCompare(normDate8(b.dateIssue)) || ((+a.no || 0) - (+b.no || 0));
      }),
    [filtered]
  );

  function exportCSV() {
    const headers = ['ASSIGN TO', 'DATE ISSUE', 'CLIENT', 'MODULE', 'SUB-MODULE', 'ISSUE', 'GROUP KPI'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...filtered.map((c) =>
        [c.assignTo, c.dateIssue, c.client, c.module, c.subModule, c.issue, normKpi(c.groupKpi)].map(esc).join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hr-report.csv';
    a.click();
    URL.revokeObjectURL(url);
    notify(`Export ${filtered.length} tiket HR berhasil diunduh.`, 'success');
  }

  const dateCls =
    'block w-full min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 transition [color-scheme:light] dark:[color-scheme:dark]';

  const presetBtn = (active) =>
    `min-h-[44px] inline-flex items-center text-xs font-bold px-3.5 py-2 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
      active
        ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-600/25'
        : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
    }`;

// R-31: reveal sekali saat kartu masuk viewport = orientasi scroll (MOTION 2).
function Reveal({ children, className = '' }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px' }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

  return (
    <div className="page">
      {/* Filter */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <FilterField label="Tanggal Dari" icon={<CalendarIcon />}>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="Tanggal dari"
                  className={dateCls}
                />
              </FilterField>
              <FilterField label="Tanggal Sampai" icon={<CalendarIcon />}>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="Tanggal sampai"
                  className={dateCls}
                />
              </FilterField>
              <FilterField label="Nama PIC" icon={<UserIcon />}>
                <select
                  value={pic}
                  onChange={(e) => setPic(e.target.value)}
                  aria-label="Nama PIC"
                  className={dateCls}
                >
                  <option value="">— Semua PIC —</option>
                  {pics.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </FilterField>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">Cepat:</span>
              {[
                { id: '7', label: '7 Hari' },
                { id: '30', label: '30 Hari' },
                { id: 'month', label: 'Bulan Ini' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  aria-pressed={activePreset === p.id}
                  className={presetBtn(activePreset === p.id)}
                >
                  {p.label}
                </button>
              ))}
              <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />
              <button
                onClick={() => { setPic(''); setFrom(''); setTo(''); }}
                className="min-h-[44px] inline-flex items-center text-xs font-bold text-slate-500 dark:text-slate-300 px-3.5 py-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Reset
              </button>
              <button
                onClick={exportCSV}
                className="min-h-[44px] inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-3.5 py-2 rounded-full transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
          {/* Ringkasan periode */}
          <div className="shrink-0 xl:w-64 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 p-4 flex xl:flex-col flex-row flex-wrap items-center xl:items-stretch gap-3">
            <div className="min-w-0 flex-1 xl:flex-none">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Periode Laporan</p>
              <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">{rangeLabel}</p>
              {pic && (
                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  PIC: <span className="text-brand-600 dark:text-brand-300">{pic}</span>
                </p>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 rounded-full px-3 py-1.5 tabular-nums">
              {filtered.length.toLocaleString('id-ID')} ticket
            </span>
          </div>
        </div>
      </Reveal>

      {/* Report paper */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Header laporan */}
        <div className="px-5 sm:px-8 py-6 border-b-2 border-slate-800 dark:border-slate-700">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">Revota — Customer Support</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">Support Div - HR Report</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Periode <span className="font-semibold text-slate-600 dark:text-slate-300">{reportPeriod}</span> · Dibuat: {generatedAt}
          </p>
        </div>

        {/* Rekapitulasi */}
        <div>
          <div className="px-6 py-4 bg-slate-800 dark:bg-slate-950 text-white">
            <h3 className="font-bold text-sm">REKAPITULASI PERFORMANCE GROUP KPI</h3>
            <p className="text-[11px] text-slate-300 mt-0.5">Laporan komprehensif berdasarkan tim & kategori Group KPI</p>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            {/* R-31: kolom Assign To sticky agar matriks tetap terbaca saat geser di HP */}
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-2.5 text-left sticky left-0 bg-slate-100 dark:bg-slate-800">Assign To</th>
                  {KPI_COLS.map((k) => (
                    <th key={k} className="px-3 py-2.5 text-center" title={k}>
                      {k.replace('• ', '').replace('REQUEST', 'REQ.')}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center">Total Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {picList.map((p) => {
                  const total = KPI_COLS.reduce((s, k) => s + (byPic[p][k] || 0), 0);
                  return (
                    <tr key={p} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900">{p}</td>
                      {KPI_COLS.map((k) => (
                        <td key={k} className={`px-3 py-3 text-center tabular-nums ${byPic[p][k] ? 'font-semibold text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'}`}>
                          {byPic[p][k] || 0}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block min-w-[2rem] font-extrabold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-500/10 rounded-lg px-2 py-0.5 tabular-nums">
                          {total}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {loading ? (
                  <LoadingRow colSpan={KPI_COLS.length + 2} />
                ) : picList.length === 0 && (
                  <EmptyRow colSpan={KPI_COLS.length + 2} compact>Tidak ada data pada periode ini</EmptyRow>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white text-sm">
                  <td className="px-4 py-3 font-extrabold sticky left-0 bg-slate-800">TOTAL KESELURUHAN</td>
                  {KPI_COLS.map((k) => (
                    <td key={k} className="px-3 py-3 text-center font-bold">{grand[k]}</td>
                  ))}
                  <td className="px-4 py-3 text-center font-extrabold text-amber-300">{grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Reveal>

      {/* Detail Ticket — kartu terpisah agar ada jarak dari rekap */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div>
          <div className="px-5 sm:px-6 py-4 bg-brand-700 text-white">
            <h3 className="font-bold text-sm">LAPORAN DETAIL TICKET & ISSUE</h3>
            <p className="text-[11px] text-brand-200 mt-0.5">Data komprehensif log aktivitas per anggota tim</p>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="bg-brand-50 dark:bg-brand-500/10 text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300 border-b border-brand-100 dark:border-brand-500/20">
                  <th className="px-4 py-2.5 text-left sticky left-0 bg-brand-50 dark:bg-slate-900">Assign To</th>
                  <th className="px-4 py-2.5 text-left">Date Issue</th>
                  <th className="px-4 py-2.5 text-left">Client</th>
                  <th className="px-4 py-2.5 text-left">Module</th>
                  <th className="px-4 py-2.5 text-left">Sub-Module</th>
                  <th className="px-4 py-2.5 text-left">Issue</th>
                  <th className="px-4 py-2.5 text-left">Group KPI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {detailRows.map((c, idx) => (
                  <tr key={`${c.recordUuid || 'noid'}-${idx}`} className="hover:bg-brand-50/40 dark:hover:bg-slate-800 transition">
                    <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900">{(c.assignTo || '').trim() || '-'}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap text-xs tabular-nums">{fmtDate8(c.dateIssue)}</td>
                    <td className="px-4 py-2.5 font-extrabold text-slate-900 dark:text-white whitespace-nowrap">{c.client || '-'}</td>
                    <td className="px-4 py-2.5">
                      <Pill size="xs" tone={moduleTone(c.module)}>{c.module || '-'}</Pill>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.subModule || '-'}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-100 min-w-[220px]" title={c.issue}>{c.issue || '-'}</td>
                    <td className="px-4 py-2.5">
                      <KpiBadge k={normKpi(c.groupKpi)} />
                    </td>
                  </tr>
                ))}
                {loading ? (
                  <LoadingRow colSpan={7} />
                ) : detailRows.length === 0 && (
                  <EmptyRow colSpan={7}>Tidak ada ticket pada periode & filter ini</EmptyRow>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-wrap items-center gap-x-4 gap-y-1 justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Menampilkan {detailRows.length} dari {allCases.length} ticket{pic ? ` · PIC: ${pic}` : ''}</span>
            <span>Sumber: Google Sheets (sinkron)</span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
