// Modal detail issue: ringkasan + riwayat catatan + aksi Ubah/Hapus.
// Alasan (R-31): baris halaman utama hanya untuk baca (satu pola dengan
// halaman Client & Brand — baris diketuk ke modal detail, aksi terpusat di
// sini); catatan berbentuk timeline karena PRD minta riwayat pengecekan
// berurutan termasuk catatan otomatis perubahan status.
import { useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { STATUSES } from '../../hooks/useFollowups.js';

const dl = 'flex items-center justify-between gap-3';
const dt = 'text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0';
const dd = 'text-right font-semibold text-slate-800 dark:text-slate-100 min-w-0';

const statusPillCls = {
  Open: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  'Perlu Pengecekan': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  'Menunggu Client': 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20',
  Selesai: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
};

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function FollowupDetailModal({ item, onClose, onEdit, onDelete, onAddNote, onStatusChange }) {
  const [noteText, setNoteText] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  if (!item) return null;

  function sendNote(e) {
    e?.preventDefault();
    if (!noteText.trim()) return;
    onAddNote(noteText.trim());
    setNoteText('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detail issue ${item.title}`}
        className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl animate-fade-in-fast"
      >
        <div className="bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white">
                {item.client} · {item.module}
              </p>
              <h3 className="font-bold truncate" title={item.title}>{item.title}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Tutup detail"
              className="shrink-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15 focus-visible:ring-white/70"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>

        <dl className="px-5 py-4 space-y-2.5 text-sm border-b border-slate-100 dark:border-slate-800">
          <div className={dl}>
            <dt className={dt}>Status</dt>
            <dd>
              {/* Ganti status langsung dari modal detail: catatan riwayat
                  otomatis + resolved_at ditangani lapisan data. */}
              <select
                value={item.status}
                onChange={(e) => onStatusChange(e.target.value)}
                aria-label="Ganti status issue"
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border cursor-pointer min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition ${statusPillCls[item.status] || ''}`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </dd>
          </div>
          <div className={dl}>
            <dt className={dt}>Prioritas</dt>
            <dd className={dd}>{item.priority}</dd>
          </div>
          <div className={dl}>
            <dt className={dt}>Tanggal issue</dt>
            <dd className={dd}>{item.issueDate}</dd>
          </div>
          <div className={dl}>
            <dt className={dt}>Follow-up</dt>
            <dd className={dd}>{item.followupDate}</dd>
          </div>
          {item.pic && (
            <div className={dl}>
              <dt className={dt}>PIC</dt>
              <dd className={dd}>{item.pic}</dd>
            </div>
          )}
          {item.description && (
            <div>
              <dt className={`${dt} mb-1`}>Detail</dt>
              <dd className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{item.description}</dd>
            </div>
          )}
          {item.resolvedAt && (
            <div className={dl}>
              <dt className={dt}>Selesai pada</dt>
              <dd className={dd}>{fmtDateTime(item.resolvedAt)}</dd>
            </div>
          )}
        </dl>

        <div className="px-5 py-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Riwayat catatan
          </h4>
          <form onSubmit={sendNote} className="flex gap-2 mb-3">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Hasil pengecekan terbaru…"
              aria-label="Tambah catatan"
              className="flex-1 min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition"
            />
            <Button variant="secondary" type="submit" disabled={!noteText.trim()} className="shrink-0">Kirim</Button>
          </form>
          {item.notes.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
              Belum ada catatan.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {item.notes.map((n) => (
                <li key={n.id} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${n.auto ? 'bg-indigo-400' : 'bg-brand-500'}`}
                  />
                  <div className="min-w-0">
                    <p className={`text-xs leading-relaxed ${n.auto ? 'text-indigo-600 dark:text-indigo-300 font-semibold italic' : 'text-slate-700 dark:text-slate-200'}`}>
                      {n.text}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{fmtDateTime(n.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="px-5 pb-5">
          {confirmDel ? (
            <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/5 p-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Hapus issue <span className="font-bold">{item.title}</span> permanen?
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button variant="destructive" onClick={onDelete} className="flex-1">Ya, hapus</Button>
                <Button variant="secondary" onClick={() => setConfirmDel(false)} className="flex-1">Batal</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="primary" onClick={onEdit} className="flex-1 active:scale-[.98]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
                Ubah
              </Button>
              {/* eslint-disable-next-line react/forbid-elements -- tombol hapus bertint rose kustom */}
              <button
                onClick={() => setConfirmDel(true)}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 text-sm font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 px-4 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 active:bg-rose-100 dark:active:bg-rose-500/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
              >
                Hapus
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
