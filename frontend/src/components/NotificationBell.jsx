// Lonceng notifikasi topbar: badge jumlah grup aksi aktif + dropdown ringkas
// per grup (klik grup = lompat ke halamannya). Escape & klik luar menutup.
// Data dari ActionsContext — fetch agregat di provider, bukan di sini.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActions } from '../context/ActionsContext.jsx';

export default function NotificationBell() {
  const { groups, total, ready } = useActions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Notifikasi${total ? `, ${total} hal perlu dicek` : ' — tidak ada'}`}
        aria-haspopup="true"
        aria-expanded={open}
        title="Yang harus dicek"
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <svg className={`w-5 h-5 transition ${open ? 'text-brand-600 dark:text-brand-400' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A12.674 12.674 0 0112 15.75a12.674 12.674 0 01-8.311 2.022 24.001 24.001 0 015.454-1.31m0 0A12.664 12.664 0 0012 20.25c1.125 0 2.216-.083 3.28-.674 0-1.25-.105-2.482-.31-3.686" />
        </svg>
        {ready && groups.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center text-[10px] font-bold rounded-full bg-rose-500 text-white tabular-nums">
            {groups.length > 9 ? '9+' : groups.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Daftar yang harus dicek"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto scrollbar-thin bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl animate-fade-in-fast z-50"
        >
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">Yang harus dicek</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {ready && total ? `${total} hal perlu tindakan hari ini.` : 'Tidak ada yang tertunda.'}
            </p>
          </div>
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Tidak ada yang perlu diikuti hari ini.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      navigate(g.path);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate">{g.title}</span>
                      <span className="shrink-0 text-[10px] font-bold rounded-full bg-brand-600 text-white px-2 py-0.5 tabular-nums">{g.count}</span>
                    </span>
                    {g.note ? <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{g.note}</span> : null}
                    {g.items.length > 0 && (
                      <span className="mt-1.5 space-y-1 block">
                        {g.items.slice(0, 3).map((it, i) => (
                          <span key={`${g.id}-it-${i}`} className="block text-[11px] text-slate-600 dark:text-slate-300 truncate">
                            · {it.label}
                          </span>
                        ))}
                        {g.left > 0 && (
                          <span className="block text-[10px] font-bold text-brand-700 dark:text-brand-300">+{g.left} lainnya</span>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="px-4 py-2.5 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
            Detail lengkap ada di panel “Agenda Hari Ini” dashboard.
          </p>
        </div>
      )}
    </div>
  );
}
