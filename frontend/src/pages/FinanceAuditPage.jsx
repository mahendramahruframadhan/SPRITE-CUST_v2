import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { useInvoiceState, DEFAULT_INVOICE, DEFAULT_INVOICE_STATUS } from '../hooks/useInvoiceState.js';
import { recordActivity } from '../lib/activity.js';
import { fmtDate8 } from '../utils/format.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { useAuth } from '../context/AuthContext.jsx';
import CaseDetailModal from '../components/CaseDetailModal.jsx';

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
  const [detailUuid, setDetailUuid] = useState(null);

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
    { t: 'Total Outstanding', v: fmtMoney(stats.outstandingAmount), sub: `${stats.outstandingCount} kasus belum PAID`, color: 'text-rose-600', accent: 'from-rose-500 to-rose-300', size: 'text-[19px]' },
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
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#064e3b] via-[#059669] to-[#10b981] text-white shadow-2xl shadow-emerald-600/25 animate-fade-in-fast">
        <div aria-hidden="true" className="absolute inset-0 opacity-[.14]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div aria-hidden="true" className="absolute -right-24 -top-24 w-96 h-96 bg-white/15 rounded-full blur-3xl" />
        <div aria-hidden="true" className="absolute -left-16 -bottom-28 w-80 h-80 bg-teal-300/20 rounded-full blur-3xl" />
        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] bg-white/15 border border-white/20 backdrop-blur rounded-full px-3 py-1">
                [ FINANCE /// INVOICE ]
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white/10 border border-white/15 rounded-full px-3 py-1">
                {user?.name || 'Finance User'}
              </span>
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              Finance Audit
            </h1>
            <p className="mt-2 text-sm text-white/75 max-w-xl leading-relaxed">
              {stats.total} kasus tervalidasi siap invoice · outstanding <span className="font-bold text-white tabular-nums">{fmtMoney(stats.outstandingAmount)}</span> · {stats.paid} sudah PAID.
            </p>
          </div>
          <div className="flex flex-wrap lg:flex-col gap-2.5 shrink-0">
            <button
              onClick={() => setMasterOpen(true)}
              className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 text-sm font-extrabold px-4 py-3 rounded-2xl shadow-lg hover:bg-emerald-50 transition active:scale-[.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Master Status Invoice
            </button>
            <button
              onClick={exportData}
              className="inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white/90 bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2.5 rounded-2xl transition active:scale-[.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* Alur kerja */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px] font-bold animate-fade-in-fast" style={{ animationDelay: '.05s' }}>
        <span className="text-slate-400 uppercase tracking-[0.14em]">Alur:</span>
        <Link to="/billing" className="text-brand-600 hover:text-brand-700 hover:underline uppercase tracking-wide">Billing & Audit</Link>
        <Arrow />
        <FlowPill tone="bg-amber-50 text-amber-700 border-amber-200">Menunggu Invoice</FlowPill>
        <Arrow />
        <FlowPill tone="bg-violet-50 text-violet-700 border-violet-200">Invoice Terbit</FlowPill>
        <Arrow />
        <FlowPill tone="bg-emerald-50 text-emerald-700 border-emerald-200">Paid</FlowPill>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {kpi.map((d, i) => (
          <div key={d.t} className="group relative overflow-hidden bg-white rounded-3xl border border-slate-200/70 p-5 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:shadow-xl hover:-translate-y-1 hover:border-transparent transition-all duration-300 animate-fade-in-fast" style={{ animationDelay: `${0.08 + i * 0.04}s` }}>
            <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${d.accent}`} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em] truncate">{d.t}</p>
                <p className={`mt-2 ${d.size || 'text-[22px]'} leading-tight font-extrabold tracking-tight tabular-nums ${d.color}`}>{d.v}</p>
                <p className="mt-1.5 text-xs font-medium text-slate-400 truncate">{d.sub}</p>
              </div>
              <span className={`w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${d.accent} flex items-center justify-center`}>
                <span className="w-2.5 h-2.5 rounded-full bg-white" aria-hidden="true" />
              </span>
            </div>
          </div>
        ))}
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
                  <td className="px-4 py-3.5">
                    <div className="min-w-[200px] max-w-[300px]">
                      <p className="text-slate-500 text-xs line-clamp-2">{c.issue || '-'}</p>
                      <button
                        type="button"
                        onClick={() => setDetailUuid(c.recordUuid)}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-lg px-2.5 py-1 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                        Lihat Detail
                      </button>
                    </div>
                  </td>
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

      {/* Popup detail kasus dari kolom Issue */}
      {(() => {
        const d = allCases.find((x) => x.recordUuid === detailUuid) || null;
        const meta = d ? invoiceMeta[d.recordUuid] || {} : {};
        const invStatus = d ? invoiceStatus[d.recordUuid] || 'MENUNGGU INVOICE' : null;
        return (
          <CaseDetailModal
            c={d}
            kicker={`Detail Kasus #${d?.no || '-'}`}
            title={d?.client || '-'}
            chips={d ? [
              { text: d.module || '-', className: 'bg-white/15 border-white/20' },
              { text: d.billingStatus || '-', className: 'bg-white/15 border-white/20' },
              { text: invStatus, className: 'bg-amber-300/90 text-amber-900 border-transparent' },
            ] : []}
            rows={d ? [
              ['Tgl Issue', fmtDate8(d.dateIssue)],
              ['Brand', d.client || '-'],
              ['PIC Name', d.picName || d.assignTo || '-'],
              ['Module', d.module || '-'],
              ['Sub-Module', d.subModule || '-'],
              ['Lokasi', d.location || '-'],
              ['Status Billing', d.billingStatus || '-'],
              ['Kategori Billing', d.billingCategory || '-'],
              ['Tipe Support', d.supportType || '-'],
              ['Charges', fmtMoney(d.charges)],
              ['Status Invoice', invStatus],
              ['No. Invoice', meta.no || '-'],
              ['Keterangan', meta.note || '-'],
            ] : []}
            notes={{ label: 'Completion Notes', text: d?.completionNotes }}
            onClose={() => setDetailUuid(null)}
          />
        );
      })()}
    </div>
  );
}

function fmtMoney(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}
