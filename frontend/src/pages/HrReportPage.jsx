import { useMemo, useState } from 'react';
import { allCases } from '../data/cases.js';
import { fmtDate8 } from '../utils/format.js';

const normKpi = (k) => (k || '').trim() || 'TANPA KATEGORI';

const MAIN_KPIS = ['• AUDIT', '• GENERAL REQUEST', '• SPECIAL REQUEST'];
const extraKpis = [...new Set(allCases.map((c) => normKpi(c.groupKpi)).filter((k) => k && !MAIN_KPIS.includes(k)))].sort();
const KPI_COLS = [...MAIN_KPIS, ...extraKpis];

const KPI_BADGE = {
  '• AUDIT': 'bg-violet-50 text-violet-600 border-violet-200',
  '• GENERAL REQUEST': 'bg-sky-50 text-sky-600 border-sky-200',
  '• SPECIAL REQUEST': 'bg-amber-50 text-amber-600 border-amber-200',
  AUDIT: 'bg-violet-50 text-violet-600 border-violet-200',
  'ON-DEMAND': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'CUSTOM DEV': 'bg-rose-50 text-rose-600 border-rose-200',
  '• SYSTEM UPDATE': 'bg-slate-100 text-slate-500 border-slate-200',
  'TANPA KATEGORI': 'bg-slate-100 text-slate-400 border-slate-200',
};

