// Halaman Client & Brand (frontend-only, tanpa backend).
// Design Read: halaman admin operasional untuk tim Revota, bahasa visual Linear-clean,
// dial ENERGY 2 / RHYTHM 2 / MOTION 1 (lihat DESIGN.md).
// Alasan keputusan (R-31): satu halaman dua section karena pemilik meminta koleksi
// client baru dan status monthly/gratis dalam halaman yang sama; kartu metrik identik
// karena hierarki setara (R-14); badge kapsul hanya status fungsional (R-09);
// satu animasi mount tanpa cascade delay (R-19, MOTION 1).
// Context7 react: form terkontrol + useMemo untuk filter/turunan.
// TODO(backend): sambungkan useClientBrands ke API saat backend siap.
import { useMemo, useState } from 'react';
import { STATUS_TYPES, daysLeft, expiryState, useClientBrands } from '../hooks/useClientBrands.js';
import { useToast } from '../context/ToastContext.jsx';

const INPUT_CLS =
  'mt-1 w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition';

const TYPE_META = {
  MONTHLY: {
    label: 'Monthly',
    cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20',
  },
  BARU: {
    label: 'Client Baru',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  },
  GRATIS: {
    label: 'Maintenance Gratis',
    cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  },
};

const EXP_META = {
  expired: { label: 'Expired', cls: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' },
  soon: { label: 'Segera habis', cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
  active: { label: 'Aktif', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' },
  unknown: { label: 'Tanpa tanggal', cls: 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
};

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function fmtDateID(s) {
  if (!s) return '-';
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtLeft(d) {
  if (d === null) return '-';
  if (d < 0) return `${Math.abs(d)} hari lalu`;
  if (d === 0) return 'Hari ini';
  return `${d} hari lagi`;
}

const EMPTY_CLIENT = { brand: '', company: '', pic: '', contact: '', joinedAt: '', source: '', note: '' };
const EMPTY_STATUS = { brand: '', type: 'MONTHLY', startAt: '', expiredAt: '', monthlyFee: '', pic: '', note: '' };

export default function ClientBrandPage() {
  const { notify } = useToast();
  const { clients, statuses, stats, addClient, removeClient, addStatus, removeStatus } = useClientBrands();
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT);
  const [statusForm, setStatusForm] = useState(EMPTY_STATUS);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('SEMUA');
  const [savingClient, setSavingClient] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const brandOptions = useMemo(() => {
    const names = new Set();
    clients.forEach((c) => c.brand && names.add(c.brand));
    statuses.forEach((s) => s.brand && names.add(s.brand));
    return [...names].sort((a, b) => a.localeCompare(b, 'id'));
  }, [clients, statuses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return statuses.filter((s) => {
      if (typeFilter !== 'SEMUA' && s.type !== typeFilter) return false;
      if (!q) return true;
      return [s.brand, s.pic, s.note].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [statuses, query, typeFilter]);

  const soonCount = useMemo(() => statuses.filter((s) => expiryState(s.expiredAt) === 'soon').length, [statuses]);
  const expiredCount = useMemo(() => statuses.filter((s) => expiryState(s.expiredAt) === 'expired').length, [statuses]);

  const setC = (k) => (e) => setClientForm((p) => ({ ...p, [k]: e.target.value }));
  const setS = (k) => (e) => setStatusForm((p) => ({ ...p, [k]: e.target.value }));

  function saveClient() {
    if (!clientForm.brand.trim()) {
      notify('Nama brand wajib diisi', 'error');
      return;
    }
    setSavingClient(true);
    try {
      addClient({
        brand: clientForm.brand.trim(),
        company: clientForm.company.trim(),
        pic: clientForm.pic.trim(),
        contact: clientForm.contact.trim(),
        joinedAt: clientForm.joinedAt,
        source: clientForm.source.trim(),
        note: clientForm.note.trim(),
      });
      setClientForm(EMPTY_CLIENT);
      notify(`Brand ${clientForm.brand.trim()} tersimpan lokal (frontend only).`, 'success');
    } finally {
      setSavingClient(false);
    }
  }

  function saveStatus() {
    if (!statusForm.brand.trim()) {
      notify('Pilih atau ketik nama brand untuk status', 'error');
      return;
    }
    if (!STATUS_TYPES.includes(statusForm.type)) {
      notify('Tipe status tidak valid', 'error');
      return;
    }
    setSavingStatus(true);
    try {
      addStatus({
        brand: statusForm.brand.trim(),
        type: statusForm.type,
        startAt: statusForm.startAt,
        expiredAt: statusForm.expiredAt,
        monthlyFee: statusForm.monthlyFee ? Number(statusForm.monthlyFee) : '',
        pic: statusForm.pic.trim(),
        note: statusForm.note.trim(),
      });
      setStatusForm(EMPTY_STATUS);
      notify(`Status ${statusForm.brand.trim()} tersimpan lokal (frontend only).`, 'success');
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5">
      {/* Metrik: kartu identik karena perbandingan setara (R-14) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Brand', value: stats.totalBrand, hint: `${stats.totalClient} client terkoleksi` },
          { label: 'Monthly', value: stats.monthly, hint: 'Brand berlangganan bulanan' },
          { label: 'Maintenance Gratis', value: stats.gratis, hint: `${expiredCount} expired, ${soonCount} segera habis` },
          { label: 'Client Baru', value: stats.baru, hint: 'Status BARU tercatat' },
        ].map((m) => (
          <div
            key={m.label}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 animate-fade-in-fast"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{m.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{m.value}</p>
            <p className="mt-1 text-[11px] text-slate-400">{m.hint}</p>
          </div>
        ))}
      </div>

      {/* Section 1: koleksi client / brand baru */}
      <section aria-labelledby="collect-title" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h3 id="collect-title" className="text-base font-bold text-slate-900 dark:text-white">
              Koleksi data client dan brand baru
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Frontend only, tersimpan di browser ini. Backend disambungkan nanti.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setClientForm(EMPTY_CLIENT)}
              className="text-sm font-semibold text-slate-500 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Reset
            </button>
            <button
              onClick={saveClient}
              disabled={savingClient}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2 rounded-lg shadow-md shadow-brand-600/25 transition disabled:opacity-60"
            >
              Simpan Brand
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Nama brand" required>
            <input value={clientForm.brand} onChange={setC('brand')} placeholder="cth. Kopi Arena" className={INPUT_CLS} />
          </Field>
          <Field label="Perusahaan / Client">
            <input value={clientForm.company} onChange={setC('company')} placeholder="cth. PT Arena Ritel" className={INPUT_CLS} />
          </Field>
          <Field label="Tanggal masuk">
            <input type="date" value={clientForm.joinedAt} onChange={setC('joinedAt')} className={INPUT_CLS} />
          </Field>
          <Field label="PIC">
            <input value={clientForm.pic} onChange={setC('pic')} placeholder="Nama penanggung jawab" className={INPUT_CLS} />
          </Field>
          <Field label="Kontak">
            <input value={clientForm.contact} onChange={setC('contact')} placeholder="Email atau WA" className={INPUT_CLS} />
          </Field>
          <Field label="Sumber">
            <input value={clientForm.source} onChange={setC('source')} placeholder="Referral, iklan, canvassing" className={INPUT_CLS} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Catatan">
            <textarea rows="2" value={clientForm.note} onChange={setC('note')} placeholder="Kebutuhan awal, paket yang diminati" className={INPUT_CLS} />
          </Field>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Terkoleksi ({clients.length})
          </p>
          {clients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Belum ada client baru</p>
              <p className="text-xs text-slate-400 mt-1">Isi form di atas lalu tekan Simpan Brand.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {clients.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.brand}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {[c.company, c.pic, c.joinedAt].filter(Boolean).join(' · ') || 'Tanpa detail tambahan'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      removeClient(c.id);
                      notify(`Brand ${c.brand} dihapus dari koleksi lokal.`, 'info');
                    }}
                    aria-label={`Hapus ${c.brand}`}
                    className="shrink-0 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Section 2: monthly vs baru vs maintenance gratis + expired */}
      <section aria-labelledby="status-title" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h3 id="status-title" className="text-base font-bold text-slate-900 dark:text-white">
              Status brand: monthly, baru, maintenance gratis
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Isi brand mana yang monthly dan mana yang gratis sampai kapan. Kolom expired wajib untuk GRATIS.
            </p>
          </div>
          <button
            onClick={saveStatus}
            disabled={savingStatus}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2 rounded-lg shadow-md shadow-brand-600/25 transition disabled:opacity-60"
          >
            Simpan Status
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Brand" required>
            <input
              list="clientBrandOptions"
              value={statusForm.brand}
              onChange={setS('brand')}
              placeholder="Pilih atau ketik brand"
              className={INPUT_CLS}
            />
            <datalist id="clientBrandOptions">
              {brandOptions.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Tipe" required>
            <select value={statusForm.type} onChange={setS('type')} className={INPUT_CLS}>
              {STATUS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mulai">
            <input type="date" value={statusForm.startAt} onChange={setS('startAt')} className={INPUT_CLS} />
          </Field>
          <Field label={statusForm.type === 'GRATIS' ? 'Expired sampai (wajib)' : 'Expired sampai'}>
            <input
              type="date"
              value={statusForm.expiredAt}
              onChange={setS('expiredAt')}
              required={statusForm.type === 'GRATIS'}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Nominal monthly (Rp)">
            <input
              type="number"
              min="0"
              value={statusForm.monthlyFee}
              onChange={setS('monthlyFee')}
              placeholder="0"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="PIC">
            <input value={statusForm.pic} onChange={setS('pic')} placeholder="PIC maintenance" className={INPUT_CLS} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Catatan">
              <input value={statusForm.note} onChange={setS('note')} placeholder="Paket, SLA, info kontrak" className={INPUT_CLS} />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter tipe">
            {['SEMUA', ...STATUS_TYPES].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                aria-pressed={typeFilter === t}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                  typeFilter === t
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {t === 'SEMUA' ? 'Semua' : TYPE_META[t].label}
              </button>
            ))}
          </div>
          <div className="md:ml-auto md:w-64">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari brand, PIC, catatan"
              aria-label="Cari status brand"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
                {['Brand', 'Tipe', 'Mulai', 'Expired', 'Sisa', 'Status', 'Aksi'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Belum ada data status</p>
                    <p className="text-xs text-slate-400 mt-1">Tambahkan brand monthly atau maintenance gratis lewat form di atas.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const exp = expiryState(s.expiredAt);
                  const left = daysLeft(s.expiredAt);
                  return (
                    <tr key={s.id} className="bg-white dark:bg-slate-900">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{s.brand}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{s.note || s.pic || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex text-[11px] font-bold px-2.5 py-1 rounded-full ${TYPE_META[s.type]?.cls || ''}`}>
                          {TYPE_META[s.type]?.label || s.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtDateID(s.startAt)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtDateID(s.expiredAt)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtLeft(left)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex text-[11px] font-bold px-2.5 py-1 rounded-full ${EXP_META[exp].cls}`}>
                          {EXP_META[exp].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            removeStatus(s.id);
                            notify(`Status ${s.brand} dihapus dari daftar lokal.`, 'info');
                          }}
                          aria-label={`Hapus status ${s.brand}`}
                          className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Data tersimpan otomatis di browser (localStorage). Integrasi backend Menyusul tanpa mengubah tampilan.
        </p>
      </section>
    </div>
  );
}
