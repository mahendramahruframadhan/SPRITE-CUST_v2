// Tab Kanban Client Follow-Up (adaptasi prototipe "Kanban Client Follow-Up
// (gaya Trello).html" ke konvensi app: data dari useFollowups, aksi lewat
// modal form/detail yang sudah ada).
// Design Read: papan kerja data operasional internal tim support, dial
// ENERGY 2 / RHYTHM 2 / MOTION 2, radius rounded-2xl (DESIGN.md).
// Alasan (R-31): board = surface kartu tema (permintaan owner 2026-10-21:
// tanpa gradien, tanpa warna hardcode); kolom 4 status = persis daftar
// STATUS hook, bukan grid seragam (R-14); chip follow-up memakai warna
// semantik tema (merah=telat, amber=hari ini, emerald=selesai, netral
// belum jatuh tempo, R-09); drag antar kolom mengubah status sungguhan via
// hook (riwayat catatan + resolved_at otomatis, R-26); urutan dalam kolom
// tetap (overdue dulu, lalu tanggal) karena model data tak menyimpan tata
// letak khusus; klik kartu = modal detail supaya layar sentuh dapat jalur
// yang sama (R-03); keyboard: kartu fokus + Enter membuka detail (R-32).
/* eslint-disable react/forbid-elements -- kartu kanban butuh state drag/aria kustom; Button.tsx tidak punya padanan (className hanya layout, Button.jsx). */
import { useMemo, useState } from 'react';
import { STATUSES, isOverdue, overdueDays } from '../../hooks/useFollowups.js';
import { Button } from '../ui/Button.jsx';

// Gaya label/heading kolom = gaya label tabel halaman ini (R-31 sinkron).
const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';

// Warna label prioritas = pill pastel+border STATUS_PILL tab Daftar
// (semantik app: danger=rose, warning=amber/orange, success=emerald).
const PRIO = {
  Urgent: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  Tinggi: 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20',
  Sedang: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  Rendah: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
};

// Kartu anatomi tetap semua kolom (R-31, seragam): 1) prioritas kiri atas +
// PIC kanan atas, 2) judul (maks 2 baris) 3) baris follow-up 4) tag modul &
// client. Chip follow-up: makna warna semantik (late=danger rose,
// hari ini=warning amber, selesai=success emerald, default netral info),
// tag modul/client selalu netral satu class TAG.
const TAG = 'inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const TAG_TRUNK = 'truncate max-w-28';
const FU_CHIP = {
  late: 'inline-block max-w-full text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  now: 'inline-block max-w-full text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  done: 'inline-block max-w-full text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  def: TAG,
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
        <Button variant="primary" className="sm:ml-auto" onClick={() => onAddWithStatus('Open')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Tambah Issue
        </Button>
      </div>
      )}

      {/* Papan 4 kolom: surface kartu tema (tanpa gradien/hardcode, R-29) */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 min-w-max xl:min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-3 sm:p-4">
          {columns.map(({ status, cards }) => (
            <section
              key={status}
              aria-label={`Kolom ${status}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop(status)}
              className="min-w-[260px] rounded-xl bg-slate-50 dark:bg-slate-800/70 p-2 flex flex-col"
            >
              <h3 className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-1.5">
                <span className={`${LABEL} truncate`}>{status}</span>
                <span className="text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400">{cards.length}</span>
              </h3>

              <div className="mt-2 flex flex-col gap-2 min-h-6">
                {cards.length === 0 && <p className="px-1.5 py-2 text-xs text-slate-500 dark:text-slate-400">Tidak ada kartu.</p>}
                {cards.map((r) => {
                  const ovd = isOverdue(r, today);
                  const dueToday = r.status !== 'Selesai' && r.followupDate === today;
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
                      className={`cursor-grab active:cursor-grabbing text-left rounded-lg bg-white dark:bg-slate-900 p-3 shadow-sm border border-slate-100 dark:border-slate-700/60 flex flex-col gap-2 transition hover:outline hover:outline-2 hover:outline-brand-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${dragId === r.id ? 'opacity-40 rotate-1' : ''}`}
                    >
                      {/* Baris 1: prioritas kiri atas + PIC kanan atas */}
                      <span className="flex items-center justify-between gap-2">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${PRIO[r.priority] || 'bg-slate-200 text-slate-700'}`}>
                          {r.priority}
                        </span>
                        {r.pic && <span className="w-6 h-6 shrink-0 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center" title={r.pic}>{initials(r.pic)}</span>}
                      </span>

                      {/* Baris 2: judul (maks 2 baris, sama semua kolom) */}
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">{r.title}</span>

                      {/* Baris 3: follow-up — label judul kapital; makna semantik:
                          telat=rose(danger), hari ini=amber(warning),
                          selesai=emerald(success), belum jatuh tempo=netral */}
                      <span className={FU_CHIP[ovd ? 'late' : dueToday ? 'now' : r.status === 'Selesai' ? 'done' : 'def']}>
                        Follow-up {r.followupDate || '-'}
                        {ovd ? ` · telat ${overdueDays(r, today)} hari` : dueToday ? ' · hari ini' : ''}
                      </span>

                      {/* Baris 4: tag modul & client, chip netral selalu */}
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.module && <span className={TAG}>{r.module}</span>}
                        {r.client && <span className={`${TAG} ${TAG_TRUNK}`}>{r.client}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="mt-2 justify-start px-2"
                onClick={() => onAddWithStatus(status)}
              >
                + Tambah kartu di {status}
              </Button>
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
