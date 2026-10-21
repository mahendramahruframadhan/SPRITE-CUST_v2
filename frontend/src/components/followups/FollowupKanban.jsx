// Tab Kanban Client Follow-Up (adaptasi prototipe "Kanban Client Follow-Up
// (gaya Trello).html" ke konvensi app: data dari useFollowups, aksi lewat
// modal form/detail yang sudah ada, warna brand Revota).
// Design Read: papan kerja data operasional internal tim support, dial
// ENERGY 2 / RHYTHM 2 / MOTION 2, radius rounded-2xl (DESIGN.md).
// Alasan (R-31): board gradien indigo→ungu = perpanjangan hero brand halaman
// ini (R-01, identitas); kolom 4 status = persis daftar STATUS hook, bukan
// grid seragam (R-14); chip tanggal/merah = status fungsional overdue (R-09);
// drag antar kolom mengubah status sungguhan via hook (riwayat catatan +
// resolved_at otomatis, R-26); urutan dalam kolom tetap (overdue dulu, lalu
// tanggal) karena model data tak menyimpan tata letak khusus; klik kartu =
// modal detail supaya layar sentuh dapat jalur yang sama (R-03); keyboard:
// kartu fokus + Enter membuka detail (R-32).
/* eslint-disable react/forbid-elements -- kartu/chip kanban adopsi gaya Trello dengan state drag & chip fungsional kustom; Button tak punya padanan (className hanya layout, Button.jsx). */
import { useMemo, useState } from 'react';
import { STATUSES, isOverdue, overdueDays } from '../../hooks/useFollowups.js';

const STATUS_LABELS = {
  Open: 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100',
  'Perlu Pengecekan': 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400',
  'Menunggu Client': 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300',
  Selesai: 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400',
};

// Warna label prioritas mengikuti makna urgency (fungsional, bukan dekorasi).
const PRIO = {
  Urgent: 'bg-rose-600 text-white',
  Tinggi: 'bg-orange-500 text-white',
  Sedang: 'bg-amber-300 text-slate-900',
  Rendah: 'bg-emerald-500 text-white',
};

