import { useEffect, useRef } from 'react';
import { Button } from './ui/Button.jsx';
import { ScrollArea } from './ui/ScrollArea.jsx';
import { HistoryTracking } from './ui/HistoryTracking.jsx';

// Modal timeline riwayat (siapa, berbuat apa, kapan) — dipakai Finance/Audit
// (invoice+PDF) dan POPI NAVA (log aktivitas + riwayat per outlet).
// history: [{ who, action, detail, category, createdAt }] | title: nama entitas
// label: eyebrow di header | loading/error: state muat & gagal | onClose
const fmtTime = (s) => {
  const t = String(s || '');
  if (!t) return '-';
  const d = t.slice(0, 10);
  const h = t.slice(11, 16);
  return h && h !== t ? `${d} ${h}` : d;
};

export default function InvoiceHistoryModal({ title, subtitle, label = 'Riwayat Kasus', history = [], loading = false, error = null, onClose }) {
  const closeRef = useRef(null);
  // Stabil: simpan onClose di ref agar efek cukup dipasang sekali
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="inv-history-title">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-fade-in-fast">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="shrink-0 rounded-xl bg-white/15 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100">{label}</p>
              <h3 id="inv-history-title" className="mt-0.5 font-extrabold truncate" title={title}>{title}</h3>
              {subtitle && <p className="text-[11px] text-emerald-100/90 truncate">{subtitle}</p>}
            </div>
            <Button
              ref={closeRef}
              variant="ghost"
              size="icon"
              type="button"
              onClick={onClose}
              aria-label="Tutup riwayat"
              className="shrink-0 rounded-lg text-emerald-50 hover:bg-white/15 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1 min-h-0 px-5 py-4">
          {loading ? (
            <p aria-busy="true" className="text-center text-[13px] font-semibold text-slate-500 dark:text-slate-400 py-8 animate-pulse">Memuat riwayat…</p>
          ) : error ? (
            <p className="text-center text-[13px] font-semibold text-slate-500 dark:text-slate-400 py-8">{error}</p>
          ) : history.length === 0 ? (
            <p className="text-center text-[13px] font-semibold text-slate-500 dark:text-slate-400 py-8">Belum ada riwayat tercatat.</p>
          ) : (
            <HistoryTracking
              steps={history.map((h) => {
                const auto = h.who === 'Sistem';
                return {
                  id: h.createdAt,
                  name: h.action,
                  timestamp: fmtTime(h.createdAt),
                  description: [auto ? 'Sistem · otomatis' : `oleh ${h.who}`, h.category, h.detail]
                    .filter(Boolean)
                    .join(' · '),
                  isCompleted: true,
                };
              })}
            />
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
