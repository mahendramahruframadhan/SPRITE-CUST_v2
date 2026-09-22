import { useCallback, useEffect, useRef, useState } from 'react';
import { requestPdfDownloadUrl } from '../lib/api.js';

// Pratinjau PDF invoice dalam browser (tanpa mengunduh dulu).
// URL presigned diambil saat dibuka (berlaku 5 menit); iframe me-render PDF bawaan browser.
// file: { id, filename, sizeBytes } | onDownload(file) | onDelete(file) → true bila terhapus
export default function PdfPreviewModal({ file, onClose, onDownload, onDelete }) {
  const closeRef = useRef(null);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    if (!file) return;
    setLoading(true);
    setError('');
    setUrl('');
    requestPdfDownloadUrl(file.id).then(
      (r) => {
        setUrl(r.url);
        setLoading(false);
      },
      (e) => {
        setError(e?.data?.message || e?.message || 'Pratinjau gagal dimuat.');
        setLoading(false);
      }
    );
  }, [file]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!file) return;
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
  }, [file, onClose]);

  if (!file) return null;

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const gone = await onDelete(file);
      if (gone) onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-fade-in-fast">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="shrink-0 rounded-xl bg-white/15 p-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100">Pratinjau PDF</p>
              <h3 id="pdf-preview-title" className="mt-0.5 font-extrabold truncate" title={file.filename}>
                {file.filename}
              </h3>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDownload(file)}
                title="Unduh file"
                className="rounded-lg p-2 text-emerald-50 hover:bg-white/15 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                title="Hapus file"
                className="rounded-lg p-2 text-emerald-50 hover:bg-white/15 hover:text-white transition disabled:opacity-50 disabled:cursor-wait"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Tutup pratinjau"
                className="rounded-lg p-2 text-emerald-50 hover:bg-white/15 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        {/* Isi */}
        <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-800">
          {loading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
              <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <p className="text-xs font-semibold">Memuat pratinjau…</p>
            </div>
          )}
          {!loading && error && (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
              <button
                type="button"
                onClick={load}
                className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-4 py-2 transition"
              >
                Coba lagi
              </button>
            </div>
          )}
          {!loading && !error && url && (
            <iframe src={url} title={`Pratinjau ${file.filename}`} className="w-full h-full border-0" />
          )}
        </div>
      </div>
    </div>
  );
}
