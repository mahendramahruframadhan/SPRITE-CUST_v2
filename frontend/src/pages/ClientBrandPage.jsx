// Halaman Client & Brand, versi elegan untuk tim finance (frontend-only).
// Design Read: halaman admin operasional untuk tim Revota, bahasa Linear-clean,
// dial ENERGY 2 / RHYTHM 2 / MOTION 1 (lihat DESIGN.md).
// Alasan (R-31): hero gradien indigo ke ungu adalah identitas brand Revota (R-01);
// kartu metrik identik + hover-lift karena perbandingan setara (R-14, motif DESIGN.md);
// badge kapsul hanya status fungsional Monthly/Free/Expired (R-09);
// satu animasi mount tanpa cascade delay (R-19, MOTION 1).
// Context7 react: form terkontrol + useMemo (react/docs); Tailwind mobile-first
// grid + dark: variant (tailwindcss/docs); pola cegah duplikat per daftar.
// TODO(backend): sambungkan useClientBrands ke API saat backend siap.
import { useMemo, useState } from 'react';
import { daysLeft, expiryState, useClientBrands } from '../hooks/useClientBrands.js';
import { useToast } from '../context/ToastContext.jsx';

const INPUT_CLS =
  'w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition';

const TABS = [
  { id: 'MONTHLY', label: 'Monthly' },
  { id: 'GRATIS', label: 'Free Maintenance' },
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

function initials(name) {
  return String(name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function ClientBrandPage() {
  const { notify } = useToast();
  const { statuses, stats, addStatus, removeStatus, seedExamples, ready } = useClientBrands();
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
      notify(`${name} sudah ada di daftar ${type === 'GRATIS' ? 'Free' : 'Monthly'}`, 'error');
      return;
    }
    addStatus({ brand: name, type, expiredAt: type === 'GRATIS' ? expiredAt : '' });
    setBrand('');
    if (type === 'GRATIS') setExpiredAt('');
    notify(`${name} masuk daftar ${type === 'GRATIS' ? 'Free Maintenance' : 'Monthly'}.`, 'success');
  }

  function MonthlyRow({ item }) {
    return (
      <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
        <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-[11px] font-bold">
          {initials(item.brand)}
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.brand}</p>
        <button
          onClick={() => {
            removeStatus(item.id);
            notify(`${item.brand} dihapus dari Monthly.`, 'info');
          }}
          aria-label={`Hapus ${item.brand} dari Monthly`}
          className="shrink-0 inline-flex items-center min-h-[44px] text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-2.5 py-1.5 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
        >
          Hapus
        </button>
      </li>
    );
  }

  function FreeRow({ item }) {
    const st = expiryState(item.expiredAt);
    return (
      <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
        <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-[11px] font-bold">
          {initials(item.brand)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.brand}</p>
          <p className="text-[11px] text-slate-400">
            {fmtDateID(item.expiredAt)}
            {st === 'expired' && <span className="text-rose-500 font-bold"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
            {st === 'soon' && <span className="text-amber-600 dark:text-amber-400 font-bold"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
            {st === 'active' && <span> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
          </p>
        </div>
        {st === 'expired' ? (
          <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
            EXPIRED
          </span>
        ) : (
          st === 'soon' && (
            <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
              SEGERA
            </span>
          )
        )}
        <button
          onClick={() => {
            removeStatus(item.id);
            notify(`${item.brand} dihapus dari Free Maintenance.`, 'info');
          }}
          aria-label={`Hapus ${item.brand} dari Free Maintenance`}
          className="shrink-0 inline-flex items-center min-h-[44px] text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-2.5 py-1.5 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
        >
          Hapus
        </button>
      </li>
    );
  }

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-4">
      {!ready && (
        <div aria-busy="true" aria-label="Memuat data brand" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 animate-pulse">Memuat data brand...</p>
        </div>
      )}
      {/* Hero identitas brand: gradien indigo ke ungu (R-01, alasan = brand Revota) */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] p-5 sm:p-6 text-white animate-fade-in-fast">
        <div className="relative flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white">Kontrak brand</p>
            <h3 className="mt-1 text-lg sm:text-xl font-bold leading-tight">Monthly vs Free Maintenance</h3>
            <p className="mt-1 text-xs text-white/90">Satu tempat untuk info finance: siapa monthly, siapa gratis sampai kapan.</p>
          </div>
          <dl className="flex gap-2 sm:gap-3">
            <div className="rounded-xl bg-white/15 px-4 py-2.5 text-center">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-white">Monthly</dt>
              <dd className="text-xl font-bold">{stats.monthly}</dd>
            </div>
            <div className="rounded-xl bg-white/15 px-4 py-2.5 text-center">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-white">Free aktif</dt>
              <dd className="text-xl font-bold">{stats.gratis}</dd>
            </div>
            <div className="hidden sm:block rounded-xl bg-white/15 px-4 py-2.5 text-center">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-white">Perhatian</dt>
              <dd className="text-xl font-bold">{soonCount + expiredCount}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Tambah cepat */}
      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col md:flex-row gap-3 md:items-end shadow-sm"
      >
        <div className="flex-1">
          <label htmlFor="cb-brand" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Nama brand <span className="text-rose-500">*</span>
          </label>
          <input
            id="cb-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="cth. Flora Dera"
            className={`${INPUT_CLS} mt-1.5`}
          />
        </div>
        <div>
          <span id="cb-type-label" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Masuk ke</span>
          <div className="flex gap-2 mt-1.5" role="group" aria-labelledby="cb-type-label">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                aria-pressed={type === t.id}
                className={`text-xs font-semibold px-4 py-2.5 min-h-[44px] rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                  type === t.id
                    ? 'bg-brand-600 text-white border-brand-600 shadow-md shadow-brand-600/25'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-500/40'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {type === 'GRATIS' && (
          <div className="md:w-52">
            <label htmlFor="cb-exp" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Expired <span className="text-rose-500">*</span>
            </label>
            <input id="cb-exp" type="date" value={expiredAt} onChange={(e) => setExpiredAt(e.target.value)} className={`${INPUT_CLS} mt-1.5`} />
          </div>
        )}
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-6 py-2.5 min-h-[44px] rounded-xl shadow-md shadow-brand-600/25 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
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
          className="sm:ml-auto min-h-[44px] inline-flex items-center text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 px-3 py-2 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          Isi contoh finance
        </button>
      </div>

      {/* Dua daftar: monthly dan free, urut expired terdekat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section aria-label="Support Monthly" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
          <header className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Support Monthly</h3>
              <p className="text-[11px] text-slate-400">Brand berlangganan bulanan</p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20">
              {monthly.length}
            </span>
          </header>
          {monthly.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400">Belum ada. Ketik nama lalu Tambah ke Monthly.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[440px] overflow-y-auto">
              {monthly.map((it) => <MonthlyRow key={it.id} item={it} />)}
            </ul>
          )}
        </section>

        <section aria-label="Kontrak Free Maintenance" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
          <header className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kontrak Free Maintenance</h3>
              <p className="text-[11px] text-slate-400">
                {expiredCount > 0 ? `${expiredCount} expired` : 'Urut dari expired terdekat'}
                {soonCount > 0 && ` · ${soonCount} segera habis`}
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
              {gratis.length}
            </span>
          </header>
          {gratis.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400">Belum ada. Pilih Free Maintenance dan isi tanggal expired.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[440px] overflow-y-auto">
              {gratis.map((it) => <FreeRow key={it.id} item={it} />)}
            </ul>
          )}
        </section>
      </div>

      <p className="text-[11px] text-slate-400">Tersimpan otomatis di browser ini. Backend disambungkan nanti tanpa mengubah tampilan.</p>
    </div>
  );
}
