import { useEffect, useMemo, useState } from 'react';
import { Line, Doughnut, Pie, Bar } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { fmtDate8, fmtMoney, statusMeta, prettyKey, fmtField } from '../utils/format.js';

const iso8now = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

export default function MockupPage() {
  const { cases, loading, reload } = useCases();
  const [filters, setFilters] = useState({ kw: '', module: '', status: '', assign: '', date: '' });
  const [detail, setDetail] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => stampNow());

  function stampNow() {
    const n = new Date();
    return (
      n.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' +
      n.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    );
  }
  function refresh() {
    setSpinning(true);
    reload().finally(() => {
      setSpinning(false);
      setLastUpdated(stampNow());
    });
  }

  const { modules, assignees, statuses, kpi } = useMemo(() => {
    const modules = [...new Set(cases.map((c) => c.module).filter(Boolean))].sort();
    const assignees = [...new Set(cases.map((c) => c.assignTo).filter(Boolean))].sort();
    const statuses = [...new Set(cases.map((c) => c.status).filter(Boolean))].sort();

    const total = cases.length;
    const done = cases.filter((c) => c.status.toUpperCase() === 'DONE').length;
    const open = total - done;
    const totalCharge = cases.reduce((a, c) => a + (+c.charges || 0), 0);
    const resolved = cases.filter((c) => c.startDate && c.finishDate && c.status.toUpperCase() === 'DONE');
    const avgDays = resolved.length
      ? (
          resolved.reduce((a, c) => {
            const s = +new Date(`${c.startDate.slice(0, 4)}-${c.startDate.slice(4, 6)}-${c.startDate.slice(6, 8)}`);
            const f = +new Date(`${c.finishDate.slice(0, 4)}-${c.finishDate.slice(4, 6)}-${c.finishDate.slice(6, 8)}`);
            return a + (f - s) / 86400000;
          }, 0) / resolved.length
        ).toFixed(1)
      : '0';
    const todayCases = cases.filter((c) => c.dateIssue === iso8now()).length;

    const kpi = [
      { t: 'Total Kasus', v: total.toLocaleString('id-ID'), sub: 'dari Google Sheets', color: 'brand' },
      { t: 'Selesai', v: done.toLocaleString('id-ID'), sub: `${avgDays} hari rata-rata penyelesaian`, color: 'emerald' },
      { t: 'Dalam Proses', v: open.toLocaleString('id-ID'), sub: 'status belum DONE', color: 'amber' },
      { t: 'Total Tagihan', v: fmtMoney(totalCharge), sub: `${todayCases} kasus masuk hari ini`, color: 'brand' },
    ];
    return { modules, assignees, statuses, kpi };
  }, [cases]);

  const charts = useMemo(() => {
    const weekCounts = {};
    cases.forEach((c) => { weekCounts[c.weeknum] = (weekCounts[c.weeknum] || 0) + 1; });
    const sortedWeeks = Object.keys(weekCounts).sort((a, b) => +a - +b);
    const trend = {
      labels: sortedWeeks.map((w) => 'Minggu ' + w),
      datasets: [{
        label: 'Jumlah Kasus',
        data: sortedWeeks.map((w) => weekCounts[w]),
        borderColor: '#4a4fe9',
        backgroundColor: 'rgba(74,79,233,0.08)',
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: 4,
      }],
    };

    const modCounts = {};
    cases.forEach((c) => { modCounts[c.module] = (modCounts[c.module] || 0) + 1; });
    const modLabels = Object.keys(modCounts).sort((a, b) => modCounts[b] - modCounts[a]);
    const module = {
      labels: modLabels,
      datasets: [{
        data: modLabels.map((l) => modCounts[l]),
        backgroundColor: ['#4a4fe9', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#14b8a6', '#f97316', '#6366f1'],
        borderWidth: 0,
      }],
    };

    const billCounts = {};
    cases.forEach((c) => { const b = c.billingStatus || 'Tidak ada'; billCounts[b] = (billCounts[b] || 0) + 1; });
    const billLabels = Object.keys(billCounts);
    const billing = {
      labels: billLabels,
      datasets: [{
        data: billLabels.map((l) => billCounts[l]),
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#94a3b8'],
        borderWidth: 0,
      }],
    };

    const picCounts = {};
    cases.forEach((c) => { if (c.assignTo) picCounts[c.assignTo] = (picCounts[c.assignTo] || 0) + 1; });
    const picLabels = Object.keys(picCounts).sort((a, b) => picCounts[b] - picCounts[a]).slice(0, 6);
    const pic = {
      labels: picLabels,
      datasets: [{ label: 'Kasus', data: picLabels.map((l) => picCounts[l]), backgroundColor: '#4a4fe9', borderRadius: 6 }],
    };
    return { trend, module, billing, pic };
  }, [cases]);

  const filtered = useMemo(() => {
    const kw = filters.kw.toLowerCase();
    const dt = filters.date.replace(/-/g, '');
    return cases.filter((c) => {
      const text = `${c.client} ${c.picName} ${c.issue} ${c.location} ${c.subModule}`.toLowerCase();
      return (
        (!kw || text.includes(kw)) &&
        (!filters.module || c.module === filters.module) &&
        (!filters.status || c.status === filters.status) &&
        (!filters.assign || c.assignTo === filters.assign) &&
        (!dt || c.dateIssue === dt)
      );
    });
  }, [filters, cases]);

  const axisOpt = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
    },
  };
  const legendRight = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } },
  };
  const legendBottom = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } },
  };

  const KPI_STYLE = {
    brand: { text: 'text-brand-600', box: 'bg-brand-50 text-brand-600' },
    emerald: { text: 'text-emerald-600', box: 'bg-emerald-50 text-emerald-500' },
    amber: { text: 'text-amber-600', box: 'bg-amber-50 text-amber-500' },
  };

  const setF = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div className="px-8 py-6 space-y-6">
      {/* Topbar */}
      <div className="flex items-center justify-end gap-3 -mt-1">
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Sinkron terakhir: <span className="font-semibold text-slate-700">{lastUpdated}</span>
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

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpi.map((d, i) => (
          <div key={d.t} className="bg-white rounded-2xl border border-slate-200 p-5 animate-fade-in-fast" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{d.t}</p>
                <p className={`mt-2 text-3xl font-extrabold ${KPI_STYLE[d.color].text}`}>{d.v}</p>
                <p className="mt-1 text-xs text-slate-400 font-medium">{d.sub}</p>
              </div>
              <div className={`w-11 h-11 rounded-xl ${KPI_STYLE[d.color].box} flex items-center justify-center`}>
                <KpiIcon color={d.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900">Tren Kasus per Minggu</h3>
            <p className="text-xs text-slate-400">Berdasarkan nomor minggu pada sheet</p>
          </div>
          <div className="h-72">
            <Line data={charts.trend} options={axisOpt} />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900">Distribusi Modul</h3>
            <p className="text-xs text-slate-400">Kasus berdasarkan modul</p>
          </div>
          <div className="h-72">
            <Doughnut data={charts.module} options={legendRight} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900">Status Billing</h3>
            <p className="text-xs text-slate-400">FREE / MONTHLY / ON-CALL</p>
          </div>
          <div className="h-64">
            <Pie data={charts.billing} options={legendBottom} />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900">Top PIC / Assign To</h3>
            <p className="text-xs text-slate-400">Jumlah kasus ditangani per petugas</p>
          </div>
          <div className="h-64">
            <Bar data={charts.pic} options={axisOpt} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-end gap-3">
          <div>
            <h3 className="font-bold text-slate-900">Daftar Kasus Dukungan</h3>
            <p className="text-xs text-slate-400">Klik baris untuk lihat detail lengkap</p>
          </div>
          <div className="ml-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 w-full xl:w-auto">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Cari client / pic / issue..."
                value={filters.kw}
                onChange={setF('kw')}
                className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 w-full bg-white"
              />
            </div>
            <select value={filters.module} onChange={setF('module')} className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white">
              <option value="">Semua Modul</option>
              {modules.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.status} onChange={setF('status')} className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white">
              <option value="">Semua Status</option>
              {statuses.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.assign} onChange={setF('assign')} className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white">
              <option value="">Semua PIC</option>
              {assignees.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input type="date" value={filters.date} onChange={setF('date')} className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-6 py-3 font-semibold">No</th>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">PIC</th>
                <th className="px-4 py-3 font-semibold">Modul</th>
                <th className="px-4 py-3 font-semibold">Sub Modul</th>
                <th className="px-4 py-3 font-semibold">Lokasi</th>
                <th className="px-4 py-3 font-semibold">Issue</th>
                <th className="px-4 py-3 font-semibold">Assign To</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Billing</th>
                <th className="px-6 py-3 font-semibold text-right">Tagihan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const s = statusMeta(c.status);
                return (
                  <tr key={c.recordUuid} onClick={() => setDetail(c)} className="hover:bg-brand-50/40 cursor-pointer transition">
                    <td className="px-6 py-3.5 text-slate-500">{c.no}</td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{fmtDate8(c.dateIssue)}</td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800">{c.client}</td>
                    <td className="px-4 py-3.5 text-slate-500">{c.picName || '-'}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-1 rounded-full">{c.module}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{c.subModule || '-'}</td>
                    <td className="px-4 py-3.5 text-slate-500">{c.location || '-'}</td>
                    <td className="px-4 py-3.5 text-slate-600 max-w-xs truncate" title={c.issue}>{c.issue}</td>
                    <td className="px-4 py-3.5 text-slate-500">{c.assignTo || '-'}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{c.billingStatus || '-'}</td>
                    <td className="px-6 py-3.5 text-right font-medium text-slate-700">{fmtMoney(c.charges)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Tidak ada data yang cocok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 text-xs text-slate-400">
          Menampilkan {filtered.length} dari {cases.length} kasus
        </div>
      </div>

      {detail && <MockupDetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function KpiIcon({ color }) {
  const d =
    color === 'emerald'
      ? 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
      : color === 'amber'
        ? 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'
        : 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.191-2.074-.571a1.918 1.918 0 01-1.816-1.816A2.487 2.487 0 0112 7.5a2.487 2.487 0 012.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/* Modal detail mockup — grid 2 kolom seperti aslinya */
function MockupDetailModal({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const s = statusMeta(item.status);
  const fields = [
    ['No', item.no],
    ['Tanggal Issue', fmtDate8(item.dateIssue)],
    ['Start Date', fmtDate8(item.startDate)],
    ['Finish Date', fmtDate8(item.finishDate)],
    ['PIC Name', item.picName || '-'],
    ['Assign To', item.assignTo || '-'],
    ['Module', item.module || '-'],
    ['Sub Module', item.subModule || '-'],
    ['Location', item.location || '-'],
    ['Support Category', item.supportCategory || '-'],
    ['Billing Status', item.billingStatus || '-'],
    ['Billing Category', item.billingCategory || '-'],
    ['Channel Ticket', item.channelTicket || '-'],
    ['Charges', fmtMoney(item.charges)],
    ['Completion Notes', item.completionNotes || '-'],
    ['Week', item.weeknum || '-'],
    ['Month', item.month || '-'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in-fast">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-slate-900">{item.client}</h3>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{item.issue}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {fields.map(([k, v]) => (
            <div key={k}>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{k}</p>
              <p className={`mt-0.5 text-slate-800 ${k === 'Completion Notes' ? 'leading-relaxed' : ''}`}>{v}</p>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <p className="text-[11px] text-slate-400">
            RECORD_UUID: <span className="font-mono text-slate-600">{item.recordUuid}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
