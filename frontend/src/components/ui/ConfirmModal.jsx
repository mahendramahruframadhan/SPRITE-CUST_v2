import { useEffect, useRef, useState } from 'react';

// Modal konfirmasi generik (struktur/styling mengikuti DeleteConfirmModal
// yang dipakai Finance). Props:
// - open, title, description, confirmLabel, cancelLabel
// - variant: "danger" | "primary"
// - requireTypedConfirmation?: string — tombol Confirm aktif hanya bila
//   ketikan persis sama (untuk aksi destruktif seperti reset)
// - loading: kunci tombol + cegah double-click/Escape saat async berjalan
// Fokus awal: Batal (aman untuk danger), Confirm untuk primary. Tab di-trap
// di dalam dialog, Escape = batal (kecuali loading).
export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  variant = 'primary',
  requireTypedConfirmation,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const [ketikan, setKetikan] = useState('');
  const batalRef = useRef(null);
  const confirmRef = useRef(null);
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (open) setKetikan('');
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    // Fokus aman: Batal untuk danger, Confirm untuk primary
    const t = setTimeout(() => {
      (variant === 'danger' ? batalRef : confirmRef).current?.focus();
    }, 0);
    function saatTombol(e) {
      if (e.key === 'Escape' && !loading) {
        onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const fokus = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!fokus || fokus.length === 0) return;
      const awal = fokus[0];
      const akhir = fokus[fokus.length - 1];
      if (e.shiftKey && document.activeElement === awal) {
        e.preventDefault();
        akhir.focus();
      } else if (!e.shiftKey && document.activeElement === akhir) {
        e.preventDefault();
        awal.focus();
      }
    }
    document.addEventListener('keydown', saatTombol);
    const gayaAwal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', saatTombol);
      document.body.style.overflow = gayaAwal;
    };
  }, [open, variant, loading]);

  if (!open) return null;
  const butuhKetik = !!requireTypedConfirmation;
  const ketikanCocok = !butuhKetik || ketikan === requireTypedConfirmation;
  const bahaya = variant === 'danger';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={() => { if (!loading) onCancel(); }}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className={`px-5 pt-5 pb-4 text-white bg-gradient-to-r ${bahaya ? 'from-rose-600 to-red-500' : 'from-brand-600 to-brand-500'}`}>
          <h2 id="confirm-modal-title" className="text-lg font-extrabold">{title}</h2>
          {description && (
            <p id="confirm-modal-desc" className="mt-1 text-[13px] leading-relaxed text-white/85">{description}</p>
          )}
        </div>
        <div className="px-5 py-4">
          {butuhKetik && (
            <div>
              <label htmlFor="confirm-ketik" className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Ketik <span className="font-mono font-bold">{requireTypedConfirmation}</span> untuk melanjutkan
              </label>
              <input
                id="confirm-ketik"
                type="text"
                value={ketikan}
                onChange={(e) => setKetikan(e.target.value)}
                autoComplete="off"
                placeholder={requireTypedConfirmation}
                className="mt-1.5 w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-rose-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              ref={batalRef}
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="min-h-[44px] inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              disabled={loading || !ketikanCocok}
              title={butuhKetik && !ketikanCocok ? `Ketik ${requireTypedConfirmation} dulu` : undefined}
              className={`min-h-[44px] inline-flex items-center rounded-xl px-4 py-2 text-[12px] font-extrabold text-white shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed ${bahaya ? 'bg-gradient-to-r from-rose-600 to-red-500 shadow-rose-600/25 hover:from-rose-500 hover:to-red-400' : 'bg-brand-600 shadow-brand-600/25 hover:bg-brand-700'}`}
            >
              {loading ? 'Memproses…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
