// Halaman Client & Brand, versi elegan untuk tim finance (frontend-only).
// Design Read: halaman admin operasional untuk tim Revota, bahasa Linear-clean,
// dial ENERGY 2 / RHYTHM 2 / MOTION 1 (lihat DESIGN.md).
// Alasan (R-31): hero gradien indigo ke ungu adalah identitas brand Revota (R-01);
// kartu metrik identik + hover-lift karena perbandingan setara (R-14, motif DESIGN.md);
// badge kapsul hanya status fungsional Monthly/Free/Expired (R-09);
// menu titik-tiga per baris agar aksi Update/Hapus tidak memenuhi baris (R-31:
// satu titik aksi, baris tetap bersih); tanggal free menjadi tombol menuju
// modal detail agar info expired mudah dibaca finance;
// satu animasi mount tanpa cascade delay (R-19, MOTION 1).
// Context7 react: form terkontrol + useMemo (react/docs); Tailwind mobile-first
// grid + dark: variant (tailwindcss/docs); pola cegah duplikat per daftar.
// TODO(backend): sambungkan useClientBrands ke API saat backend siap.
import { useEffect, useMemo, useState } from 'react';
import { useClientBrands } from '../hooks/useClientBrands.js';
import { daysLeft, expiryState } from '../utils/contract.js';
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
  const { statuses, stats, addStatus, updateStatus, removeStatus, seedExamples, ready, serverOk, retryConnection, clients, addClient, removeClient } = useClientBrands();
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('GRATIS');
  const [expiredAt, setExpiredAt] = useState('');
  const [query, setQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editBrand, setEditBrand] = useState('');
  const [editExpired, setEditExpired] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [clientBrand, setClientBrand] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientContact, setClientContact] = useState('');

  // Tutup menu dengan klik di luar atau Escape; Escape juga menutup modal detail.
  useEffect(() => {
    function onDown(e) {
      if (!e.target.closest('[data-kebab-root]')) setOpenMenuId(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
        setDetailItem(null);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

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
  // Penanda jujur: bila backend tak terjangkau, data hanya tersimpan di browser.
  const offTag = serverOk === false ? ' (offline, tersimpan di browser)' : '';
  // Pesan error server (400/409) ditampilkan apa adanya — bukan sukses palsu.
  const errMsg = (e) => e?.data?.message || e?.message || 'Gagal, coba lagi.';

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
    (async () => {
      try {
        await addStatus({ brand: name, type, expiredAt: type === 'GRATIS' ? expiredAt : '' });
        setBrand('');
        if (type === 'GRATIS') setExpiredAt('');
        notify(`${name} masuk daftar ${type === 'GRATIS' ? 'Free Maintenance' : 'Monthly'}.${offTag}`, 'success');
      } catch (err) {
        notify(errMsg(err), 'error');
      }
    })();
  }

  function doDelete(item, listLabel) {
    (async () => {
      try {
        await removeStatus(item.id);
        setOpenMenuId(null);
        notify(`${item.brand} dihapus dari ${listLabel}.${offTag}`, 'info');
      } catch (err) {
        notify(errMsg(err), 'error');
      }
    })();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditBrand(item.brand);
    setEditExpired(item.expiredAt || '');
    setOpenMenuId(null);
  }

  function saveEdit(item) {
    const name = editBrand.trim();
    if (!name) {
      notify('Nama brand tidak boleh kosong', 'error');
      return;
    }
    if (item.type === 'GRATIS' && !editExpired) {
      notify('Tanggal expired wajib untuk Free Maintenance', 'error');
      return;
    }
    const dupe = statuses.some(
      (s) => s.id !== item.id && s.type === item.type && String(s.brand).trim().toLowerCase() === name.toLowerCase()
    );
    if (dupe) {
      notify(`${name} sudah ada di daftar`, 'error');
      return;
    }
    updateStatus(item.id, { brand: name, ...(item.type === 'GRATIS' ? { expiredAt: editExpired } : {}) })
      .then(() => {
        setEditingId(null);
        notify(`${name} diperbarui.${offTag}`, 'success');
      })
      .catch((err) => notify(errMsg(err), 'error'));
  }

  // Koleksi client baru: ringkas (nama + perusahaan + kontak), tersimpan di
  // server bila terjangkau dan cadangan lokal bila offline.
  function submitClient(e) {
    e?.preventDefault();
    const name = clientBrand.trim();
    if (!name) {
      notify('Isi nama brand dulu', 'error');
      return;
    }
    (async () => {
      try {
        await addClient({ brand: name, company: clientCompany.trim(), contact: clientContact.trim() });
        setClientBrand('');
        setClientCompany('');
        setClientContact('');
        notify(`${name} masuk koleksi client baru.${offTag}`, 'success');
      } catch (err) {
        notify(errMsg(err), 'error');
      }
    })();
  }

  function delClient(item) {
    (async () => {
      try {
        await removeClient(item.id);
        notify(`${item.brand} dihapus dari koleksi.${offTag}`, 'info');
      } catch (err) {
        notify(errMsg(err), 'error');
      }
    })();
  }

  // Menu titik-tiga: satu titik aksi per baris berisi Update dan Hapus.
  function Kebab({ item, listLabel }) {
    const open = openMenuId === item.id;
    return (
      <div data-kebab-root className="relative shrink-0">
        <button
          onClick={() => setOpenMenuId(open ? null : item.id)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Opsi untuk ${item.brand}`}
          className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="4" r="1.6" />
            <circle cx="10" cy="10" r="1.6" />
            <circle cx="10" cy="16" r="1.6" />
          </svg>
        </button>
        {open && (
          <div
            role="menu"
            aria-label={`Opsi ${item.brand}`}
            className="absolute right-0 top-full mt-1 flex flex-col items-stretch gap-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-20 animate-fade-in-fast"
          >
            <button
              role="menuitem"
              onClick={() => startEdit(item)}
              title="Ubah"
              aria-label={`Ubah ${item.brand}`}
              className="h-10 w-12 inline-flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <span aria-hidden="true" className="h-px mx-2 bg-slate-200 dark:bg-slate-700" />
            <button
              role="menuitem"
              onClick={() => doDelete(item, listLabel)}
              title="Hapus"
              aria-label={`Hapus ${item.brand}`}
              className="h-10 w-12 inline-flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916" />
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Baris mode ubah: nama selalu bisa diubah, tanggal khusus Free.
  function EditRow({ item }) {
    return (
      <li className="px-4 py-3 bg-brand-50/60 dark:bg-brand-500/5">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={editBrand}
            onChange={(e) => setEditBrand(e.target.value)}
            aria-label="Nama brand"
            placeholder="Nama brand"
            className={INPUT_CLS}
          />
          {item.type === 'GRATIS' && (
            <input
              type="date"
              value={editExpired}
              onChange={(e) => setEditExpired(e.target.value)}
              aria-label="Tanggal expired"
              className={`${INPUT_CLS} sm:max-w-[180px]`}
            />
          )}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => saveEdit(item)}
              className="flex-1 sm:flex-none min-h-[44px] inline-flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              Simpan
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="flex-1 sm:flex-none min-h-[44px] inline-flex items-center justify-center text-sm font-semibold text-slate-500 dark:text-slate-300 px-4 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              Batal
            </button>
          </div>
        </div>
      </li>
    );
  }

  function MonthlyRow({ item }) {
    if (editingId === item.id) return <EditRow item={item} />;
    return (
      <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
        <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-[11px] font-bold">
          {initials(item.brand)}
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.brand}</p>
        <Kebab item={item} listLabel="Monthly" />
      </li>
    );
  }

  function FreeRow({ item }) {
    const st = expiryState(item.expiredAt);
    if (editingId === item.id) return <EditRow item={item} />;
    return (
      <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
        <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-[11px] font-bold">
          {initials(item.brand)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.brand}</p>
          <button
            onClick={() => setDetailItem(item)}
            aria-label={`Lihat detail kontrak ${item.brand}`}
            title="Klik untuk detail kontrak"
            className="mt-0.5 inline-flex items-center gap-1 rounded-lg px-1 -mx-1 text-[11px] text-slate-400 hover:text-brand-600 dark:hover:text-brand-300 hover:underline underline-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            {fmtDateID(item.expiredAt)}
            {st === 'expired' && <span className="text-rose-500 font-bold"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
            {st === 'soon' && <span className="text-amber-600 dark:text-amber-400 font-bold"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
            {st === 'active' && <span> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
          </button>
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
        <Kebab item={item} listLabel="Free Maintenance" />
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

      {/* Koleksi client baru */}
      <section aria-label="Koleksi client baru" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Koleksi client baru</h3>
            <p className="text-[11px] text-slate-400">Brand yang baru masuk, sebelum dikontrak monthly/gratis.</p>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
            {clients.length}
          </span>
        </div>
        <form onSubmit={submitClient} className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label htmlFor="cc-brand" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Nama brand <span className="text-rose-500">*</span>
            </label>
            <input id="cc-brand" value={clientBrand} onChange={(e) => setClientBrand(e.target.value)} placeholder="cth. Kopi Arena" className={`${INPUT_CLS} mt-1.5`} />
          </div>
          <div className="flex-1">
            <label htmlFor="cc-company" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Perusahaan</label>
            <input id="cc-company" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="cth. PT Arena Ritel" className={`${INPUT_CLS} mt-1.5`} />
          </div>
          <div className="md:w-52">
            <label htmlFor="cc-contact" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Kontak</label>
            <input id="cc-contact" value={clientContact} onChange={(e) => setClientContact(e.target.value)} placeholder="Email atau WA" className={`${INPUT_CLS} mt-1.5`} />
          </div>
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-6 py-2.5 min-h-[44px] rounded-xl shadow-md shadow-brand-600/25 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            Tambah
          </button>
        </form>
        {clients.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[220px] overflow-y-auto">
            {clients.slice(0, 20).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                <span aria-hidden="true" className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {initials(c.brand)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.brand}</p>
                  {(c.company || c.contact) && (
                    <p className="text-[11px] text-slate-400 truncate">{[c.company, c.contact].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                <button
                  onClick={() => delClient(c)}
                  title="Hapus"
                  aria-label={`Hapus ${c.brand} dari koleksi`}
                  className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                >
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
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

      {/* Cari + contoh + status koneksi */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari brand..."
          aria-label="Cari brand"
          className={`${INPUT_CLS} sm:max-w-xs`}
        />
        {serverOk === false && (
          <span className="inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
            Mode offline
          </span>
        )}
        <div className="sm:ml-auto flex items-center gap-2">
          {serverOk === false && (
            <button
              onClick={async () => {
                const ok = await retryConnection();
                notify(ok ? 'Tersambung ke server.' : 'Backend belum terjangkau.', ok ? 'success' : 'error');
              }}
              className="min-h-[44px] inline-flex items-center text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              Coba lagi
            </button>
          )}
          {monthly.length + gratis.length === 0 && (
            <button
              onClick={() => {
                seedExamples().then(() => {
                  notify(`Contoh data finance dimasukkan (tanpa duplikat).${offTag}`, 'success');
                }).catch((err) => notify(errMsg(err), 'error'));
              }}
              className="min-h-[44px] inline-flex items-center text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 px-3 py-2 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              Isi contoh finance
            </button>
          )}
        </div>
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

      {/* Modal detail kontrak free: dibuka dari tanggal tiap baris */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDetailItem(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Detail kontrak ${detailItem.brand}`}
            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-fade-in-fast"
          >
            <div className="bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-xl bg-white/15 flex items-center justify-center text-xs font-bold">
                  {initials(detailItem.brand)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white">Free Maintenance</p>
                  <h3 className="font-bold truncate" title={detailItem.brand}>{detailItem.brand}</h3>
                </div>
                <button
                  onClick={() => setDetailItem(null)}
                  aria-label="Tutup detail"
                  className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <dl className="px-5 py-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs font-semibold text-slate-400">Expired sampai</dt>
                <dd className="font-bold text-slate-800 dark:text-slate-100">{fmtDateID(detailItem.expiredAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs font-semibold text-slate-400">Sisa kontrak</dt>
                <dd className="font-bold text-slate-800 dark:text-slate-100">{fmtLeft(daysLeft(detailItem.expiredAt)) || '-'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs font-semibold text-slate-400">Status</dt>
                <dd>
                  {expiryState(detailItem.expiredAt) === 'expired' && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">EXPIRED</span>
                  )}
                  {expiryState(detailItem.expiredAt) === 'soon' && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">SEGERA HABIS</span>
                  )}
                  {expiryState(detailItem.expiredAt) === 'active' && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">AKTIF</span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => {
                  const it = detailItem;
                  setDetailItem(null);
                  startEdit(it);
                }}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                Update
              </button>
              <button
                onClick={() => {
                  const it = detailItem;
                  setDetailItem(null);
                  doDelete(it, 'Free Maintenance');
                }}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center text-sm font-semibold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 px-4 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