function KpiBadge({ k }) {
  return (
    <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 whitespace-nowrap ${KPI_BADGE[k] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
      {k}
    </span>
  );
}

function defaultDates() {
  const valid = allCases.map((c) => String(c.dateIssue)).filter((d) => /^\d{8}$/.test(d)).sort();
  if (!valid.length) return { from: '', to: '' };
  const max = valid[valid.length - 1];
  const maxDt = new Date(`${max.slice(0, 4)}-${max.slice(4, 6)}-${max.slice(6, 8)}`);
  const minDt = new Date(maxDt);
  minDt.setDate(minDt.getDate() - 6);
  const toIso = (dt) => dt.toISOString().slice(0, 10);
  return { from: toIso(minDt), to: toIso(maxDt) };
}

export default function HrReportPage() {
  const init = useMemo(defaultDates, []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [pic, setPic] = useState('');

  const pics = useMemo(
    () => [...new Set(allCases.map((c) => (c.assignTo || '').trim()).filter(Boolean))].sort(),
    []
  );

  const filtered = useMemo(() => {
    const f = from.replace(/-/g, '');
    const t = to.replace(/-/g, '');
    return allCases.filter((c) => {
      const d = String(c.dateIssue);
      return (!f || d >= f) && (!t || d <= t) && (!pic || (c.assignTo || '').trim() === pic);
    });
  }, [from, to, pic]);

  const generatedAt = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const periodLabel = from || to ? `${from || 'Awal'} s.d. ${to || 'Akhir'}` : 'Semua tanggal';
  const reportPeriod = `${fmtDate8(from.replace(/-/g, ''))} — ${fmtDate8(to.replace(/-/g, ''))}` + (pic ? ` · PIC: ${pic}` : '');

  /* Rekapitulasi */
  const { byPic, picList, grand, grandTotal } = useMemo(() => {
    const byPic = {};
    filtered.forEach((c) => {
      const p = (c.assignTo || '').trim() || 'UNKNOWN';
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
  }, [filtered]);

  const detailRows = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const pa = (a.assignTo || '').trim();
        const pb = (b.assignTo || '').trim();
        return pa.localeCompare(pb) || String(a.dateIssue).localeCompare(String(b.dateIssue)) || ((+a.no || 0) - (+b.no || 0));
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
  }

  const dateCls =
    'block text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-amber-50/60';

  return (
    <div className="px-8 py-6 space-y-5">
      {/* Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3 animate-fade-in-fast">
        <div>
          <label className="text-xs font-semibold text-slate-500">Date From</label>
          <div className="mt-1 flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateCls} />
            <span className="text-[10px] text-slate-400 font-mono">&lt;&lt;&lt; yyyyMMdd</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Date Until</label>
          <div className="mt-1 flex items-center gap-2">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateCls} />
            <span className="text-[10px] text-slate-400 font-mono">&lt;&lt;&lt; yyyyMMdd</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">PIC Name</label>
          <div className="mt-1 flex items-center gap-2">
            <select value={pic} onChange={(e) => setPic(e.target.value)} className={`${dateCls} min-w-[180px]`}>
              <option value="">— Semua PIC —</option>
              {pics.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <span className="text-[10px] text-slate-400 font-mono">&lt;&lt;&lt; input name</span>
          </div>
        </div>
        <button
          onClick={() => setPic('')}
          className="text-sm font-semibold text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100 transition"
        >
          Reset
        </button>
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
        <div className="ml-auto text-xs text-slate-400">
          Periode: <span className="font-semibold text-slate-600">{periodLabel}</span>
        </div>
      </div>

      {/* Report paper */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in-fast" style={{ animationDelay: '.08s' }}>
        {/* Header laporan */}
        <div className="px-8 py-6 border-b-2 border-slate-800">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">Revota — Customer Support</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Support Div - HR Report</h1>
          <p className="text-xs text-slate-400 mt-1">
            Periode <span className="font-semibold text-slate-600">{reportPeriod}</span> · Dibuat: {generatedAt}
          </p>
        </div>

        {/* Rekapitulasi */}
        <div className="border-b border-slate-200">
          <div className="px-6 py-4 bg-slate-800 text-white">
            <h3 className="font-bold text-sm">📊 REKAPITULASI PERFORMANCE GROUP KPI</h3>
            <p className="text-[11px] text-slate-300 mt-0.5">Laporan komprehensif berdasarkan tim & kategori Group KPI</p>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left">Assign To</th>
                  {KPI_COLS.map((k) => (
                    <th key={k} className="px-3 py-2.5 text-center" title={k}>
                      {k.replace('• ', '').replace('REQUEST', 'REQ.')}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center">Total Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {picList.map((p) => {
                  const total = KPI_COLS.reduce((s, k) => s + (byPic[p][k] || 0), 0);
                  return (
                    <tr key={p} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-bold text-slate-800">{p}</td>
                      {KPI_COLS.map((k) => (
                        <td key={k} className={`px-3 py-3 text-center ${byPic[p][k] ? 'font-semibold text-slate-700' : 'text-slate-300'}`}>
                          {byPic[p][k] || 0}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block min-w-[2rem] font-extrabold text-brand-700 bg-brand-50 rounded-lg px-2 py-0.5">
                          {total}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {picList.length === 0 && (
                  <tr>
                    <td colSpan={KPI_COLS.length + 2} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Tidak ada data pada periode ini
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white text-sm">
                  <td className="px-4 py-3 font-extrabold">TOTAL KESELURUHAN</td>
                  {KPI_COLS.map((k) => (
                    <td key={k} className="px-3 py-3 text-center font-bold">{grand[k]}</td>
                  ))}
                  <td className="px-4 py-3 text-center font-extrabold text-amber-300">{grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Detail Ticket */}
        <div>
          <div className="px-6 py-4 bg-brand-700 text-white">
            <h3 className="font-bold text-sm">📑 LAPORAN DETAIL TICKET & ISSUE</h3>
            <p className="text-[11px] text-brand-200 mt-0.5">Data komprehensif log aktivitas per anggota tim</p>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-50 text-[10px] font-bold uppercase tracking-wider text-brand-700 border-b border-brand-100">
                  <th className="px-4 py-2.5 text-left">Assign To</th>
                  <th className="px-4 py-2.5 text-left">Date Issue</th>
                  <th className="px-4 py-2.5 text-left">Client</th>
                  <th className="px-4 py-2.5 text-left">Module</th>
                  <th className="px-4 py-2.5 text-left">Sub-Module</th>
                  <th className="px-4 py-2.5 text-left">Issue</th>
                  <th className="px-4 py-2.5 text-left">Group KPI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailRows.map((c) => (
                  <tr key={c.recordUuid} className="hover:bg-brand-50/40 transition">
                    <td className="px-4 py-2.5 font-bold text-slate-800 whitespace-nowrap">{(c.assignTo || '').trim() || '-'}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">{fmtDate8(c.dateIssue)}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{c.client || '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 whitespace-nowrap">{c.module || '-'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{c.subModule || '-'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 min-w-[220px]" title={c.issue}>{c.issue || '-'}</td>
                    <td className="px-4 py-2.5">
                      <KpiBadge k={normKpi(c.groupKpi)} />
                    </td>
                  </tr>
                ))}
                {detailRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                      Tidak ada ticket pada periode & filter ini
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-400">
            <span>Menampilkan {detailRows.length} ticket</span>
            <span>Sumber: Google Sheets (sinkron)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
