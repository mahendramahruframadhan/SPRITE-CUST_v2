// NotificationsBlock — port naming dari notif-3 (shadcn list notifikasi)
// ke JSX repo ini, TANPA data dummy: props-driven untuk sistem notifikasi
// antar-user asli (ActionsContext: { id, type, title, body, link, createdAt,
// readAt }).
//
// Adaptasinya (alasan tertulis, R-31 / antislop):
// - Tab Mentions dari komponen sumber dibuang: data tak punya konsep mention,
//   memalsukan kategori mati = lolos C-3/R-38. Yang tersisa fungsional:
//   Semua / Belum dibaca (satu-satunya state nyata dari readAt).
// - Avatar/foto pengirim tidak dirender: tabel notifications tak menyimpan
//   avatar maupun nama pengirim, initial naungan fiktif berarti mengarang
//   identitas (R-23/R-18). Penggantinya ikon surat dari set Icon.jsx:
//   notifikasi ini memang pesan antar-user (relevansi isi, bukan pilih
//   setarnya library — R-04).
// - Radix tabs/scroll-area tidak diinstal: filter 2 opsi + area scroll
//   kecil dalam dropdown 20rem lebar = kontrol berlebihan; repo sudah punya
//   pola segmented custom + scrollbar-thin.
// - Dot & warna unread: status fungsional (R-09), bukan dekorasi.
// - Scroll konten via max-h (prop heightClass) + scrollbar-thin, tiemah
//   tinggi tanpa nested ScrollArea.
//
// Aksi: klik baris = tandai dibaca (optimis) lalu onOpen(notif) — pemanggil
// (NotificationBell) menutup dropdown + navigasi ke notif.link. Hapus &
// tandai-semua juga props. Kosong/belum-muat/semua-dibaca = tiga state di sini.
import { useMemo, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { relTimeID } from '../../utils/relTime.js';
import Icon from '../Icon.jsx';

// Filter preset: 'all' | 'unread'. Dua state, bukan tiga tab kosong.
const FILTERS = [
  { id: 'all', label: 'Semua', match: () => true },
  { id: 'unread', label: 'Belum dibaca', match: (n) => !n.readAt },
];

export default function NotificationsBlock({
  items = [],
  ready = true,
  heightClass = 'max-h-72',
  onOpen,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  className,
}) {
  const [filter, setFilter] = useState('all');

  const unreadCount = useMemo(() => items.filter((n) => !n.readAt).length, [items]);
  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
    return items.filter((it) => f.match(it));
  }, [items, filter]);

  const activate = async (n) => {
    // Optimis ala ActionsContext: tandai dibaca dulu, bila API gagal refetch
    // dipercaya liar penggil. Navigasi berlanjut walau read-fail (tandabaca
    // cukup penting untuk token habis, bukan penghalang untuk intinya).
    if (onMarkRead) await onMarkRead(n.id);
    onOpen?.(n);
  };

  return (
    <div className={className} data-slot="notifications-3">
      {/* Filter + tandai semua dibaca */}
      <div className="flex items-center gap-1.5 px-3.5 pb-2 pt-2.5">
        <div className="flex-1 grid grid-cols-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5" role="group" aria-label="Saring notifikasi">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count = f.id === 'unread' ? unreadCount : items.length;
            return (
              <button
                type="button"
                key={f.id}
                aria-pressed={active}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-bold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                  active
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                )}
              >
                {f.label}
                {count > 0 && f.id === 'unread' ? <span className="ml-1 text-brand-600 dark:text-brand-300">{count}</span> : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onMarkAllRead?.()}
          disabled={!ready || unreadCount === 0}
          title={`Tandai ${unreadCount} notifikasi dibaca`}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition disabled:pointer-events-none disabled:text-slate-300 dark:disabled:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          Tandai dibaca
        </button>
      </div>

      {/* Daftar */}
      <ul className={cn('scrollbar-thin overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 border-t border-slate-100 dark:border-slate-800/80', heightClass)} role="list">
        {!ready ? (
          <li className="px-4 py-5 text-[11px] text-slate-500 dark:text-slate-400 text-center">Memuat notifikasi...</li>
        ) : visible.length === 0 ? (
          <li className="px-4 py-6 text-center">
            <span className="mx-auto w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center" aria-hidden="true">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <p className="mt-1.5 text-[12px] font-bold text-slate-700 dark:text-slate-200">
              {filter === 'unread' ? 'Semua sudah dibaca' : 'Belum ada notifikasi'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {filter === 'unread' ? 'Tidak ada yang tertunda dari pesan masuk.' : 'Nanti muncul di sini saat ada yang dikirim ke kamu.'}
            </p>
          </li>
        ) : (
          visible.map((n) => {
            const unread = !n.readAt;
            return (
              <li key={n.id} role="listitem" className={cn('group/item', unread && 'bg-brand-50/60 dark:bg-brand-500/10')}>
                <div className="flex items-start gap-2 pl-3.5 pr-2 py-2.5">
                  <span className={cn('shrink-0 w-8 h-8 rounded-lg grid place-items-center mt-0.5', unread ? 'bg-brand-100/70 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500')}>
                    <Icon name="mail" className="w-4 h-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => activate(n)}
                    title={n.title}
                    className="min-w-0 flex-1 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                  >
                    <span className="flex items-center gap-1.5">
                      {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600 dark:bg-brand-400" aria-hidden="true" />}
                      <span className={cn('truncate text-[12px] leading-snug', unread ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200')}>{n.title}</span>
                    </span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{n.body}</span> : null}
                    <time className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums" dateTime={n.createdAt} title={new Date(n.createdAt || Date.now()).toLocaleString('id-ID')}>
                      {relTimeID(n.createdAt)}
                    </time>
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus notifikasi ${n.title}`}
                    onClick={() => onDelete?.(n.id)}
                    className="shrink-0 w-7 h-7 grid place-items-center rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M8 7l1 13h6l1-13" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