const TODAY_CHIP = {
  done: 'bg-emerald-600 text-white',
  late: 'bg-rose-600 text-white',
  now: 'bg-amber-300 text-slate-900',
  def: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
};

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function FollowupKanban({ items, today, onOpenDetail, onStatusChange, onAddWithStatus, serverOk, bare = false }) {
  const [fClient, setFClient] = useState('');
  const [fModule, setFModule] = useState('');
  const [dragId, setDragId] = useState(null);

  const clientHints = useMemo(() => [...new Set(items.map((r) => r.client).filter(Boolean))], [items]);
  const moduleHints = useMemo(() => [...new Set(items.map((r) => r.module).filter(Boolean))], [items]);

  // Selesai hanya menampilkan 30 hari terakhir dari resolved_at (fallback
  // tanggal follow-up bila resolved_at kosong) — prototipe gaya Trello.
  const rows = useMemo(() => {
    const cutoffMs = new Date(`${today}T00:00:00`).getTime() - 30 * 864e5;
    return items.filter((r) => {
      if (fClient && r.client !== fClient) return false;
      if (fModule && r.module !== fModule) return false;
      if (r.status === 'Selesai') {
        const d = String(r.resolvedAt || r.followupDate || '').slice(0, 10);
        return d && new Date(`${d}T00:00:00`).getTime() >= cutoffMs;
      }
      return true;
    });
  }, [items, fClient, fModule, today]);

  const columns = useMemo(
    () =>
      STATUSES.map((st) => ({
        status: st,
        cards: rows
          .filter((r) => r.status === st)
          .slice()
          .sort((a, b) => Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || String(a.followupDate).localeCompare(String(b.followupDate)) || String(a.title).localeCompare(String(b.title))),
      })),
    [rows, today]
  );

  function handleDrop(status) {
    return (e) => {
      e.preventDefault();
      const id = dragId ?? e.dataTransfer.getData('text/plain');
      setDragId(null);
      if (id) onStatusChange(id, status);
    };
  }

  return (
    <div className="grid gap-3 sm:gap-4">
      {/* Filter + tambah: hanya di tampilan dalam tabs; layar penuh tanpa ini */}
      {!bare && (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="sm:w-52">
          <label htmlFor="kb-client" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Client</label>
          <select
            id="kb-client"
            value={fClient}
            onChange={(e) => setFClient(e.target.value)}
            className="min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 transition mt-1.5 w-full"
          >
            <option value="">Semua client</option>
            {clientHints.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="sm:w-44">
          <label htmlFor="kb-module" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Modul</label>
          <select
            id="kb-module"
            value={fModule}
            onChange={(e) => setFModule(e.target.value)}
            className="min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 transition mt-1.5 w-full"
          >
            <option value="">Semua modul</option>
            {moduleHints.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <button
          onClick={() => onAddWithStatus('Open')}
          className="sm:ml-auto min-h-[44px] px-4 text-sm font-semibold rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/25 hover:bg-brand-700 active:scale-[.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          + Tambah Issue
        </button>
      </div>
      )}

      {/* Papan 4 kolom: gradien = hero brand halaman (R-01, identitas) */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 min-w-max xl:min-w-0 rounded-2xl bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] p-3 sm:p-4">
          {columns.map(({ status, cards }) => (
            <section
              key={status}
              aria-label={`Kolom ${status}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop(status)}
              className="min-w-[260px] rounded-xl bg-slate-100/95 dark:bg-slate-800/90 p-2 flex flex-col"
            >
              <h3 className={`flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg ${STATUS_LABELS[status] || STATUS_LABELS.Open}`}>
                <span className="text-sm font-bold truncate">{status}</span>
                <span className="text-xs font-bold tabular-nums opacity-70">{cards.length}</span>
              </h3>

              <div className="mt-2 flex flex-col gap-2 min-h-6">
                {cards.length === 0 && <p className="px-1.5 py-2 text-xs text-slate-500 dark:text-slate-400">Tidak ada kartu.</p>}
                {cards.map((r) => {
                  const ovd = isOverdue(r, today);
                  const dueToday = r.status !== 'Selesai' && r.followupDate === today;
                  const chip = r.status === 'Selesai' ? 'done' : ovd ? 'late' : dueToday ? 'now' : 'def';
                  return (
                    <button
                      key={r.id}
                      draggable={dragId === null && true}
                      onDragStart={(e) => {
                        setDragId(r.id);
                        e.dataTransfer.setData('text/plain', r.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => onOpenDetail(r.id)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenDetail(r.id))}
                      aria-label={`${r.title}, status ${r.status}${ovd ? `, overdue ${overdueDays(r, today)} hari` : ''}`}
                      className={`cursor-grab active:cursor-grabbing text-left rounded-lg bg-white dark:bg-slate-900 p-2.5 shadow-sm border border-slate-100 dark:border-slate-700/60 transition hover:outline hover:outline-2 hover:outline-brand-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${dragId === r.id ? 'opacity-40 rotate-1' : ''}`}
                    >
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded mb-1.5 ${PRIO[r.priority] || 'bg-slate-200 text-slate-700'}`}>
                        {r.priority}
                      </span>
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1.5 line-clamp-2">{r.title}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${TODAY_CHIP[chip]}`}>
                          Follow-up {r.followupDate || '-'}
                          {ovd ? ` · telat ${overdueDays(r, today)} hari` : dueToday ? ' · hari ini' : ''}
                        </span>
                        {r.module && <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{r.module}</span>}
                        {r.client && <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-24">{r.client}</span>}
                        {r.pic && <span className="ml-auto w-6 h-6 shrink-0 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center" title={r.pic}>{initials(r.pic)}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => onAddWithStatus(status)}
                className="mt-2 min-h-[44px] px-2 py-1.5 text-left text-sm font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                + Tambah kartu di {status}
              </button>
            </section>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Seret kartu ke kolom lain untuk mengganti status (riwayat catatan &amp; selesai otomatis lewat modal yang sama).
        Di layar sentuh, ketuk kartu untuk mengganti status langsung dari modal detail.
        Urutan dalam kolom: overdue dulu, lalu tanggal follow-up. Kolom Selesai hanya menampilkan 30 hari terakhir.
        {serverOk === false ? ' Mode offline: data tersimpan di browser ini.' : ''}
      </p>
    </div>
  );
}
