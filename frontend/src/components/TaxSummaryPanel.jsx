// Rekap pajak halaman Finance (display-only): menjumlahkan PPN per baris
// transaksi ON-CALL (Sigma dari TaxCell via taxMap). PPH hanya ditampilkan
// sebagai hitungan transaksi berstatus aktif (tanpa potongan).
// Subtotal Akhir = Total Charges + total PPN.
import { Reveal } from './Reveal.jsx';
import { computeSubtotal, sumPpn, pphActiveCount } from '../lib/taxSummary.js';

const fmtMoney = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');

const rowCls = 'flex items-center justify-between gap-4';
const labelCls = 'text-sm font-semibold text-slate-500 dark:text-slate-400';
const valueCls = 'text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100';

export default function TaxSummaryPanel({ total, rows, taxMap }) {
  const ppnTotal = sumPpn(rows, taxMap);
  const ppnRows = (rows || []).filter((r) => taxMap?.[r.recordUuid]?.ppn).length;
  const pphCount = pphActiveCount(rows, taxMap);
  const subtotal = computeSubtotal({ total, ppn: ppnTotal });

  return (
    <Reveal className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-4 sm:p-5">
      <section aria-label="Subtotal & Pajak" className="flex flex-col gap-4">
        <div className="min-w-0">
          <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Subtotal &amp; Pajak</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Akumulasi PPN per transaksi ON-CALL pada filter ini; PPH hanya penanda status
          </p>
          <dl className="mt-3 space-y-1.5">
            <div className={rowCls}>
              <dt className={labelCls}>Total Charges</dt>
              <dd id="tax-total-value" className={valueCls}>{fmtMoney(total)}</dd>
            </div>
            <div className={rowCls}>
              <dt className={labelCls}>PPN</dt>
              <dd id="tax-ppn-value" className={`${valueCls} ${ppnRows > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500 font-semibold'}`}>
                {ppnRows > 0 ? fmtMoney(ppnTotal) : 'Non PPN'}
              </dd>
            </div>
            <div className={rowCls}>
              <dt className={labelCls}>PPH</dt>
              <dd id="tax-pph-value" className={`${valueCls} ${pphCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 font-semibold'}`}>
                {pphCount > 0 ? `${pphCount} transaksi` : 'Non PPH'}
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
      </section>
    </Reveal>
  );
}
