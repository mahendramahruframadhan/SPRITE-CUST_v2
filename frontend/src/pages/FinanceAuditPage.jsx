import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pie, Bar } from 'react-chartjs-2';
import { allCases } from '../data/cases.js';
import { fmtDate8 } from '../utils/format.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { useAuth } from '../context/AuthContext.jsx';

const VALID_TAG = 'VALID - SIAP INVOICE';
const INVOICE_ACTIONS = ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'PAID'];

function loadInvoiceStatus() {
  return JSON.parse(localStorage.getItem('caseInvoiceStatus')) || {};
}

export default function FinanceAuditPage() {
  const { user } = useAuth();
  const { caseAuditStatus } = useAuditState();
  const [invoiceStatus, setInvoiceStatus] = useState(loadInvoiceStatus);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [brand, setBrand] = useState('');
  const [billStatus, setBillStatus] = useState('');
  const [invFilter, setInvFilter] = useState('');

  // Pastikan kasus tervalidasi punya status invoice default
  useEffect(() => {
    setInvoiceStatus((prev) => {
      const next = { ...prev };
      let changed = false;
      validatedPool.forEach((c) => {
        if (!next[c.recordUuid]) {
          next[c.recordUuid] = 'MENUNGGU INVOICE';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseAuditStatus]);

  useEffect(() => {
    localStorage.setItem('caseInvoiceStatus', JSON.stringify(invoiceStatus));
  }, [invoiceStatus]);

  const brands = useMemo(
    () => [...new Set(allCases.map((c) => c.client).filter(Boolean))].sort(),
    []
  );

  // Pool kasus yang boleh diproses finance
  const validatedPool = useMemo(
    () =>
      allCases.filter(
        (c) =>
          (c.billingStatus === 'ON-CALL' || c.billingStatus === 'MONTHLY') &&
          caseAuditStatus[c.recordUuid] === VALID_TAG
      ),
    [caseAuditStatus]
  );

  const stats = useMemo(() => {
    const byStatus = (a) => validatedPool.filter((c) => (invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE') === a);
    const outstanding = validatedPool.filter((c) => (invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE') !== 'PAID');
    return {
      total: validatedPool.length,
      totalAmount: validatedPool.reduce((a, c) => a + (+c.charges || 0), 0),
      menunggu: byStatus('MENUNGGU INVOICE').length,
      terbit: byStatus('INVOICE TERBIT').length,
      paid: byStatus('PAID').length,
      outstandingCount: outstanding.length,
      outstandingAmount: outstanding.reduce((a, c) => a + (+c.charges || 0), 0),
    };
  }, [validatedPool, invoiceStatus]);

  const kpi = [
    { t: 'Siap Invoice', v: stats.total.toLocaleString('id-ID'), sub: fmtMoney(stats.totalAmount) + ' tervalidasi', color: 'text-brand-600' },
    { t: 'Menunggu Invoice', v: stats.menunggu.toLocaleString('id-ID'), sub: 'kasus', color: 'text-amber-600' },
    { t: 'Invoice Terbit', v: stats.terbit.toLocaleString('id-ID'), sub: 'kasus', color: 'text-violet-600' },
    { t: 'Paid', v: stats.paid.toLocaleString('id-ID'), sub: `dari ${stats.total} kasus tervalidasi`, color: 'text-emerald-600' },
    { t: 'Total Outstanding', v: fmtMoney(stats.outstandingAmount), sub: `${stats.outstandingCount} kasus belum PAID`, color: 'text-rose-600' },
  ];

  const filtered = useMemo(() => {
    const f = from.replace(/-/g, '');
    const t = to.replace(/-/g, '');
    return validatedPool.filter((c) => {
      const d = c.dateIssue;
      const s = invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE';
      return (
        (!f || d >= f) &&
        (!t || d <= t) &&
        (!brand || c.client === brand) &&
        (!billStatus || c.billingStatus === billStatus) &&
        (!invFilter || s === invFilter)
      );
    });
  }, [validatedPool, invoiceStatus, from, to, brand, billStatus, invFilter]);

  const invCounts = useMemo(() => {
    const m = {};
    INVOICE_ACTIONS.forEach((a) => (m[a] = 0));
    validatedPool.forEach((c) => {
      const a = invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE';
      m[a] = (m[a] || 0) + 1;
    });
    return m;
  }, [validatedPool, invoiceStatus]);

  const distData = {
    labels: INVOICE_ACTIONS,
    datasets: [{
      data: INVOICE_ACTIONS.map((a) => invCounts[a] || 0),
      backgroundColor: ['#f59e0b', '#8b5cf6', '#10b981'],
      borderWidth: 0,
    }],
  };

  const outstandingData = useMemo(() => {
    const clientOut = {};
    validatedPool
      .filter((c) => (invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE') !== 'PAID')
      .forEach((c) => {
        clientOut[c.client] = (clientOut[c.client] || 0) + (+c.charges || 0);
      });
    const top = Object.entries(clientOut).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      labels: top.map((t) => t[0]),
      datasets: [{ label: 'Outstanding (Rp)', data: top.map((t) => t[1]), backgroundColor: '#10b981', borderRadius: 6 }],
    };
  }, [validatedPool, invoiceStatus]);

  const total = filtered.reduce((a, c) => a + (+c.charges || 0), 0);

  function setInvoice(uuid, action) {
    setInvoiceStatus((prev) => ({ ...prev, [uuid]: action }));
  }

  function exportData() {
    const headers = ['NO', 'DATE ISSUE', 'CLIENT', 'PIC NAME', 'ISSUE', 'MODULE', 'BILLING STATUS', 'BILLING CATEGORY', 'SUPPORT TYPE', 'CHARGES', 'STATUS VALIDASI', 'STATUS INVOICE', 'COMPLETION NOTES', 'RECORD_UUID'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...filtered.map((c) =>
        [
          c.no, c.dateIssue, c.client, c.picName, c.issue, c.module, c.billingStatus, c.billingCategory,
          c.supportType, c.charges, caseAuditStatus[c.recordUuid] || '', invoiceStatus[c.recordUuid] || '',
          c.completionNotes, c.recordUuid,
        ]
          .map(esc)
          .join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finance-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const filterCls =
    'mt-1 block text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white';

  return (
    <div className="px-8 py-6 space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 -mt-1">
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">{user?.name || 'Finance User'}</span>
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

      {/* Info alur kerja */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-start gap-3 animate-fade-in-fast">
        <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-xs text-emerald-800 leading-relaxed">
          <span className="font-bold">Alur kerja:</span> tim support memvalidasi kasus ON-CALL / MONTHLY di menu{' '}
          <Link to="/billing" className="font-semibold">Billing & Audit</Link> (kejadian betul & harga sesuai). Kasus berstatus{' '}
          <span className="font-bold">VALID - SIAP INVOICE</span> otomatis tampil di halaman ini untuk diterbitkan invoice-nya:{' '}
          <span className="font-bold">MENUNGGU INVOICE</span> → <span className="font-bold">INVOICE TERBIT</span> →{' '}
          <span className="font-bold">PAID</span>.
        </p>
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold text-slate-900 mb-1">Distribusi Status Invoice</h3>
          <p className="text-xs text-slate-400 mb-4">Status penerbitan invoice kasus tervalidasi</p>
          <div className="h-64">
            <Pie
              data={distData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } } },
              }}
            />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold text-slate-900 mb-1">Outstanding per Brand</h3>
          <p className="text-xs text-slate-400 mb-4">Brand dengan invoice belum PAID terbesar</p>
          <div className="h-64">
            <Bar
              data={outstandingData}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                  y: { grid: { display: false }, ticks: { font: { size: 10 } } },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
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
        <div>
          <label className="text-xs font-semibold text-slate-500">Billing Status</label>
          <select value={billStatus} onChange={(e) => setBillStatus(e.target.value)} className={`${filterCls} min-w-[150px]`}>
            <option value="">ON-CALL + MONTHLY</option>
            <option value="ON-CALL">ON-CALL</option>
            <option value="MONTHLY">MONTHLY</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Status Invoice</label>
          <select value={invFilter} onChange={(e) => setInvFilter(e.target.value)} className={`${filterCls} min-w-[180px]`}>
            <option value="">Semua</option>
            {INVOICE_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            setFrom('');
            setTo('');
            setBrand('');
            setBillStatus('');
            setInvFilter('');
          }}
          className="text-sm font-semibold text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100 transition"
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Kasus Tervalidasi — Siap Invoice</h3>
          <span className="text-xs text-slate-400">Menampilkan {filtered.length} kasus tervalidasi</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-6 py-3 font-semibold">No</th>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Brand</th>
                <th className="px-4 py-3 font-semibold">PIC</th>
                <th className="px-4 py-3 font-semibold">Issue</th>
                <th className="px-4 py-3 font-semibold">Module</th>
                <th className="px-4 py-3 font-semibold">Billing Status</th>
                <th className="px-4 py-3 font-semibold">Billing Category</th>
                <th className="px-4 py-3 font-semibold text-right">Charges</th>
                <th className="px-4 py-3 font-semibold">Status Invoice</th>
                <th className="px-6 py-3 font-semibold text-center">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.recordUuid} className="hover:bg-emerald-50/40 transition">
                  <td className="px-6 py-3.5 text-slate-400">{c.no}</td>
                  <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{fmtDate8(c.dateIssue)}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">{c.client}</td>
                  <td className="px-4 py-3.5 text-slate-500">{c.picName || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs max-w-[260px] truncate" title={c.issue}>{c.issue || '-'}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-1 rounded-full">{c.module}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500">{c.billingStatus}</td>
                  <td className="px-4 py-3.5 text-slate-600">{c.billingCategory || '-'}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-slate-700">{fmtMoney(c.charges)}</td>
                  <td className="px-4 py-3.5">
                    <select
                      value={invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE'}
                      onChange={(e) => setInvoice(c.recordUuid, e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white max-w-[180px]"
                    >
                      {INVOICE_ACTIONS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <button
                        onClick={() => setInvoice(c.recordUuid, 'INVOICE TERBIT')}
                        className="text-[10px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded transition"
                      >
                        Terbit Invoice
                      </button>
                      <button
                        onClick={() => setInvoice(c.recordUuid, 'PAID')}
                        className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded transition"
                      >
                        Paid
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Belum ada kasus tervalidasi — validasi dulu kasus di menu{' '}
                    <Link to="/billing" className="font-semibold text-emerald-600 hover:underline">
                      Billing &amp; Audit
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>
            Hanya kasus <span className="font-semibold text-emerald-600">VALID - SIAP INVOICE</span> dari Billing & Audit yang tampil di halaman ini
          </span>
          <span className="font-bold text-slate-700">Total: {fmtMoney(total)}</span>
        </div>
      </div>
    </div>
  );
}

function fmtMoney(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}
