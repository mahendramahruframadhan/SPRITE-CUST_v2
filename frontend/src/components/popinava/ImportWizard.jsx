// Wizard impor POPI NAVA, 3 langkah (§10.3): Unggah → Preview → Hasil.
// Preview dihitung client-side dengan aturan §8 (fase frontend); commit
// all-or-nothing (§9): bila ada baris error, tombol impor dinonaktifkan dan
// file harus diperbaiki dulu.
// Aksesibilitas (§10.4): dialog aria-modal, Escape menutup, pesan parse
// memakai role="alert", tab memakai aria-selected.
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { downloadTemplate } from '../../lib/popinavaExport.js';

const TABS = [
  { id: 'valid', label: 'Valid' },
  { id: 'warning', label: 'Peringatan' },
  { id: 'error', label: 'Error' },
];

function statusBadge(rowInfo) {
  if (rowInfo.errors.length > 0) {
    return (
      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
        ERROR
      </span>
    );
  }
  if (rowInfo.warnings.length > 0) {
    return (
      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
        PERINGATAN
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
      VALID
    </span>
  );
}

export default function ImportWizard({ open, onClose, onPreview, onCommit, localMode }) {
  const [step, setStep] = useState('upload');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [mode, setMode] = useState('upsert');
  const [tab, setTab] = useState('valid');
  const [showNorm, setShowNorm] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep('upload');
    setReport(null);
    setMode('upsert');
    setTab('valid');
    setShowNorm(false);
    setResult(null);
    setParseError('');
    setBusy(false);
    const t = setTimeout(() => closeRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleFile(f) {
    if (!f) return;
    setParseError('');
    setBusy(true);
    try {
      const r = await onPreview(f);
      setReport(r);
      setTab(r.errors.length > 0 ? 'error' : r.withWarnings > 0 ? 'warning' : 'valid');
      setStep('preview');
    } catch (e) {
      setParseError(e?.message || 'File tidak bisa dibaca.');
      setReport(null);
    } finally {
      setBusy(false);
    }
  }

  async function doCommit() {
    if (!report) return;
    setBusy(true);
    try {
      const res = onCommit(report.entries, mode);
      setResult(res);
      setStep('result');
    } finally {
      setBusy(false);
    }
  }

  const details = report?.details || [];
  const validRows = details.filter((d) => d.errors.length === 0);
  const warningRows = validRows.filter((d) => d.warnings.length > 0);
  const errorRows = details.filter((d) => d.errors.length > 0);
  const tabRows = tab === 'error' ? errorRows : tab === 'warning' ? warningRows : validRows;
  const blocked = !!report && report.errors.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Impor data outlet POPI NAVA"
        className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl animate-fade-in-fast flex flex-col"
      >
        <header className="bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] px-5 py-4 text-white shrink-0 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white">Master data POPI NAVA</p>
            <h2 className="font-bold">
              Impor outlet
              <span className="ml-2 text-[11px] font-semibold text-white/80">
                {step === 'upload' ? 'Langkah 1 dari 3: unggah' : step === 'preview' ? 'Langkah 2 dari 3: preview' : 'Langkah 3 dari 3: hasil'}
              </span>
            </h2>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Tutup wizard impor"
            className="shrink-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15 focus-visible:ring-white/70"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {localMode && (
            <p className="mb-3 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 inline-block">
              Mode lokal: hasil impor tersimpan di browser; impor via server menyusul.
            </p>
          )}

          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
                  dragOver
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                <svg className="w-9 h-9 mx-auto text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Seret file ke sini atau pilih file
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Format .xlsx atau .csv, maksimal 5 MB. Header dipetakan case-insensitive, kolom brand_name opsional.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                    Pilih file
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Unduh template CSV
                  </Button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  aria-label="Pilih file impor outlet"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {busy && (
                  <p className="mt-3 text-xs font-semibold text-brand-600 dark:text-brand-300 animate-pulse" role="status">
                    Membaca file…
                  </p>
                )}
              </div>
              {parseError && (
                <p role="alert" className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                  {parseError}
                </p>
              )}
            </div>
          )}

          {step === 'preview' && report && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold">{report.fileName}</span>
                <span className="text-slate-400">·</span>
                <span>{report.totalRows} baris terbaca</span>
                <span className="text-slate-400">·</span>
                <span>{report.normalized.length} normalisasi</span>
              </div>

              {blocked && (
                <p role="alert" className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                  File punya {report.errors.length} baris error. Semua baris harus valid dulu (impor memakai aturan
                  semua-atau-tidak), perbaiki file lalu unggah ulang.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Status baris impor">
                {TABS.map((t) => {
                  const n = t.id === 'valid' ? validRows.length : t.id === 'warning' ? warningRows.length : errorRows.length;
                  const active = tab === t.id;
                  return (
                    /* eslint-disable-next-line react/forbid-elements -- tab status baris: segmented control kustom dengan aria-selected */
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(t.id)}
                      className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                        active
                          ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t.label} ({n})
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th scope="col" className="text-left font-bold px-3 py-2">Baris</th>
                        <th scope="col" className="text-left font-bold px-3 py-2">Brand</th>
                        <th scope="col" className="text-left font-bold px-3 py-2">Custcode</th>
                        <th scope="col" className="text-left font-bold px-3 py-2">Channel</th>
                        <th scope="col" className="text-left font-bold px-3 py-2">Status</th>
                        <th scope="col" className="text-left font-bold px-3 py-2">Pesan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {tabRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                            Tidak ada baris di tab ini.
                          </td>
                        </tr>
                      ) : (
                        tabRows.map((d) => (
                          <tr key={d.row}>
                            <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{d.row}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{d.brand_name || '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{d.rvt_custcode || '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-40 truncate">{d.dept_channel_name || '-'}</td>
                            <td className="px-3 py-2">{statusBadge(d)}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {[...d.errors, ...d.warnings].map((m, i) => (
                                <p key={i} className={d.errors.length ? 'text-rose-600 dark:text-rose-400' : ''}>
                                  {m.message}
                                </p>
                              ))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNorm((v) => !v)}
                  aria-expanded={showNorm}
                  className="text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                >
                  Normalisasi yang dilakukan ({report.normalized.length})
                </Button>
                {showNorm && (
                  <ul className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-40 overflow-y-auto text-[11px]">
                    {report.normalized.length === 0 ? (
                      <li className="px-3 py-2.5 text-slate-500 dark:text-slate-400">Tidak ada koreksi otomatis.</li>
                    ) : (
                      report.normalized.map((n, i) => (
                        <li key={i} className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                          Baris {n.row} · {n.field}: <span className="line-through opacity-70">{n.from}</span> →{' '}
                          <span className="font-bold">{n.to}</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              <fieldset>
                <legend className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Mode simpan
                </legend>
                <div className="mt-1.5 flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-1" role="radiogroup">
                  {[
                    { id: 'upsert', label: 'Upsert (ubah yang ada)' },
                    { id: 'skip-existing', label: 'Lewati yang sudah ada' },
                  ].map((m) => (
                    /* eslint-disable-next-line react/forbid-elements -- segmented control mode simpan dengan status aktif */
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={mode === m.id}
                      onClick={() => setMode(m.id)}
                      className={`flex-1 min-h-[40px] px-3 rounded-lg text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                        mode === m.id
                          ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Baris baru', value: result.created, tone: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Diperbarui', value: result.updated, tone: 'text-brand-600 dark:text-brand-300' },
                  { label: 'Dilewati', value: result.skipped, tone: 'text-slate-600 dark:text-slate-300' },
                  { label: 'Gagal', value: result.failed, tone: 'text-rose-600 dark:text-rose-400' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</dt>
                    <dd className={`text-xl font-bold ${s.tone}`}>{s.value}</dd>
                  </div>
                ))}
              </dl>
              {result.blocked && (
                <p role="alert" className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                  Impor dibatalkan karena ada baris error. Tidak ada data yang berubah.
                </p>
              )}
              {result.errors?.length > 0 && (
                <ul className="rounded-xl border border-rose-200 dark:border-rose-500/30 divide-y divide-rose-100 dark:divide-rose-500/20 max-h-40 overflow-y-auto text-[11px] text-rose-700 dark:text-rose-300">
                  {result.errors.slice(0, 50).map((er, i) => (
                    <li key={i} className="px-3 py-2">
                      Baris {er.row}: {er.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-5 py-3.5 flex flex-wrap gap-2 justify-end bg-white dark:bg-slate-900">
          {step === 'preview' && (
            <>
              <Button variant="secondary" onClick={onClose}>
                Batalkan
              </Button>
              <Button
                variant="primary"
                onClick={doCommit}
                disabled={blocked || validRows.length === 0}
                loading={busy}
                title={blocked ? 'Perbaiki baris error dulu' : undefined}
                className="active:scale-[.98]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Impor {validRows.length} Baris
              </Button>
            </>
          )}
          {step === 'result' && (
            <Button variant="primary" onClick={onClose} className="active:scale-[.98]">
              Tutup
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
