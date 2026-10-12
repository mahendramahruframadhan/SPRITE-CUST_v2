/* eslint-disable react/forbid-elements --
   Sel kontrol pajak per baris (trigger PPN + saklar PPH) adalah kontrol
   mikro kustom tabel, sama seperti badge status invoice per baris di
   FinanceAuditPage.jsx: varian Button tak mencakup state on/off ini
   tanpa override warna besar. */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/Button.jsx';
import { usePopover } from '../hooks/usePopover.js';
import { isTaxableRow, resolveTaxAmount } from '../lib/taxSummary.js';

const fmtMoney = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');

// Sel pajak satu baris transaksi: hanya baris ON-CALL yang punya kontrol
// (chip PPN membuka menu isi/reset, chip PPH saklar status), baris lain '-'.
export default function TaxCell({ recordUuid, charges, billingStatus, tax, onEditPpn, onSavePpn, onTogglePph }) {
  const pop = usePopover({ width: 240 });
  const firstRef = useRef(null);
  useEffect(() => {
    if (pop.open) firstRef.current?.focus();
  }, [pop.open]);

  if (!isTaxableRow(billingStatus)) {
    return <span className="text-xs text-slate-300 dark:text-slate-600">-</span>;
  }

  const ppn = tax?.ppn ?? null;
  const pphOn = tax?.pph === true;
  const ppnLabel = ppn ? (ppn.mode === 'percent' ? `${ppn.percent}%` : fmtMoney(ppn.amount)) : 'Non PPN';

  const chipBase =
    'inline-flex w-full items-center justify-center gap-1.5 min-h-[34px] text-[11px] font-bold border rounded-lg px-2 transition focus-visible:outline-none';

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
    <div className="flex flex-col gap-1 w-[150px]">
      <button
        id={`ppn-trigger-${recordUuid}`}
        data-testid={`ppn-trigger-${recordUuid}`}
        ref={pop.rootRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={() => pop.setOpen(!pop.open)}
        title={ppn ? `PPN ${ppnLabel} (= ${fmtMoney(resolveTaxAmount(ppn, charges))})` : 'PPN: belum diisi'}
        className={`${chipBase} focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
          ppn
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
      >
        PPN: {ppnLabel}
        <svg
          className="w-3 h-3 opacity-70"
          fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <button
        id={`pph-toggle-${recordUuid}`}
        data-testid={`pph-toggle-${recordUuid}`}
        type="button"
        aria-pressed={pphOn}
        onClick={() => onTogglePph(recordUuid)}
        title={pphOn ? 'PPH aktif (penanda status, tanpa potongan)' : 'Non PPH (klik untuk tandai PPH)'}
        className={`${chipBase} focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
          pphOn
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
      >
        {pphOn ? 'PPH' : 'Non PPH'}
      </button>

      <span
        data-testid="row-subtotal"
        className="block text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400"
      >
        Subtotal {fmtMoney(charges + resolveTaxAmount(ppn, charges))}
      </span>

      {pop.open && pop.pos &&
        createPortal(
          <div
            ref={pop.popRef}
            role="menu"
            aria-label="Opsi PPN"
            style={{ left: pop.pos.left, top: pop.pos.top, width: pop.pos.width }}
            className={`fixed z-[70] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 animate-fade-in-fast ${pop.pos.up ? 'origin-bottom' : 'origin-top'}`}
          >
            {menuItem('PPN (isi pajak)…', 'Persen atau rupiah', () => {
              pop.setOpen(false);
              onEditPpn(recordUuid);
            }, firstRef)}
            {menuItem('Non PPN (reset)', 'Matikan & hapus nilai', () => {
              pop.setOpen(false);
              onSavePpn(recordUuid, null);
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
