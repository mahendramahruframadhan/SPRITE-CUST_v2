// Panel satu tab rekap: KPI, tabel ringkas, cetak section, dan ekspor CSV.
// Data sudah diagregasi backend; panel tidak menghitung ulang angka bisnis.
import { buildRecapCsv, recapCsvFilename } from '../../lib/recapExport.js';
import { printSection } from '../../lib/printSection.js';
import { EmptyRow, LoadingRow, Pill } from '../DataTable.jsx';
import { formatRecapValue } from '../../config/recapTabs.js';

const SEVERITY_TONE = {
  Tinggi: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  Sedang: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  Rendah: 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
};

export default function RecapPanel({ tab, data, loading = false, error = '', periode = '', to = '', generatedAt = '' }) {
  if (!tab) return null;
  const kpis = tab.kpis || [];
  const columns = tab.columns || [];
  const values = data?.kpis || {};
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const totals = data?.totals;
  const basis = data?.note ? `${tab.basis} · ${data.note}` : tab.basis;
  const dataAt = generatedAt ? formatRecapValue('datetime', generatedAt) : '';

  function exportCsv() {
    const csv = buildRecapCsv(tab, data, { periode, basis });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = recapCsvFilename(tab.id, to);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      id={`recap-panel-${tab.id}`}
      role="region"
      aria-label={`Panel rekap ${tab.label}`}
      data-section={`recap-${tab.id}`}
      className="space-y-5"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 p-5 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">{tab.label}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tab.description}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Periode: <span className="font-semibold text-slate-600 dark:text-slate-300">{periode || 'Semua tanggal'}</span>
              {' · '}Basis: <span className="font-semibold text-slate-600 dark:text-slate-300">{basis}</span>
              {dataAt && <>{' · '}Data: <span className="font-semibold text-slate-600 dark:text-slate-300">{dataAt}</span></>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => printSection(`recap-${tab.id}`)}
              title={`Cetak ${tab.label}`}
              aria-label={`Cetak ${tab.label}`}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-300 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-brand-200 dark:hover:border-brand-500/30 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2m-12-3h12v6H6v-6z" />
              </svg>
              Cetak
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={loading || !!error}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] px-3 rounded-xl transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.key} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-4 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.1em] leading-tight">
              {k.label}
            </p>
            <p className="mt-2 text-[20px] leading-tight font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white break-words">
              {loading ? '…' : formatRecapValue(k.type, values[k.key])}
            </p>
          </div>
        ))}
      </div>

      <div className="report-card">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                {columns.map((c) => (
                  <th key={c.key} className={`py-2.5 px-3 font-bold whitespace-nowrap ${c.type === 'number' || c.type === 'money' ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <LoadingRow colSpan={columns.length} />
              ) : error ? (
                <EmptyRow colSpan={columns.length}>Gagal memuat data rekap.</EmptyRow>
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={columns.length}>{tab.empty}</EmptyRow>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${tab.id}-${i}`} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/60 dark:even:bg-slate-800/40">
                    {columns.map((c) => {
                      const text = formatRecapValue(c.type, r[c.key]);
                      const numeric = c.type === 'number' || c.type === 'money';
                      const wrap = c.key === 'note' || c.key === 'title';
                      return (
                        <td
                          key={c.key}
                          title={wrap ? String(r[c.key] ?? '') : undefined}
                          className={`py-2.5 px-3 ${numeric ? 'text-right tabular-nums whitespace-nowrap' : ''} ${wrap ? 'max-w-[360px]' : 'whitespace-nowrap'}`}
                        >
                          {c.type === 'severity' ? (
                            <Pill size="xs" tone={SEVERITY_TONE[r[c.key]] || ''}>{text}</Pill>
                          ) : (
                            text
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            {totals && !loading && !error && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-extrabold text-slate-900 dark:text-white">
                  {columns.map((c, i) => {
                    const raw = totals[c.key];
                    const text = i === 0 ? 'Total' : raw === undefined || raw === null || raw === '' ? '' : formatRecapValue(c.type, raw);
                    const numeric = c.type === 'number' || c.type === 'money';
                    return (
                      <td key={c.key} className={`py-2.5 px-3 ${numeric ? 'text-right tabular-nums whitespace-nowrap' : 'whitespace-nowrap'}`}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}
