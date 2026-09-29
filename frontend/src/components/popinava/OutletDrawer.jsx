// Drawer tambah/edit outlet POPI NAVA (§10.2). Validasi client meniru §8.1
// lewat prepareRow/validateRow; server tetap otoritatif lewat hook.
// Aksesibilitas (§10.4): ringkasan error bisa difokus (tabindex -1) setelah
// submit gagal, error per field inline + aria-describedby, Escape menutup.
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { DEPT_NAMES, STATUSES, prepareRow, validateRow } from '../../lib/popinavaValidate.js';
import { recordToSource } from '../../lib/popinavaRecord.js';

const INPUT_CLS =
  'w-full min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition';

const FIELDS = [
  { name: 'uuid', label: 'UUID', hint: 'Kosongkan saat tambah, diisi otomatis.' },
  { name: 'brand_name', label: 'Brand', required: true },
  { name: 'rvt_custcode', label: 'Custcode', required: true, placeholder: 'RVT-HGL' },
  { name: 'dept_code', label: 'Dept code', required: true, placeholder: '03010501' },
  { name: 'dept_name', label: 'Dept name', required: true, type: 'select', options: DEPT_NAMES },
  { name: 'dept_channel_name', label: 'Nama channel', required: true },
  { name: 'iso_code', label: 'Iso code', required: true, placeholder: 'ID-JB' },
  { name: 'city', label: 'Kota', required: true },
  { name: 'province', label: 'Provinsi', required: true },
  { name: 'address', label: 'Alamat', type: 'textarea' },
  { name: 'postcode', label: 'Postcode', placeholder: '40114' },
  { name: 'country', label: 'Negara', required: true },
  { name: 'area', label: 'Area', placeholder: 'P.JAWA' },
  { name: 'region', label: 'Region', placeholder: 'WIB' },
  { name: 'dept_reference', label: 'Dept reference' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'notes', label: 'Catatan', type: 'textarea' },
  { name: 'created_at', label: 'Tanggal dibuat (sumber)', placeholder: '2026-01-01 00:00:00' },
];

function emptyValues() {
  const v = {};
  for (const f of FIELDS) v[f.name] = '';
  v.country = 'INDONESIA';
  v.status = 'active';
  return v;
}

export default function OutletDrawer({ open, mode, initial, onClose, onSave, busy }) {
  const [values, setValues] = useState(emptyValues);
  const [fieldErrors, setFieldErrors] = useState({});
  const [summary, setSummary] = useState([]);
  const summaryRef = useRef(null);
  const firstRef = useRef(null);

  // Isi form saat drawer dibuka (edit: record; create: default).
  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setSummary([]);
    if (mode === 'edit' && initial) {
      setValues({ ...emptyValues(), ...recordToSource(initial), status: initial.status || 'active' });
    } else {
      setValues(emptyValues());
    }
    const t = setTimeout(() => firstRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, mode, initial]);

  // Escape menutup drawer (§10.4).
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (name) => (e) => setValues((prev) => ({ ...prev, [name]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    // Field UUID: "Kosongkan saat tambah, diisi otomatis" (hint di bawah input).
    const base = mode === 'edit' || values.uuid ? values : { ...values, uuid: crypto.randomUUID() };
    const { row } = prepareRow(base);
    const { errors } = validateRow(row);
    const map = {};
    for (const er of errors) if (!map[er.field]) map[er.field] = er.message;
    setFieldErrors(map);
    const messages = errors.map((er) => er.message);
    setSummary(messages);
    if (messages.length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    onSave({ ...row, status: values.status || 'active' });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'edit' ? 'Ubah outlet' : 'Tambah outlet'}
        className="relative w-full max-w-lg h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col animate-fade-in-fast"
      >
        <header className="bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] px-5 py-4 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white">
                {mode === 'edit' ? 'Ubah data outlet' : 'Outlet baru'}
              </p>
              <h2 className="font-bold truncate">
                {mode === 'edit' ? initial?.deptChannelName || initial?.uuid : 'POPI NAVA'}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Tutup formulir"
              className="shrink-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15 focus-visible:ring-white/70"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </header>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4" noValidate>
          {summary.length > 0 && (
            <div
              ref={summaryRef}
              tabIndex={-1}
              role="alert"
              aria-labelledby="pn-error-title"
              className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
            >
              <p id="pn-error-title" className="text-xs font-bold text-rose-700 dark:text-rose-400">
                Ada {summary.length} hal yang perlu diperbaiki:
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-rose-600 dark:text-rose-300 list-disc list-inside">
                {summary.slice(0, 8).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map((f) => {
              const err = fieldErrors[f.name];
              const id = `pn-${f.name}`;
              const errId = `${id}-err`;
              const disabled = f.name === 'uuid' && mode === 'edit';
              const common = {
                id,
                value: values[f.name] ?? '',
                onChange: set(f.name),
                disabled,
                // Fokus awal: field pertama yang bisa diketik saat drawer terbuka.
                ref: f.name === (mode === 'edit' ? 'brand_name' : 'uuid') ? firstRef : undefined,
                'aria-invalid': err ? 'true' : undefined,
                'aria-describedby': err ? errId : f.hint ? `${id}-hint` : undefined,
                className: `${INPUT_CLS} mt-1.5${err ? ' border-rose-400 dark:border-rose-500/60' : ''}${disabled ? ' bg-slate-50 dark:bg-slate-800/60 text-slate-500' : ''}`,
              };
              const labelEl = (
                <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {f.label} {f.required && <span className="text-rose-500" aria-hidden="true">*</span>}
                </label>
              );
              return (
                <div key={f.name} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  {labelEl}
                  {f.type === 'select' ? (
                    <select {...common}>
                      {(f.options || []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea {...common} rows={2} />
                  ) : (
                    <input {...common} placeholder={f.placeholder || ''} />
                  )}
                  {f.hint && !err && (
                    <p id={`${id}-hint`} className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {f.hint}
                    </p>
                  )}
                  {err && (
                    <p id={errId} role="alert" className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                      {err}
                    </p>
                  )}
                </div>
              );
            })}

            <div>
              <label htmlFor="pn-status" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Status <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <select
                id="pn-status"
                value={values.status}
                onChange={set('status')}
                className={`${INPUT_CLS} mt-1.5`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'active' ? 'active (aktif)' : 'inactive (nonaktif)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-1 pb-4 sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 -mx-5 px-5 mt-2">
            <Button type="submit" variant="primary" loading={busy} className="flex-1 active:scale-[.98]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {mode === 'edit' ? 'Simpan perubahan' : 'Tambah outlet'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Batal
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
