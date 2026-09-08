import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { useInvoiceState, DEFAULT_INVOICE, DEFAULT_INVOICE_STATUS } from '../hooks/useInvoiceState.js';
import { recordActivity } from '../lib/activity.js';
import { fmtDate8 } from '../utils/format.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { useAuth } from '../context/AuthContext.jsx';

const VALID_TAG = 'VALID - SIAP INVOICE';

const shortInvoice = (a) => (a === 'INVOICE TERBIT' ? 'Terbit Invoice' : a === 'PAID' ? 'Paid' : a);

// Warna select status invoice (status kustom → netral)
const INV_TONE = {
  'MENUNGGU INVOICE': 'border-amber-200 bg-amber-50 text-amber-700',
  'INVOICE TERBIT': 'border-violet-200 bg-violet-50 text-violet-700',
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export default function FinanceAuditPage() {
  const { user } = useAuth();
  const { caseAuditStatus } = useAuditState();
  const { cases: allCases, loading } = useCases();
  const { invoiceActions, invoiceStatus, updateInvoice, addInvoiceAction, removeInvoiceAction, ensureDefaults, invoiceMeta, updateInvoiceMeta } = useInvoiceState();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [brand, setBrand] = useState('');
  const [billStatus, setBillStatus] = useState('');
  const [invFilter, setInvFilter] = useState('');
  const [masterOpen, setMasterOpen] = useState(false);
  const [newAction, setNewAction] = useState('');

  // Pastikan kasus tervalidasi punya status invoice default
  useEffect(() => {
    ensureDefaults(validatedPool.map((c) => c.recordUuid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseAuditStatus]);

  const brands = useMemo(
    () => [...new Set(allCases.map((c) => c.client).filter(Boolean))].sort(),
    [allCases]
  );

  // Pool kasus yang boleh diproses finance
  const validatedPool = useMemo(
    () =>
      allCases.filter(
        (c) =>
          (c.billingStatus === 'ON-CALL' || c.billingStatus === 'MONTHLY') &&
          caseAuditStatus[c.recordUuid] === VALID_TAG
      ),
    [allCases, caseAuditStatus]
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
    { t: 'Siap Invoice', v: stats.total.toLocaleString('id-ID'), sub: fmtMoney(stats.totalAmount) + ' tervalidasi', color: 'text-brand-600', accent: 'from-brand-500 to-brand-300' },
    { t: 'Menunggu Invoice', v: stats.menunggu.toLocaleString('id-ID'), sub: 'kasus', color: 'text-amber-600', accent: 'from-amber-500 to-amber-300' },
    { t: 'Invoice Terbit', v: stats.terbit.toLocaleString('id-ID'), sub: 'kasus', color: 'text-violet-600', accent: 'from-violet-500 to-violet-300' },
    { t: 'Paid', v: stats.paid.toLocaleString('id-ID'), sub: `dari ${stats.total} kasus tervalidasi`, color: 'text-emerald-600', accent: 'from-emerald-500 to-emerald-300' },
    { t: 'Total Outstanding', v: fmtMoney(stats.outstandingAmount), sub: `${stats.outstandingCount} kasus belum PAID`, color: 'text-rose-600', accent: 'from-rose-500 to-rose-300' },
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

  const outstandingData = useMemo(() => {
    const clientOut = {};
    validatedPool
      .filter((c) => (invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE') !== 'PAID')
      .forEach((c) => {
        clientOut[c.client] = (clientOut[c.client] || 0) + (+c.charges || 0);
      });
    const top = Object.entries(clientOut).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      labels: top.map((t) => t[0]),
      datasets: [{ label: 'Outstanding (Rp)', data: top.map((t) => t[1]), backgroundColor: '#10b981', borderRadius: 6 }],
    };
  }, [validatedPool, invoiceStatus]);

  const total = filtered.reduce((a, c) => a + (+c.charges || 0), 0);

  function handleInvoice(uuid, action) {
    const c = allCases.find((x) => x.recordUuid === uuid);
    updateInvoice(uuid, action);
    const meta = invoiceMeta[uuid] || {};
    const label = c ? `kasus #${c.no} (${c.client})` : `kasus ${String(uuid).slice(0, 8)}`;
    const invNo = (meta.no || '').trim();
    recordActivity(`mengubah status invoice ${label}`, `menjadi ${action}${invNo ? ` • no. invoice ${invNo}` : ''}`, 'Invoice');
  }

  function exportData() {
    const headers = ['NO', 'DATE ISSUE', 'CLIENT', 'PIC NAME', 'ISSUE', 'MODULE', 'BILLING STATUS', 'BILLING CATEGORY', 'SUPPORT TYPE', 'CHARGES', 'STATUS VALIDASI', 'STATUS INVOICE', 'NOMOR INVOICE', 'KETERANGAN', 'COMPLETION NOTES', 'RECORD_UUID'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...filtered.map((c) => {
        const m = invoiceMeta[c.recordUuid] || {};
        return [
          c.no, c.dateIssue, c.client, c.picName, c.issue, c.module, c.billingStatus, c.billingCategory,
          c.supportType, c.charges, caseAuditStatus[c.recordUuid] || '', invoiceStatus[c.recordUuid] || '',
          m.no || '', m.note || '',
          c.completionNotes, c.recordUuid,
        ]
          .map(esc)
          .join(',');
      }),
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
          onClick={() => setMasterOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Master Status Invoice
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
          <div key={d.t} className="bg-white rounded-2xl border border-slate-200 p-5 pt-0 overflow-hidden animate-fade-in-fast" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className={`h-1.5 -mx-5 mb-4 bg-gradient-to-r ${d.accent}`} />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{d.t}</p>
            <p className={`mt-2 text-2xl font-extrabold ${d.color}`}>{d.v}</p>
            <p className="mt-1 text-xs text-slate-400 font-medium">{d.sub}</p>
          </div>
        ))}
      </div>

      {/* Chart ringkas */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Outstanding per Brand <span className="font-medium text-slate-400">• Top 5</span></h3>
            <p className="text-[11px] text-slate-400">Brand dengan invoice belum PAID terbesar</p>
          </div>
          <p className="text-xs text-slate-400">
            Total <span className="font-bold text-rose-600">{fmtMoney(stats.outstandingAmount)}</span>
            {' '}• {stats.outstandingCount.toLocaleString('id-ID')} kasus
          </p>
        </div>
        <div className="h-40">
          <Bar
            data={outstandingData}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { font: { size: 11 } } },
              },
            }}
          />
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
            {invoiceActions.map((a) => (
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
          <span className="text-xs text-slate-400">{loading ? 'Memuat dari backend…' : `Menampilkan ${filtered.length} kasus tervalidasi`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/80">
                <th className="px-6 py-3 font-bold">No</th>
                <th className="px-4 py-3 font-bold">Tanggal</th>
                <th className="px-4 py-3 font-bold">Brand</th>
                <th className="px-4 py-3 font-bold">PIC</th>
                <th className="px-4 py-3 font-bold">Issue</th>
                <th className="px-4 py-3 font-bold">Module</th>
                <th className="px-4 py-3 font-bold">Billing Status</th>
                <th className="px-4 py-3 font-bold">Billing Category</th>
                <th className="px-4 py-3 font-bold text-right">Charges</th>
                <th className="px-4 py-3 font-bold">Status Invoice</th>
                <th className="px-4 py-3 font-bold">No. Invoice</th>
                <th className="px-4 py-3 font-bold">Keterangan</th>
                <th className="px-6 py-3 font-bold text-center">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const meta = invoiceMeta[c.recordUuid] || {};
                return (
                <tr key={c.recordUuid} className="hover:bg-emerald-50/40 transition">
                  <td className="px-6 py-3.5 text-slate-400 tabular-nums">{c.no}</td>
                  <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap tabular-nums">{fmtDate8(c.dateIssue)}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">{c.client}</td>
                  <td className="px-4 py-3.5 text-slate-500">{c.picName || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs max-w-[260px] truncate" title={c.issue}>{c.issue || '-'}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-1 rounded-full">{c.module}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500">{c.billingStatus}</td>
                  <td className="px-4 py-3.5 text-slate-600">{c.billingCategory || '-'}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">{fmtMoney(c.charges)}</td>
                  <td className="px-4 py-3.5">
                    <select
                      value={invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE'}
                      onChange={(e) => handleInvoice(c.recordUuid, e.target.value)}
                      className={`text-xs font-semibold border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white max-w-[180px] ${INV_TONE[invoiceStatus[c.recordUuid]] || 'border-slate-200 text-slate-600'}`}
                    >
                      {invoiceActions.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3.5">
                    <input
                      type="text"
                      placeholder="No. invoice"
                      value={meta.no || ''}
                      onChange={(e) => updateInvoiceMeta(c.recordUuid, { no: e.target.value })}
                      className="text-xs font-mono border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white w-[130px]"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <input
                      type="text"
                      placeholder="Keterangan..."
                      title={meta.note || ''}
                      value={meta.note || ''}
                      onChange={(e) => updateInvoiceMeta(c.recordUuid, { note: e.target.value })}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white w-[160px]"
                    />
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {invoiceActions
                        .filter((a) => a !== (invoiceStatus[c.recordUuid] || DEFAULT_INVOICE_STATUS))
                        .slice(0, 2)
                        .map((a, i) => (
                          <button
                            key={a}
                            onClick={() => handleInvoice(c.recordUuid, a)}
                            className={`text-[10px] font-semibold px-2 py-1 rounded transition ${
                              i === 0
                                ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                                : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                            }`}
                          >
                            {shortInvoice(a)}
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-slate-400 text-sm">
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

      {/* Modal Master Status Invoice */}
      {masterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMasterOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-fast">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Master Status Invoice</h3>
              <button onClick={() => setMasterOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4">
              <ul className="divide-y divide-slate-100">
                {invoiceActions.map((a) => (
                  <li key={a} className="py-3 flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700 font-medium">{a}</span>
                    {DEFAULT_INVOICE.includes(a) ? (
                      <span className="text-[10px] text-slate-400">Default</span>
                    ) : (
                      <button
                        onClick={() => {
                          if (confirm('Yakin hapus status ini? Kasus yang menggunakannya akan kembali ke default.')) {
                            removeInvoiceAction(a);
                            recordActivity(`menghapus status invoice "${a}"`, 'kasus terkait kembali ke MENUNGGU INVOICE', 'Konfigurasi');
                          }
                        }}
                        className="text-xs font-semibold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded transition"
                      >
                        Hapus
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = newAction.trim().toUpperCase();
                  if (!val) return;
                  if (invoiceActions.includes(val)) {
                    alert('Status sudah ada');
                    return;
                  }
                  addInvoiceAction(val);
                  recordActivity(`menambah status invoice baru "${val}"`, '', 'Konfigurasi');
                  setNewAction('');
                }}
              >
                <input
                  type="text"
                  placeholder="Status invoice baru..."
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white"
                />
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 rounded-lg transition">Tambah</button>
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
