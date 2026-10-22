// Panel "Agenda Hari Ini" di dashboard: kartu per grup aksi (client follow-up,
// kasus & tagihan, audit Popi Nava, kontrak client) — grup kosong senyap.
// Data dari ActionsContext (sama dengan lonceng topbar).
import { Link } from 'react-router-dom';
import { useActions } from '../context/ActionsContext.jsx';
import Icon from './Icon.jsx';

const GROUP_META = {
  followups: { soft: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400', name: 'Follow-Up' },
  kasus: { soft: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400', name: 'Billing & Audit' },
  audit: { soft: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', name: 'Popi Nava' },
  kontrak: { soft: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400', name: 'Client & Brand' },
};

const ICON_BY_ID = { followups: 'followups', kasus: 'billing', audit: 'store', kontrak: 'clients' };

export default function ActionsPanel() {
  const { groups, total, ready } = useActions();

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm animate-fade-in-fast">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            Agenda Hari Ini
            {ready && groups.length > 0 && (
              <span className="shrink-0 text-[10px] font-bold rounded-full bg-rose-500 text-white px-2 py-0.5 tabular-nums">{total}</span>
            )}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {ready && groups.length === 0
              ? 'Tidak ada yang perlu diikuti hari ini.'
              : 'Yang perlu dicek saat dashboard dibuka — pilih untuk membuka halamannya.'}
          </p>
        </div>
      </div>

      {!ready && groups.length === 0 ? (
        <div className="grid sm:grid-cols-2 gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 animate-pulse">
              <div className="h-3.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-2 h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? null : (
        <div className="grid sm:grid-cols-2 gap-3">
          {groups.map((g) => {
            const meta = GROUP_META[g.id] || GROUP_META.kasus;
            return (
              <Link
                key={g.id}
                to={g.path}
                className="group rounded-xl border border-slate-100 dark:border-slate-800 p-4 hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <span className="flex items-center gap-2">
                  <span className={`w-8 h-8 shrink-0 rounded-lg ${meta.soft} grid place-items-center`}>
                    <Icon name={ICON_BY_ID[g.id] || 'cases'} className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-extrabold text-slate-900 dark:text-white truncate">{g.title}</span>
                    {g.note && <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{g.note}</span>}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold rounded-full bg-brand-600 text-white px-2 py-0.5 tabular-nums">{g.count}</span>
                </span>
                {g.items.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {g.items.map((it, i) => (
                      <li key={`${g.id}-item-${i}`} className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                        · {it.label}
                      </li>
                    ))}
                    {g.left > 0 && <li className="text-[10px] font-bold text-brand-700 dark:text-brand-300">+{g.left} lainnya</li>}
                  </ul>
                )}
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 group-hover:gap-1.5 transition-all">
                  Buka {meta.name}
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
