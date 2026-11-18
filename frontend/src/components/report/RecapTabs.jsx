// Pemilih tampilan rekap internal /report. Satu dropdown untuk 12 tampilan
// (Ringkasan + 11 tab rekap) agar tidak ada deretan tab yang terpotong.
import { ALL_REPORT_TABS } from '../../config/recapTabs.js';

export default function RecapTabs({ active = 'ringkasan', onChange }) {
  const tabs = ALL_REPORT_TABS;

  return (
    <div className="no-print bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-3 sm:px-4 sm:py-3.5 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            Tampilan laporan
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300">
            Pilih rekap yang ingin dilihat
          </p>
        </div>
        <div className="relative w-full sm:w-[340px]">
          <label htmlFor="recap-tab-select" className="sr-only">
            Pilih tampilan laporan
          </label>
          <select
            id="recap-tab-select"
            value={active}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full min-h-[44px] appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-10 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-300 dark:focus:border-brand-500/40 transition"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
