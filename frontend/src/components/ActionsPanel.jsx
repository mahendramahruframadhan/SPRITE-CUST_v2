// Panel "Agenda Hari Ini" di dashboard: kartu per grup aksi (pengingat audit
// ON-CALL, client follow-up, audit Popi Nava, kontrak client) — grup kosong
// senyap. Data dari ActionsContext (sama dengan lonceng topbar) + tombol muat
// ulang agar kutukan data basi bisa dijembatani tanpa reload halaman.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActions } from '../context/ActionsContext.jsx';
import { groupMeta, ICON_BY_ID } from '../lib/actionsMeta.js';
import Icon from './Icon.jsx';

const TODAY_LONG = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function ActionsPanel() {
  const { groups, total, ready, refresh } = useActions();
  const [muat, setMuat] = useState(false);

  async function muatUlang() {
    if (muat) return;
    setMuat(true);
    try {
      await refresh();
    } finally {
      setMuat(false);
    }
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm animate-fade-in-fast">
      {/* Kepala panel: identitas + kesempatan muat ulang */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white grid place-items-center shadow-sm shadow-brand-600/25">
            <Icon name="list-checks" className="w-5 h-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white leading-tight flex items-center gap-2">
              Agenda Hari Ini
              {ready && groups.length > 0 && (
                <span className="shrink-0 text-[10px] font-bold rounded-full bg-rose-500 text-white px-2 py-0.5 tabular-nums">
                  {total} hal
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {ready && groups.length === 0
                ? 'Tidak ada yang perlu diikuti hari ini — dashboard bersih.'
                : `${TODAY_LONG} · pilih kartu untuk membuka halamannya`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={muatUlang}
          disabled={muat}
          aria-label="Muat ulang agenda"
          title="Muat ulang agenda"
          className="shrink-0 grid h-9 w-9 place-items-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${muat ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356m-4.992 0 4.992 4.992M7.977 14.652H2.985v4.992m0-.004 4.992-4.988M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {!ready && groups.length === 0 ? (
        <div className="grid sm:grid-cols-2 gap-3 mt-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 animate-pulse">
              <div className="h-3.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-2.5 h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-2 h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? null : (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {groups.map((g) => {
            const meta = groupMeta(g.id);
            const fwd = g.path ? { to: g.path } : {};
            // Grup tanpa path (notif) tampil sebagai kartu — detail & aksi per
            // notifikasi ada di lonceng, bukan di panel ini.
            return (
              <Link
                key={g.id}
                {...fwd}
                as={g.path ? undefined : 'div'}
                className={`group relative rounded-xl border border-slate-100 dark:border-slate-800 p-4 overflow-hidden ${
                  g.path ? 'hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition' : ''
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60`}
              >
                {/* garis aksen kiri kartu (satu aksen titik fokus per kartu) */}
                <span className={`absolute inset-y-0 left-0 w-1 ${meta.dot}`} aria-hidden="true" />
                <span className="pl-2 flex items-center gap-3">
                  <span className={`shrink-0 w-9 h-9 rounded-lg ${meta.soft} grid place-items-center`}>
                    <Icon name={ICON_BY_ID[g.id] || 'cases'} className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block text-[13px] font-extrabold text-slate-900 dark:text-white truncate">{g.title}</span>
                      <span className={`shrink-0 text-[10px] font-extrabold rounded-full px-2 py-0.5 tabular-nums ${meta.chip}`}>
                        {g.count}
                      </span>
                    </span>
                    {g.note && <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{g.note}</span>}
                  </span>
                </span>
                {g.items.length > 0 && (
                  <ul className="mt-3 pl-2 space-y-1.5">
                    {g.items.map((it, i) => (
                      <li key={`${g.id}-item-${i}`} className="flex items-start gap-2 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{it.label}</span>
                          <span className="block truncate text-slate-400 dark:text-slate-500">{it.sub}</span>
                        </span>
                      </li>
                    ))}
                    {g.left > 0 && (
                      <li className="text-[10px] font-bold text-brand-700 dark:text-brand-300 pl-3.5">+{g.left} lainnya di {meta.name}</li>
                    )}
                  </ul>
                )}
                {g.path && (
                  <span className="mt-3 pl-2 inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
                    Buka {meta.name}
                    <svg className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
