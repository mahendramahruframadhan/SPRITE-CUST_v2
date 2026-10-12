/* eslint-disable react/forbid-elements --
   Kontrol micro bertema halaman Finance (trigger dropdown toggle emerald/slate,
   tombol Simpan/Batal modal mengikuti modal PAID, toggle mode persen/rupiah)
   disengaja mentah, sama seperti catatan konvensi di FinanceAuditPage.jsx:
   varian Button tidak mencakup state on/off ini tanpa override warna besar. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Reveal } from './Reveal.jsx';
import { Button } from './ui/Button.jsx';
import { usePopover } from '../hooks/usePopover.js';
import {
  computeSubtotal,
  resolveTaxAmount,
  amountFromPercent,
  sanitizeTaxState,
  validateRpInput,
  validatePercentInput,
} from '../lib/taxSummary.js';

const fmtMoney = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const NON_AKTIF = sanitizeTaxState(null).ppn;
const STORAGE_KEY = 'finance-tax-v1';
// Pintu tunggal baca localStorage: sanitizeTaxState; gagal akses (mode privat,
// larangan storage) -> default non-aktif.
const readStoredTax = () => {
  try {
    return sanitizeTaxState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return sanitizeTaxState(null);
  }
};

const rowCls = 'flex items-center justify-between gap-4';
const labelCls = 'text-sm font-semibold text-slate-500 dark:text-slate-400';
const valueCls = 'text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100';

export default function TaxSummaryPanel({ total }) {
  const [ppn, setPpn] = useState(() => readStoredTax().ppn);
  const [pph, setPph] = useState(() => readStoredTax().pph);
  const [modal, setModal] = useState(null);

  const ppnPop = usePopover({ width: 260 });
  const pphPop = usePopover({ width: 260 });
  const ppnFirstRef = useRef(null);
  const pphFirstRef = useRef(null);
  useEffect(() => {
    if (ppnPop.open) ppnFirstRef.current?.focus();
  }, [ppnPop.open]);
  useEffect(() => {
    if (pphPop.open) pphFirstRef.current?.focus();
  }, [pphPop.open]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ppn, pph }));
    } catch {
      /* storage diblokir: state tetap hidup di memori saja */
    }
  }, [ppn, pph]);

  const ppnAmount = resolveTaxAmount(ppn, total);
  const pphAmount = resolveTaxAmount(pph, total);
  const subtotal = computeSubtotal({ total, ppn: ppnAmount, pph: pphAmount });

  const openItem = (pop, ref) => {
    pop.setOpen(false);
    ref.current = null;
    setModal(pop === ppnPop ? 'ppn' : 'pph');
  };

  const triggerCls = (enabled) =>
    `inline-flex items-center gap-2 min-h-[40px] rounded-xl border px-3.5 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
      enabled
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
    }`;

  const menuItem = (title, sub, onClick, ref) => (
    <Button
      ref={ref}
      role="menuitem"
      onClick={onClick}
      className="w-full justify-start text-left py-2.5 text-slate-700 dark:text-slate-200"
    >
      <span className="flex flex-col items-start min-w-0">
        <span className="text-sm font-bold">{title}</span>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{sub}</span>
      </span>
    </Button>
  );

  return (
    <Reveal className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-4 sm:p-5">
      <section aria-label="Subtotal & Pajak" className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Subtotal &amp; Pajak</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Akumulasi PPN &amp; PPH untuk kasus pada filter ini
          </p>
          <dl className="mt-3 space-y-1.5">
            <div className={rowCls}>
              <dt className={labelCls}>Total Charges</dt>
              <dd id="tax-total-value" className={valueCls}>{fmtMoney(total)}</dd>
            </div>
            <div className={rowCls}>
              <dt className={labelCls}>PPN</dt>
              <dd id="tax-ppn-value" className={`${valueCls} ${ppn.enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500 font-semibold'}`}>
                {ppn.enabled ? fmtMoney(ppnAmount) : 'Non PPN'}
              </dd>
            </div>
            <div className={rowCls}>
              <dt className={labelCls}>PPH</dt>
              <dd id="tax-pph-value" className={`${valueCls} ${pph.enabled ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 font-semibold'}`}>
                {pph.enabled ? fmtMoney(pphAmount) : 'Non PPH'}
              </dd>
            </div>
            <div className={`${rowCls} pt-2 mt-1 border-t border-slate-200 dark:border-slate-700`}>
              <dt className="text-sm font-extrabold text-slate-900 dark:text-white">Subtotal Akhir</dt>
              <dd id="tax-subtotal-value" className="text-lg font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                {fmtMoney(subtotal)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
          <button
            ref={ppnPop.rootRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={ppnPop.open}
            onClick={() => ppnPop.setOpen(!ppnPop.open)}
            className={triggerCls(ppn.enabled)}
          >
            PPN: {ppn.enabled ? fmtMoney(ppnAmount) : 'Non PPN'}
            <svg
              className={`w-3.5 h-3.5 transition-transform motion-reduce:transition-none ${ppnPop.open ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <button
            ref={pphPop.rootRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={pphPop.open}
            onClick={() => pphPop.setOpen(!pphPop.open)}
            className={triggerCls(pph.enabled)}
          >
            PPH: {pph.enabled ? fmtMoney(pphAmount) : 'Non PPH'}
            <svg
              className={`w-3.5 h-3.5 transition-transform motion-reduce:transition-none ${pphPop.open ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </section>

      {ppnPop.open && ppnPop.pos &&
        createPortal(
          <div
            ref={ppnPop.popRef}
            role="menu"
            aria-label="Opsi PPN"
            style={{ left: ppnPop.pos.left, top: ppnPop.pos.top, width: ppnPop.pos.width }}
            className={`fixed z-[70] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 animate-fade-in-fast ${ppnPop.pos.up ? 'origin-bottom' : 'origin-top'}`}
          >
            {menuItem('PPN (isi pajak)…', 'Persen atau rupiah', () => openItem(ppnPop, ppnFirstRef), ppnFirstRef)}
            {menuItem('Non PPN (reset)', 'Matikan & hapus nilai', () => { ppnPop.setOpen(false); setPpn(NON_AKTIF); })}
          </div>,
          document.body
        )}

      {pphPop.open && pphPop.pos &&
        createPortal(
          <div
            ref={pphPop.popRef}
            role="menu"
            aria-label="Opsi PPH"
            style={{ left: pphPop.pos.left, top: pphPop.pos.top, width: pphPop.pos.width }}
            className={`fixed z-[70] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 animate-fade-in-fast ${pphPop.pos.up ? 'origin-bottom' : 'origin-top'}`}
          >
            {menuItem('PPH (isi pajak)…', 'Persen atau rupiah', () => openItem(pphPop, pphFirstRef), pphFirstRef)}
            {menuItem('Non PPH (reset)', 'Matikan & hapus nilai', () => { pphPop.setOpen(false); setPph(NON_AKTIF); })}
          </div>,
          document.body
        )}

      {modal && (
        <TaxModal
          title={modal === 'ppn' ? 'PPN' : 'PPH'}
          entry={modal === 'ppn' ? ppn : pph}
          total={total}
          onSave={(entry) => {
            if (modal === 'ppn') setPpn(entry);
            else setPph(entry);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </Reveal>
  );
}

function TaxModal({ title, entry, total, onSave, onClose }) {
  const [mode, setMode] = useState(entry.enabled && entry.mode === 'rupiah' ? 'rupiah' : 'percent');
  const [rpStr, setRpStr] = useState(entry.enabled && entry.mode === 'rupiah' ? String(entry.amount) : '');
  const [pctStr, setPctStr] = useState(entry.enabled && entry.mode === 'percent' ? String(entry.percent) : '');

  const valid = mode === 'rupiah' ? validateRpInput(rpStr) : validatePercentInput(pctStr);
  const touched = mode === 'rupiah' ? rpStr !== '' : pctStr !== '';
  const preview = mode === 'rupiah' ? Number(rpStr || 0) : amountFromPercent(total, Number(pctStr || 0));

  const save = () => {
    if (!valid) return;
    onSave(
      mode === 'rupiah'
        ? { enabled: true, mode: 'rupiah', percent: 0, amount: Number(rpStr) }
        : { enabled: true, mode: 'percent', percent: Number(pctStr), amount: amountFromPercent(total, Number(pctStr)) }
    );
  };

  const inputCls =
    'mt-1.5 w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition';
  const modeBtn = (m, label) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
      className={`flex-1 min-h-[36px] rounded-lg text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
        mode === m
          ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
        className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-fade-in-fast"
      >
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/90">
            {title === 'PPN' ? 'Pajak Pertambahan Nilai' : 'Pajak Penghasilan'}
          </p>
          <h3 className="font-bold">{title}</h3>
          <p className="text-xs text-white/85 tabular-nums">Total Charges: {fmtMoney(total)}</p>
        </div>
        <div className="px-5 py-4">
          <div role="group" aria-label="Mode input" className="mb-3 flex gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            {modeBtn('percent', 'Persen')}
            {modeBtn('rupiah', 'Rupiah')}
          </div>

          {mode === 'percent' ? (
            <div>
              <label htmlFor="tax-pct-input" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Persen (%)
              </label>
              <input
                id="tax-pct-input"
                type="text"
                inputMode="decimal"
                autoFocus
                value={pctStr}
                onChange={(e) => setPctStr(e.target.value)}
                placeholder="cth. 2"
                className={inputCls}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="tax-rp-input" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Nilai (Rp)
              </label>
              <input
                id="tax-rp-input"
                type="text"
                inputMode="numeric"
                autoFocus
                value={rpStr}
                onChange={(e) => setRpStr(e.target.value)}
                placeholder="cth. 110000"
                className={inputCls}
              />
            </div>
          )}

          {touched && !valid && (
            <p role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-500">
              Masukkan angka yang valid
            </p>
          )}
          {valid && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Perkiraan nilai:{' '}
              <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{fmtMoney(preview)}</span>
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!valid}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold px-4 rounded-xl shadow-md shadow-emerald-600/25 transition disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
            >
              Simpan
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center text-sm font-bold text-slate-500 dark:text-slate-300 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
