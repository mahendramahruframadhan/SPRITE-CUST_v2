// Lonceng notifikasi topbar: badge jumlah grup aksi aktif + dropdown ringkas
// per grup (klik grup = lompat ke halamannya). Escape & klik luar menutup.
// Data dari ActionsContext — fetch agregat di provider, bukan di sini.
// Warna/ikon grup dari lib/actionsMeta.js supaya identik dengan panel Agenda.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActions } from '../context/ActionsContext.jsx';
import { groupMeta, ICON_BY_ID } from '../lib/actionsMeta.js';
import Icon from './Icon.jsx';
import NotificationsBlock from './ui/notifications-3.jsx';

export default function NotificationBell() {
  const { groups, total, ready, notifs, markNotifRead, markAllNotifsRead, deleteNotif } = useActions();
  const [open, setOpen] = useState(false);
  const [openNotif, setOpenNotif] = useState(true); // grup "notif" terbuka duluan — konten intinya
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
      {/* Pemicu: lonceng + badge jumlah grup (fungsional: ada yang perlu dicek) */}
      <button
        type="button"
        aria-label={`Notifikasi${total ? `, ${total} hal perlu dicek` : ' — tidak ada'}`}
        aria-haspopup="true"
        aria-expanded={open}
        title="Yang harus dicek"
        onClick={() => setOpen((o) => !o)}
        className={`relative grid h-10 w-10 place-items-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
          open
            ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Icon name="followups" className="w-5 h-5" />
        {ready && groups.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center text-[10px] font-bold rounded-full bg-rose-500 text-white tabular-nums shadow-sm shadow-rose-500/40">
            {groups.length > 9 ? '9+' : groups.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Daftar yang harus dicek"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/10 dark:shadow-black/30 animate-fade-in-fast z-50 overflow-hidden"
        >
          {/* Kepala: identitas + ringkasan total (badge fungsional) */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
            <span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-[#4a4fe9] to-[#7c3aed] text-white grid place-items-center">
              <Icon name="list-checks" className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold text-slate-900 dark:text-white leading-tight">Yang Harus Dicek</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {ready && total ? `${total} hal perlu tindakan` : 'Tidak ada yang tertunda'}
              </p>
            </div>
            {ready && total > 0 && (
              <span className="shrink-0 text-[10px] font-bold rounded-full bg-rose-500 text-white px-2 py-0.5 tabular-nums">{total}</span>
            )}
          </div>

          {/* Daftar grup: ikon warna halamannya + item contoh */}
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
            {groups.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <span className="mx-auto w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 grid place-items-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </span>
                <p className="mt-2 text-[12px] font-bold text-slate-700 dark:text-slate-200">Tidak ada yang perlu diikuti</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Semua sudah tertangani hari ini.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {groups.map((g) => {
                  const meta = groupMeta(g.id);
                  const isNotif = g.id === 'notif';
                  return (
                    <li key={g.id} className={isNotif && openNotif ? '' : undefined}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          if (isNotif) {
                            // Grup notif tanpa page-path — detail dibuka di bawah, bukan jump.
                            setOpenNotif((v) => !v);
                            return;
                          }
                          setOpen(false);
                          navigate(g.path);
                        }}
                        className="w-full text-left flex items-start gap-3 px-4 py-3 min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60"
                      >
                        <span className={`shrink-0 w-9 h-9 rounded-xl ${meta.soft} grid place-items-center`}>
                          <Icon name={ICON_BY_ID[g.id] || 'cases'} className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100 truncate">{g.title}</span>
                            <span className={`shrink-0 text-[10px] font-extrabold rounded-full px-2 py-0.5 tabular-nums ${meta.chip}`}>{g.count}</span>
                          </span>
                          {g.note ? <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400 truncate">{g.note}</span> : null}
                          {g.items.length > 0 && (
                            <span className="mt-1.5 space-y-1 block">
                              {g.items.slice(0, 2).map((it, i) => (
                                <span key={`${g.id}-it-${i}`} className="flex items-center gap-1.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                                  <span className="truncate">{it.label}</span>
                                </span>
                              ))}
                              {(g.left > 0 || g.items.length > 2) && (
                                <span className="block pl-3 text-[10px] font-bold text-brand-700 dark:text-brand-300">
                                  +{Math.max(g.left, g.items.length - 2)} lainnya di {meta.name}
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                        <svg className={`mt-1.5 w-3.5 h-3.5 shrink-0 ${isNotif && openNotif ? 'rotate-90 text-brand-500' : 'text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5'} transition`} fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>

                      {/* Grup "notif": detail per notifikasi (bukan halaman tujuan) —
                          daftarnya ikut notif-3 (ui/notifications-3.jsx): filter
                          Semua/Belum dibaca + tandai semua, data ActionsContext */}
                      {isNotif && openNotif && (
                        <div className="border-t border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                          <NotificationsBlock
                            items={notifs}
                            ready={ready}
                            heightClass="max-h-60"
                            onMarkRead={markNotifRead}
                            onMarkAllRead={markAllNotifsRead}
                            onDelete={deleteNotif}
                            onOpen={(n) => {
                              setOpen(false);
                              navigate(n.link || '/dashboard');
                            }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Kaki: tautan ke panel yang berisi detail & tanggal lengkap */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/dashboard');
            }}
            className="w-full text-left px-4 py-3 text-[11px] font-bold text-brand-700 dark:text-brand-300 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60"
          >
            Lihat panel Agenda Hari Ini →
          </button>
        </div>
      )}
    </div>
  );
}
