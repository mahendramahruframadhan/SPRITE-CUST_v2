import { useEffect, useMemo, useState } from 'react';
import { useCases } from '../hooks/useCases.js';
import { useToast } from '../context/ToastContext.jsx';
import { fmtDate8, fmtMoney, statusMeta, prettyKey, fmtField } from '../utils/format.js';

const FILTER_DEFS = [
  { id: 'fKeyword', type: 'text', placeholder: 'Cari client / pic / issue...' },
  { id: 'fModule', type: 'select', key: 'module', label: 'Semua Modul' },
  { id: 'fStatus', type: 'select', key: 'status', label: 'Semua Status' },
  { id: 'fBilling', type: 'select', key: 'billingStatus', label: 'Semua Billing' },
  { id: 'fAssign', type: 'select', key: 'assignTo', label: 'Semua PIC' },
  { id: 'fChannel', type: 'select', key: 'channelTicket', label: 'Semua Channel' },
  { id: 'fSupportType', type: 'select', key: 'supportType', label: 'Semua Tipe Support' },
  { id: 'fDateFrom', type: 'date' },
  { id: 'fDateTo', type: 'date' },
];

const emptyFilters = () => ({
  fKeyword: '',
  fModule: '',
  fStatus: '',
  fBilling: '',
  fAssign: '',
  fChannel: '',
  fSupportType: '',
  fDateFrom: '',
  fDateTo: '',
});

