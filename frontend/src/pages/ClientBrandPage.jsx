// Halaman Client & Brand, versi simpel untuk tim finance (frontend-only).
// Design Read: halaman admin operasional untuk tim Revota, bahasa Linear-clean,
// dial ENERGY 2 / RHYTHM 2 / MOTION 1 (lihat DESIGN.md).
// Alasan (R-31): satu baris tambah cepat + dua daftar persis format finance
// (Monthly = nama saja, Free = nama + expired) agar input semudah chat;
// badge kapsul hanya status fungsional (R-09); satu animasi mount (R-19).
// Context7 react: form terkontrol + useMemo untuk filter/sort.
// TODO(backend): sambungkan useClientBrands ke API saat backend siap.
import { useMemo, useState } from 'react';
import { daysLeft, expiryState, useClientBrands } from '../hooks/useClientBrands.js';
import { useToast } from '../context/ToastContext.jsx';

const INPUT_CLS =
  'w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition';

const TABS = [
  { id: 'MONTHLY', label: 'Monthly' },
  { id: 'GRATIS', label: 'Free Maintenance' },
  { id: 'BARU', label: 'Client Baru' },
];

function fmtDateID(s) {
  if (!s) return '-';
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtLeft(d) {
  if (d === null) return '';
  if (d < 0) return `expired ${Math.abs(d)} hari lalu`;
  if (d === 0) return 'habis hari ini';
  return `sisa ${d} hari`;
}

export default function ClientBrandPage() {
  const { notify } = useToast();
  const { statuses, stats, addStatus, removeStatus, seedExamples } = useClientBrands();
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('GRATIS');
  const [expiredAt, setExpiredAt] = useState('');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const match = (s) => !q || String(s.brand).toLowerCase().includes(q);

  const monthly = useMemo(() => statuses.filter((s) => s.type === 'MONTHLY' && match(s)), [statuses, q]);
  const gratis = useMemo(
    () =>
      statuses
        .filter((s) => s.type === 'GRATIS' && match(s))
        .slice()
        .sort((a, b) => String(a.expiredAt || '9999').localeCompare(String(b.expiredAt || '9999'))),
    [statuses, q]
  );
  const baru = useMemo(() => statuses.filter((s) => s.type === 'BARU' && match(s)), [statuses, q]);

  const soonCount = statuses.filter((s) => s.type === 'GRATIS' && expiryState(s.expiredAt) === 'soon').length;
  const expiredCount = statuses.filter((s) => s.type === 'GRATIS' && expiryState(s.expiredAt) === 'expired').length;

  function submit(e) {
    e?.preventDefault();
    const name = brand.trim();
    if (!name) {
      notify('Isi nama brand dulu', 'error');
      return;
    }
    if (type === 'GRATIS' && !expiredAt) {
      notify('Tanggal expired wajib untuk Free Maintenance', 'error');
      return;
    }
    const dupe = statuses.some((s) => s.type === type && String(s.brand).trim().toLowerCase() === name.toLowerCase());
    if (dupe) {
      notify(`${name} sudah ada di daftar ${type === 'GRATIS' ? 'Free' : type === 'MONTHLY' ? 'Monthly' : 'Baru'}`, 'error');
      return;
    }
    addStatus({ brand: name, type, expiredAt: type === 'GRATIS' ? expiredAt : '' });
    setBrand('');
    if (type === 'GRATIS') setExpiredAt('');
    notify(`${name} masuk daftar ${type === 'GRATIS' ? 'Free Maintenance' : type === 'MONTHLY' ? 'Monthly' : 'Client Baru'}.`, 'success');
  }

  function Row({ item, showDate }) {
    const st = expiryState(item.expiredAt);
    return (
      <li className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.brand}</p>
          {showDate && (
            <p className="text-[11px] text-slate-400">
              {fmtDateID(item.expiredAt)}
              {st === 'expired' && <span className="text-rose-500 font-bold"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
              {st === 'soon' && <span className="text-amber-600 font-bold"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
              {st === 'active' && <span> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
            </p>
          )}
        </div>
        {showDate && st === 'expired' && (
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
            EXPIRED
          </span>
        )}
        <button
          onClick={() => {
            removeStatus(item.id);
            notify(`${item.brand} dihapus.`, 'info');
          }}
          aria-label={`Hapus ${item.brand}`}
          className="shrink-0 text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-2.5 py-1.5 rounded-lg transition"
        >
          Hapus
        </button>
      </li>
    );
  }

  function List({ title, count, items, showDate, empty }) {
    return (
      <section aria-label={title} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
            {count}
          </span>
        </header>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-400">{empty}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto">{items.map((it) => <Row key={it.id} item={it} showDate={showDate} />)}</ul>
        )}
      </section>
    );
  }

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-4">
      {/* Ringkas: 3 angka yang finance butuhkan */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Monthly', value: stats.monthly },
          { label: 'Free aktif', value: `${stats.gratis}`, hint: `${soonCount} segera · ${expiredCount} expired` },
          { label: 'Client baru', value: stats.baru },
        ].map((m) => (
          <div key={m.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 animate-fade-in-fast">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{m.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{m.value}</p>
            {m.hint && <p className="text-[11px] text-slate-400">{m.hint}</p>}
          </div>
        ))}
      </div>

      {/* Tambah cepat: 1 baris, persis cara finance mengirim info */}
      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col md:flex-row gap-3 md:items-end"
      >
        <div className="flex-1">
          <label htmlFor="cb-brand" className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Nama brand <span className="text-rose-500">*</span>
          </label>
          <input
            id="cb-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="cth. Flora Dera"
            className={`${INPUT_CLS} mt-1`}
          />
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Masuk ke</span>
          <div className="flex gap-2 mt-1" role="group" aria-label="Pilih daftar">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                aria-pressed={type === t.id}
                className={`text-xs font-semibold px-3 py-2.5 rounded-lg border transition ${
                  type === t.id
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {type === 'GRATIS' && (
          <div className="md:w-48">
            <label htmlFor="cb-exp" className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Expired <span className="text-rose-500">*</span>
            </label>
            <input id="cb-exp" type="date" value={expiredAt} onChange={(e) => setExpiredAt(e.target.value)} className={`${INPUT_CLS} mt-1`} />
          </div>
        )}
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-md shadow-brand-600/25 transition"
        >
          Tambah
        </button>
      </form>

      {/* Cari + contoh */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari brand..."
          aria-label="Cari brand"
          className={`${INPUT_CLS} sm:max-w-xs`}
        />
        <button
          onClick={() => {
            seedExamples();
            notify('Contoh data finance dimasukkan (tanpa duplikat).', 'success');
          }}
          className="sm:ml-auto text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 px-3 py-2 rounded-lg transition"
        >
          Isi contoh finance
        </button>
      </div>

      {/* Dua daftar utama + baru, urut expired terdekat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <List title="Support Monthly" count={monthly.length} items={monthly} empty="Belum ada. Ketik nama lalu Tambah ke Monthly." />
        <List
          title="Kontrak Free Maintenance"
          count={gratis.length}
          items={gratis}
          showDate
          empty="Belum ada. Pilih Free Maintenance + isi tanggal expired."
        />
        <List title="Client Baru" count={baru.length} items={baru} empty="Belum ada brand baru." />
      </div>

      <p className="text-[11px] text-slate-400">Tersimpan otomatis di browser ini. Backend disambungkan nanti tanpa mengubah tampilan.</p>
    </div>
  );
}
