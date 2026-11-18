// Tab bar internal /report. Ringkasan tetap tab pertama; 10 tab rekap
// mengikuti konfigurasi recapTabs. Panah kiri/kanan memindah tab + fokus.
import { ALL_REPORT_TABS } from '../../config/recapTabs.js';

export default function RecapTabs({ active = 'ringkasan', onChange }) {
  const tabs = ALL_REPORT_TABS;
  const move = (index, step) => {
    const next = (index + step + tabs.length) % tabs.length;
    onChange?.(tabs[next].id);
    document.getElementById(`recap-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div className="no-print bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 px-2 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
      <div
        role="tablist"
        aria-label="Rekap Report Summary"
        className="flex items-stretch gap-1 overflow-x-auto scrollbar-thin"
      >
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`recap-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={tab.id === 'ringkasan' ? 'report-panel-ringkasan' : `recap-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange?.(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') move(i, 1);
                else if (e.key === 'ArrowLeft') move(i, -1);
                else if (e.key === 'Home') move(i, -i);
                else if (e.key === 'End') move(i, tabs.length - 1 - i);
                else return;
                e.preventDefault();
              }}
              className={`shrink-0 whitespace-nowrap px-3 py-3 min-h-[44px] text-[12px] font-bold border-b-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-t-lg ${
                selected
                  ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