export default function DataKasusPage() {
  const { notify } = useToast();
  const { cases: allCases, loading, error, reload } = useCases();
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [detail, setDetail] = useState(null); // kasus yang sedang dibuka
  const [spinning, setSpinning] = useState(false);

  const options = useMemo(() => {
    const o = {};
    FILTER_DEFS.filter((d) => d.type === 'select').forEach((d) => {
      o[d.id] = [...new Set(allCases.map((c) => c[d.key]).filter(Boolean))].sort();
    });
    return o;
  }, [allCases]);

  const filtered = useMemo(() => {
    const f = filters;
    const from = f.fDateFrom.replace(/-/g, '');
    const to = f.fDateTo.replace(/-/g, '');
    const kw = f.fKeyword.toLowerCase();
    return allCases.filter((c) => {
      const text = `${c.client} ${c.picName} ${c.issue} ${c.location} ${c.subModule}`.toLowerCase();
      const d = c.dateIssue;
      return (
        text.includes(kw) &&
        (!f.fModule || c.module === f.fModule) &&
        (!f.fStatus || c.status === f.fStatus) &&
        (!f.fBilling || c.billingStatus === f.fBilling) &&
        (!f.fAssign || c.assignTo === f.fAssign) &&
        (!f.fChannel || c.channelTicket === f.fChannel) &&
        (!f.fSupportType || c.supportType === f.fSupportType) &&
        (!from || d >= from) &&
        (!to || d <= to)
      );
    });
  }, [filters, allCases]);

  useEffect(() => setPage(1), [filters, pageSize]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  function refresh() {
    setSpinning(true);
    reload().finally(() => setSpinning(false));
  }

  function exportCSV() {
    const headers = [
      'NO', 'DATE ISSUE', 'START DATE', 'FINISH DATE', 'CLIENT', 'PIC NAME', 'MODULE',
      'SUB-MODULE', 'LOCATION', 'ISSUE', 'ASSIGN TO', 'STATUS', 'SUPPORT CATEGORY',
      'BILLING STATUS', 'BILLING CATEGORY', 'REF PRICE LIST', 'CHANNEL TICKET',
      'SUPPORT TYPE', 'CHARGES', 'COMPLETION NOTES', 'GROUP KPI', 'GROUP KPI DESC',
      'MONTH', 'WEEKNUM', 'RECORD_UUID',
    ];
    const keyMap = {
      NO: 'no', 'DATE ISSUE': 'dateIssue', 'START DATE': 'startDate', 'FINISH DATE': 'finishDate',
      CLIENT: 'client', 'PIC NAME': 'picName', MODULE: 'module', 'SUB-MODULE': 'subModule',
      LOCATION: 'location', ISSUE: 'issue', 'ASSIGN TO': 'assignTo', STATUS: 'status',
      'SUPPORT CATEGORY': 'supportCategory', 'BILLING STATUS': 'billingStatus',
      'BILLING CATEGORY': 'billingCategory', 'REF PRICE LIST': 'refPriceList',
      'CHANNEL TICKET': 'channelTicket', 'SUPPORT TYPE': 'supportType', CHARGES: 'charges',
      'COMPLETION NOTES': 'completionNotes', 'GROUP KPI': 'groupKpi', 'GROUP KPI DESC': 'groupKpiDesc',
      MONTH: 'month', WEEKNUM: 'weeknum', RECORD_UUID: 'recordUuid',
    };
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...filtered.map((c) => headers.map((h) => esc(c[keyMap[h]])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data-kasus-support.csv';
    a.click();
    URL.revokeObjectURL(url);
    notify(`Export ${filtered.length} kasus berhasil diunduh.`, 'success');
  }

  // nomor halaman dengan elipsis
  const pageNums = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) pageNums.push(i);
    else if (i === page - 3 || i === page + 3) pageNums.push('…');
  }

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 -mt-1">
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95"
        >
          <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Muat Ulang
        </button>
      </div>

      {/* Filters */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-3 text-xs text-rose-700 flex items-center justify-between">
          <span>Backend tidak terjangkau ({error}). Pastikan backend jalan di port 5005.</span>
          <button onClick={refresh} className="font-bold hover:underline">Coba lagi</button>
        </div>
      )}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {FILTER_DEFS.map((d) =>
          d.type === 'text' ? (
            <div key={d.id} className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder={d.placeholder}
                value={filters[d.id]}
                onChange={(e) => setFilters({ ...filters, [d.id]: e.target.value })}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>
          ) : d.type === 'select' ? (
            <select
              key={d.id}
              value={filters[d.id]}
              onChange={(e) => setFilters({ ...filters, [d.id]: e.target.value })}
              className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              <option value="">{d.label}</option>
              {options[d.id].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ) : (
            <input
              key={d.id}
              type="date"
              value={filters[d.id]}
              onChange={(e) => setFilters({ ...filters, [d.id]: e.target.value })}
              className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            />
          )
        )}
        <button
          onClick={() => setFilters(emptyFilters())}
          className="text-sm font-semibold text-slate-500 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          Reset Filter
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white">Daftar Kasus</h3>
          <span className="text-xs text-slate-400">
            {loading ? 'Memuat dari backend…' : `${filtered.length.toLocaleString('id-ID')} kasus ditemukan`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/70">
                <th className="px-6 py-3 font-semibold">No</th>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">PIC</th>
                <th className="px-4 py-3 font-semibold">Module</th>
                <th className="px-4 py-3 font-semibold">Sub</th>
                <th className="px-4 py-3 font-semibold">Lokasi</th>
                <th className="px-4 py-3 font-semibold">Issue</th>
                <th className="px-4 py-3 font-semibold">Assign</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Billing</th>
                <th className="px-4 py-3 font-semibold text-right">Tagihan</th>
                <th className="px-6 py-3 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pageItems.map((c) => {
                const s = statusMeta(c.status);
                return (
                  <tr key={c.recordUuid} className="even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-brand-50/50 dark:hover:bg-slate-800 transition">
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 tabular-nums">{c.no}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{fmtDate8(c.dateIssue)}</td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100">{c.client}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{c.picName || '-'}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium px-2 py-1 rounded-full">{c.module}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{c.subModule || '-'}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{c.location || '-'}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={c.issue}>{c.issue}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{c.assignTo || '-'}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{c.billingStatus || '-'}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-700 dark:text-slate-200 tabular-nums">{fmtMoney(c.charges)}</td>
                    <td className="px-6 py-3.5 text-center">
                      <button
                        onClick={() => setDetail(c)}
                        className="text-xs font-semibold text-brand-600 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 px-3 py-1.5 rounded-lg transition"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Tidak ada data yang cocok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Tampilkan</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value))}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 dark:text-slate-100"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>baris per halaman</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            {pageNums.map((n, i) =>
              n === '…' ? (
                <span key={`e-${i}`} className="px-2 text-slate-400">…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                    n === page
                      ? 'bg-brand-600 text-white'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {n}
                </button>
              )
            )}
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {detail && <CaseDetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ===== Modal Detail: semua kolom, tabel horizontal (scroll kiri → kanan) ===== */
function CaseDetailModal({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const s = statusMeta(item.status);
  const keys = Object.keys(item);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col animate-fade-in-fast">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">{item.client}</h3>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{item.issue}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-x-auto scrollbar-thin px-6 py-5">
          <div className="min-w-max">
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  {keys.map((k) => (
                    <th
                      key={k}
                      className="px-4 py-2 text-left align-top text-[11px] font-semibold uppercase tracking-wider text-slate-400 border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/70 min-w-[140px]"
                    >
                      {prettyKey(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {keys.map((k) => {
                    const v = fmtField(k, item[k]);
                    return (
                      <td
                        key={k}
                        className={`px-4 py-3 align-top border border-slate-100 dark:border-slate-800 whitespace-pre-wrap break-words min-w-[140px] ${
                          k === 'charges' ? 'text-right font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
                        } ${k === 'completionNotes' ? 'max-w-[320px]' : ''}`}
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 rounded-b-2xl">
          <p className="text-[11px] text-slate-400">
            RECORD_UUID: <span className="font-mono text-slate-600 dark:text-slate-300">{item.recordUuid}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
