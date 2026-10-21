// Modal tambah/ubah issue Client Follow-Up (PRD §5/§9).
// Alasan (R-31): satu modal untuk dua mode agar aturan wajib + urutan
// tanggal divalidasi satu tempat (validateFollowup di hook); client pakai
// datalist daftar brand terdaftar (relasi data existing), modul bebas
// dengan saran nilai yang pernah dipakai (keputusan Q1 opsi A).
// Escape menutup (R-32); semua input min-h 44px (R-03 mobilen nanti).
import { useEffect, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { PRIORITIES, STATUSES, validateFollowup } from '../../hooks/useFollowups.js';

const INPUT_CLS =
  'w-full min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition';

const LABEL_CLS = 'text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400';

const EMPTY = {
  client: '', issueDate: '', module: '', priority: 'Sedang',
  title: '', description: '', status: 'Open', followupDate: '', pic: '',
};

export default function FollowupFormModal({ item, clients = [], picOptions = [], moduleHints = [], onClose, onSave }) {
  const editing = Boolean(item?.id);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill saat modal dibuka; item dikirim sekali saat modal mount di halaman.
  useEffect(() => {
    setErr('');
    if (editing) {
      setForm({ ...EMPTY, ...item });
    } else {
      const today = new Date();
      const p = (n) => String(n).padStart(2, '0');
      setForm({ ...EMPTY, ...item, status: item?.status || EMPTY.status, issueDate: `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}` });
    }
  }, [item, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  function submit(e) {
    e?.preventDefault();
    const msg = validateFollowup(form);
    if (msg) {
      setErr(msg);
      return;
    }
    setSaving(true);
    Promise.resolve(onSave(form, editing))
      .then(() => setSaving(false))
      .catch(() => setSaving(false));
  }

  const f = form;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Ubah issue' : 'Tambah issue client'}
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl animate-fade-in-fast"
      >
        <div className="bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white">Client Follow-Up</p>
              <h3 className="font-bold">{editing ? 'Ubah Issue' : 'Tambah Issue Client'}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Tutup form"
              className="shrink-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15 focus-visible:ring-white/70"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Kolom bertanda <span className="text-rose-500">*</span> wajib diisi.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="fu-client" className={LABEL_CLS}>Client <span className="text-rose-500">*</span></label>
              <input
                id="fu-client" list="fu-client-list" value={f.client} onChange={set('client')}
                placeholder="cth. Inspired" className={`${INPUT_CLS} mt-1.5`}
              />
              <datalist id="fu-client-list">
                {clients.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="fu-issue" className={LABEL_CLS}>Tanggal issue <span className="text-rose-500">*</span></label>
              <input id="fu-issue" type="date" value={f.issueDate} onChange={set('issueDate')} className={`${INPUT_CLS} mt-1.5`} />
            </div>
            <div>
              <label htmlFor="fu-module" className={LABEL_CLS}>Modul <span className="text-rose-500">*</span></label>
              <input id="fu-module" list="fu-module-list" value={f.module} onChange={set('module')}
                placeholder="cth. Produksi" className={`${INPUT_CLS} mt-1.5`} />
              <datalist id="fu-module-list">
                {moduleHints.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="fu-prio" className={LABEL_CLS}>Prioritas <span className="text-rose-500">*</span></label>
              <select id="fu-prio" value={f.priority} onChange={set('priority')} className={`${INPUT_CLS} mt-1.5`}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="fu-title" className={LABEL_CLS}>Issue <span className="text-rose-500">*</span></label>
            <input id="fu-title" value={f.title} onChange={set('title')}
              placeholder="Ringkasan, cth. Show All Produksi tidak bisa dibuka" className={`${INPUT_CLS} mt-1.5`} />
          </div>
          <div>
            <label htmlFor="fu-desc" className={LABEL_CLS}>Detail / langkah reproduksi</label>
            <textarea id="fu-desc" rows={3} value={f.description} onChange={set('description')}
              placeholder="Opsional" className={`${INPUT_CLS} mt-1.5`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="fu-status" className={LABEL_CLS}>Status <span className="text-rose-500">*</span></label>
              <select id="fu-status" value={f.status} onChange={set('status')} className={`${INPUT_CLS} mt-1.5`}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fu-follow" className={LABEL_CLS}>Tanggal follow-up <span className="text-rose-500">*</span></label>
              <input id="fu-follow" type="date" value={f.followupDate} onChange={set('followupDate')} className={`${INPUT_CLS} mt-1.5`} />
            </div>
          </div>
          <div>
            <label htmlFor="fu-pic" className={LABEL_CLS}>PIC</label>
            <input id="fu-pic" list="fu-pic-list" value={f.pic} onChange={set('pic')} placeholder="Nama penanggung jawab" className={`${INPUT_CLS} mt-1.5`} />
            <datalist id="fu-pic-list">
              {picOptions.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>

          {err && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400" role="alert">{err}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="primary" type="submit" disabled={saving} className="flex-1 active:scale-[.98]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Simpan
            </Button>
            <Button variant="secondary" type="button" onClick={onClose} className="flex-1">Batal</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
