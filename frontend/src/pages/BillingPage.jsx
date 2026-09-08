import { useEffect, useMemo, useState } from 'react';
import { Doughnut, Bar, Pie } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { fmtDate8 } from '../utils/format.js';
import { useAuditState } from '../hooks/useAuditState.js';

const BILL_BADGE = {
  FREE: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'ON-CALL': 'bg-amber-50 text-amber-600 border-amber-200',
  MONTHLY: 'bg-sky-50 text-sky-600 border-sky-200',
};

export default function BillingPage() {
  const { auditActions, caseAuditStatus, updateAudit, addAction, removeAction } = useAuditState();
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
      const a = caseAuditStatus[c.recordUuid] || 'BELUM DIVALIDASI';
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
    { t: 'Total Kasus', v: filtered.length.toLocaleString('id-ID'), sub: 'dalam periode', color: 'text-brand-600' },
    { t: 'Total Tagihan', v: fmtMoney(stats.totalAmount), sub: 'ON-CALL + MONTHLY', color: 'text-emerald-600' },
    { t: 'ON-CALL', v: fmtMoney(stats.oncall.amount), sub: `${stats.oncall.count} kasus`, color: 'text-amber-600' },
    { t: 'MONTHLY', v: fmtMoney(stats.monthly.amount), sub: `${stats.monthly.count} kasus`, color: 'text-violet-600' },
    {
      t: 'Valid — Siap Invoice',
      v: (stats.auditCounts['VALID - SIAP INVOICE'] || 0).toLocaleString('id-ID'),
      sub: `${stats.auditCounts['PERLU DICEK ULANG'] || 0} kasus perlu dicek ulang`,
      color: 'text-rose-600',
    },
  ];

  const distData = {
    labels: ['ON-CALL', 'MONTHLY', 'FREE'],
    datasets: [{
      data: [stats.oncall.count, stats.monthly.count, stats.free.count],
      backgroundColor: ['#f59e0b', '#8b5cf6', '#0ea5e9'],
      borderWidth: 0,
    }],
  };
  const amountData = {
    labels: ['ON-CALL', 'MONTHLY', 'FREE'],
    datasets: [{
      label: 'Tagihan (Rp)',
      data: [stats.oncall.amount, stats.monthly.amount, stats.free.amount],
      backgroundColor: ['#f59e0b', '#8b5cf6', '#0ea5e9'],
      borderRadius: 6,
    }],
  };
  const auditData = {
    labels: auditActions,
    datasets: [{
      data: auditActions.map((a) => stats.auditCounts[a] || 0),
      backgroundColor: ['#94a3b8', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4'],
      borderWidth: 0,
    }],
  };

  const legendBottom = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } },
  };
  const legendRight = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } } },
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

  function exportData() {
    const headers = ['NO', 'DATE ISSUE', 'CLIENT', 'PIC NAME', 'MODULE', 'BILLING STATUS', 'BILLING CATEGORY', 'SUPPORT TYPE', 'CHARGES', 'STATUS VALIDASI', 'COMPLETION NOTES', 'RECORD_UUID'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...catItems.map((c) =>
        [
          c.no, c.dateIssue, c.client, c.picName, c.module, c.billingStatus, c.billingCategory,
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
      softIcon: 'bg-amber-100 text-amber-600',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />,
    },
    MONTHLY: {
      gradient: 'from-sky-500 to-blue-600',
      softIcon: 'bg-sky-100 text-sky-600',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
    },
    FREE: {
      gradient: 'from-emerald-500 to-teal-600',
      softIcon: 'bg-emerald-100 text-emerald-600',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
    },
  };

  const filterCls =
    'mt-1 block text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white';

  return (
    <div className="px-8 py-6 space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 -mt-1">
        <button
          onClick={() => setMasterOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Master Status Validasi
        </button>
        <button
          onClick={exportData}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
        {kpi.map((d, i) => (
          <div key={d.t} className="bg-white rounded-2xl border border-slate-200 p-5 animate-fade-in-fast" style={{ animationDelay: `${i * 0.05}s` }}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{d.t}</p>
            <p className={`mt-2 text-2xl font-extrabold ${d.color}`}>{d.v}</p>
            <p className="mt-1 text-xs text-slate-400 font-medium">{d.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <ChartPanel title="Distribusi Billing" desc="Jumlah kasus per kategori billing">
          <Doughnut data={distData} options={legendBottom} />
        </ChartPanel>
        <ChartPanel title="Total Tagihan per Kategori" desc="Dalam Rupiah">
          <Bar
            data={amountData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f1f5f9' } } },
            }}
          />
        </ChartPanel>
        <ChartPanel title="Distribusi Status Validasi" desc="Status validasi kasus berbayar">
          <Pie data={auditData} options={legendRight} />
        </ChartPanel>
      </div>

      {/* Tab Kategori Billing */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kategori Billing</p>
          <p className="text-xs text-slate-400">
            Total <span className="font-bold text-slate-700">{fmtMoney((catStats[cat] || {}).amount || 0)}</span>
            {' '}• {((catStats[cat] || {}).count || 0).toLocaleString('id-ID')} kasus {cat}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-100 rounded-xl p-1.5">
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
                    : 'text-slate-500 hover:bg-white hover:shadow-sm'
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
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Date From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={filterCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Date Until</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={filterCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Brand</label>
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
              className="text-sm font-semibold text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100 transition"
            >
              Reset
            </button>
            <div className="ml-auto text-xs text-slate-400">
              Periode:{' '}
              <span className="font-semibold text-slate-600">
                {from || to ? `${from || 'Awal'} s.d. ${to || 'Akhir'}` : 'Semua tanggal'}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <h3 className="font-bold text-slate-900">Detail Kasus — {cat}</h3>
          <div className="ml-auto relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Cari kasus..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-6 py-3 font-semibold">No</th>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Brand</th>
                <th className="px-4 py-3 font-semibold">PIC</th>
                <th className="px-4 py-3 font-semibold">Module</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Billing Category</th>
                <th className="px-4 py-3 font-semibold">Support Type</th>
                <th className="px-4 py-3 font-semibold text-right">Charges</th>
                <th className="px-4 py-3 font-semibold">Status Validasi</th>
                <th className="px-6 py-3 font-semibold">Completion Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map((c) => (
                <tr key={c.recordUuid} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-3.5 text-slate-400">{c.no}</td>
                  <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{fmtDate8(c.dateIssue)}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">{c.client}</td>
                  <td className="px-4 py-3.5 text-slate-500">{c.picName || '-'}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-1 rounded-full">{c.module}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[11px] font-bold border rounded-full px-2.5 py-1 ${BILL_BADGE[c.billingStatus] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {c.billingStatus || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{c.billingCategory || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-500">{c.supportType || '-'}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-slate-700">{fmtMoney(c.charges)}</td>
                  <td className="px-4 py-3.5">
                    {c.billingStatus !== 'FREE' ? (
                      <select
                        value={caseAuditStatus[c.recordUuid] || 'BELUM DIVALIDASI'}
                        onChange={(e) => updateAudit(c.recordUuid, e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white max-w-[180px]"
                      >
                        {auditActions.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-slate-500 max-w-xs truncate" title={c.completionNotes}>{c.completionNotes || '-'}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Tidak ada data {cat} yang cocok dengan filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>
            Menampilkan {items.length === 0 ? 0 : (safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, items.length)} dari {items.length} data
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
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
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
            >
              ›
            </button>
          </div>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white font-semibold text-slate-600"
          >
            <option value={10}>10 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
          </select>
          <span className="font-bold text-slate-700">Total: {fmtMoney(grandTotal)}</span>
        </div>
      </div>

      {/* Modal Master Status Validasi */}
      {masterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMasterOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-fast">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Master Status Validasi</h3>
              <button onClick={() => setMasterOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4">
              <ul className="divide-y divide-slate-100">
                {auditActions.map((a, i) => (
                  <li key={a} className="py-3 flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700 font-medium">{a}</span>
                    {i >= 3 ? (
                      <button
                        onClick={() => {
                          if (confirm('Yakin hapus action ini? Kasus yang menggunakan action ini akan kembali ke default.')) removeAction(a);
                        }}
                        className="text-xs font-semibold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded transition"
                      >
                        Hapus
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Default</span>
                    )}
                  </li>
                ))}
              </ul>
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
                  setNewAction('');
                }}
              >
                <input
                  type="text"
                  placeholder="Status validasi baru..."
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
                />
                <button className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 rounded-lg transition">Tambah</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtMoney(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

function ChartPanel({ title, desc, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 mb-4">{desc}</p>
      <div className="h-64">{children}</div>
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
