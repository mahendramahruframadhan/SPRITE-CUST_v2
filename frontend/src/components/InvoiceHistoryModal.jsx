import { useEffect, useRef } from 'react';

// Modal timeline riwayat invoice + PDF per kasus (siapa, berbuat apa, kapan).
// history: [{ who, action, detail, createdAt }] | title: nama file/kasus | onClose
const fmtTime = (s) => {
  const t = String(s || '');
  if (!t) return '-';
  const d = t.slice(0, 10);
  const h = t.slice(11, 16);
  return h && h !== t ? `${d} ${h}` : d;
};

// Warna lencana kategori aktivitas
const CAT_STYLE = {
  Invoice: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  Validasi: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
};
const catStyle = (c) => CAT_STYLE[c] || 'bg-slate-100 dark:bg-slate-500/15 text-slate-500 dark:text-slate-400';

export default function InvoiceHistoryModal({ title, subtitle, history = [], onClose }) {
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
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100">Riwayat Kasus</p>
              <h3 id="inv-history-title" className="mt-0.5 font-extrabold truncate" title={title}>{title}</h3>
              {subtitle && <p className="text-[11px] text-emerald-100/90 truncate">{subtitle}</p>}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Tutup riwayat"
              className="shrink-0 rounded-lg p-2 text-emerald-50 hover:bg-white/15 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-5 py-4">
          {history.length === 0 ? (
            <p className="text-center text-[13px] font-semibold text-slate-500 dark:text-slate-400 py-8">Belum ada riwayat tercatat.</p>
          ) : (
            <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
              {history.map((h, i) => {
                const auto = h.who === 'Sistem';
                return (
                  <li key={`${h.createdAt}-${i}`} className="relative pl-5">
                    <span aria-hidden="true" className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 ${auto ? 'bg-violet-100 border-violet-400 dark:bg-violet-500/20' : 'bg-emerald-100 border-emerald-500 dark:bg-emerald-500/20'} `} />
                    <p className="text-[12px] font-bold text-slate-700 dark:text-slate-200 leading-snug">{h.action}</p>
                    {h.detail && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 break-words">{h.detail}</p>}
                    <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      {h.who} · {fmtTime(h.createdAt)}
                      {h.category && <span className={`ml-1.5 rounded-full px-1.5 py-px ${catStyle(h.category)}`}>{h.category}</span>}
                      {auto && <span className="ml-1.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300 px-1.5 py-px">otomatis</span>}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
