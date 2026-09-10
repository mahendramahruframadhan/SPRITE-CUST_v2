import { useEffect, useRef } from 'react';

// Popup detail kasus bersama (dipakai Billing & Finance Audit & Dashboard).
// c: data kasus | chips: [{ text, className }] | rows: [[label, value]] flat
// | sections: [{ title, rows: [[label, value]] }] (opsional, dikelompokkan) | notes: { label, text }
export default function CaseDetailModal({ c, kicker, title, chips = [], rows = [], sections = null, notes = null, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!c) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [c, onClose]);

  if (!c) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="case-detail-title">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-fast">
        {/* Header */}
        <div className="bg-brand-700 text-white px-6 py-5 shrink-0">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-200">{kicker}</p>
              <h3 id="case-detail-title" className="mt-1 text-xl font-extrabold truncate">
                {title}
              </h3>
              {chips.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <span key={chip.text} className={`text-[10px] font-bold border rounded-full px-2.5 py-1 ${chip.className}`}>
                      {chip.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Tutup detail kasus"
              className="shrink-0 rounded-lg p-2 text-brand-100 hover:bg-white/15 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* Isi */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto scrollbar-thin">
          <div className="bg-brand-50/60 border border-brand-100 rounded-xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-600 mb-1.5">Issue</p>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">{c.issue || '-'}</p>
          </div>
          {sections ? (
            <div className="space-y-5">
              {sections.map((s) => (
                <section key={s.title}>
                  <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                    <span aria-hidden="true" className="inline-block w-4 h-[3px] bg-brand-600" />
                    {s.title}
                    <span aria-hidden="true" className="flex-1 h-px bg-slate-100" />
                  </p>
                  <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                    {s.rows.map(([k, v]) => (
                      <div key={k} className="border-b border-slate-100 pb-2.5">
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{k}</dt>
                        <dd className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ) : rows.length > 0 && (
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {rows.map(([k, v]) => (
                <div key={k} className="border-b border-slate-100 pb-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{k}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {notes && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">{notes.label}</p>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{notes.text || '-'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
