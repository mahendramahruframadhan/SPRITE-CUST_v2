// Modal isi PPN satu baris transaksi: mode Persen (%) atau Rupiah (Rp).
// Basis persen = charges baris itu sendiri (prop charges).
/* eslint-disable react/forbid-elements --
   Kontrol micro bertema halaman Finance (toggle mode persen/rupiah,
   tombol Simpan/Batal mengikuti modal PAID) disengaja mentah, sama seperti
   catatan konvensi di FinanceAuditPage.jsx: varian Button tidak mencakup
   state on/off ini tanpa override warna besar. */
import { useState } from 'react';
import {
  amountFromPercent,
  validateRpInput,
  validatePercentInput,
} from '../lib/taxSummary.js';

const fmtMoney = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');

export default function TaxModal({ entry, charges, onSave, onClose }) {
  const [mode, setMode] = useState(entry && entry.mode === 'rupiah' ? 'rupiah' : 'percent');
  const [rpStr, setRpStr] = useState(entry && entry.mode === 'rupiah' ? String(entry.amount) : '');
  const [pctStr, setPctStr] = useState(entry && entry.mode === 'percent' ? String(entry.percent) : '');

  const valid = mode === 'rupiah' ? validateRpInput(rpStr) : validatePercentInput(pctStr);
  const touched = mode === 'rupiah' ? rpStr !== '' : pctStr !== '';
  const preview = mode === 'rupiah' ? Number(rpStr || 0) : amountFromPercent(charges, Number(pctStr || 0));

  const save = () => {
    if (!valid) return;
    onSave(
      mode === 'rupiah'
        ? { enabled: true, mode: 'rupiah', percent: 0, amount: Number(rpStr) }
        : { enabled: true, mode: 'percent', percent: Number(pctStr), amount: amountFromPercent(charges, Number(pctStr)) }
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
        aria-label="PPN"
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
            Pajak Pertambahan Nilai
          </p>
          <h3 className="font-bold">PPN</h3>
          <p className="text-xs text-white/85 tabular-nums">Charges baris: {fmtMoney(charges)}</p>
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
