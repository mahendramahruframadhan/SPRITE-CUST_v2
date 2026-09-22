import { useEffect, useRef } from 'react';

// Modal konfirmasi hapus yang elegan (pengganti confirm() bawaan browser).
// file: { filename, sizeLabel } | busy: hapus sedang berjalan
// | onCancel() | onConfirm()
export default function DeleteConfirmModal({ file, busy = false, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  // Stabil: simpan callback di ref agar efek cukup dipasang sekali
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!file) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [file]);

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-desc">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { if (!busy) onCancel(); }} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-fast">
        <div className="bg-gradient-to-r from-rose-600 to-red-500 px-5 pt-5 pb-4 text-white">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="shrink-0 rounded-xl bg-white/15 p-2.5">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </span>
            <h3 id="delete-confirm-title" className="text-lg font-extrabold">Hapus PDF?</h3>
          </div>
        </div>
        <div className="px-5 py-4">
          <p id="delete-confirm-desc" className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            File berikut akan dihapus permanen dari penyimpanan dan tidak bisa dikembalikan:
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2.5">
            <svg className="w-5 h-5 shrink-0 text-rose-500 dark:text-rose-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-slate-700 dark:text-slate-200" title={file.filename}>{file.filename}</p>
              {file.sizeLabel && <p className="text-[11px] font-semibold text-slate-400 tabular-nums">{file.sizeLabel}</p>}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-rose-600 to-red-500 px-4 py-2 text-[12px] font-extrabold text-white shadow-sm shadow-rose-600/25 hover:from-rose-500 hover:to-red-400 hover:shadow-md transition disabled:opacity-60 disabled:cursor-wait"
            >
              {busy ? 'Menghapus…' : 'Ya, Hapus'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
