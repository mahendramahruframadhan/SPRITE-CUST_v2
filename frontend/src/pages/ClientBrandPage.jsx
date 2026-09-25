// Halaman Client & Brand, versi elegan untuk tim finance (frontend-only).
// Design Read: halaman admin operasional untuk tim Revota, bahasa Linear-clean,
// dial ENERGY 2 / RHYTHM 2 / MOTION 2 (lihat DESIGN.md, naik saat revamp 2026-09).
// Alasan (R-31): hero gradien indigo ke ungu adalah identitas brand Revota (R-01);
// kartu metrik identik + hover-lift karena perbandingan setara (R-14, motif DESIGN.md);
// badge kapsul hanya status fungsional Monthly/Free/Expired (R-09);
// baris hanya untuk baca: ketuk baris mana pun membuka modal detail berisi
// detail + Update + Hapus, satu pola untuk Monthly dan Free (R-31: satu titik
// aksi, tanpa menu tambahan); form ubah tinggal di dalam modal;
// satu reveal per grup tanpa cascade delay (R-19, MOTION 2).
// Context7 react: form terkontrol + useMemo (react/docs); Tailwind mobile-first
// grid + dark: variant (tailwindcss/docs); pola cegah duplikat per daftar.
// TODO(backend): sambungkan useClientBrands ke API saat backend siap.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useClientBrands } from '../hooks/useClientBrands.js';
import { daysLeft, expiryState, fmtDateID } from '../utils/contract.js';
import DatePickerInput from '../components/DatePickerInput.jsx';
import { useToast } from '../context/ToastContext.jsx';

const INPUT_CLS =
  'w-full min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition';

// R-31: reveal sekali saat grup masuk viewport = orientasi scroll (MOTION 2).
function Reveal({ children, className = '' }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px' }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

const TABS = [
  { id: 'MONTHLY', label: 'Monthly' },
  { id: 'GRATIS', label: 'Free Maintenance' },
];

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
  const { statuses, stats, addStatus, updateStatus, removeStatus, seedExamples, ready, serverOk, retryConnection } = useClientBrands();
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('GRATIS');
  const [expiredAt, setExpiredAt] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [modalMode, setModalMode] = useState('view');
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Escape menutup modal detail.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setDetailItem(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const monthly = useMemo(() => statuses.filter((s) => s.type === 'MONTHLY'), [statuses]);
  const gratis = useMemo(
    () =>
      statuses
        .filter((s) => s.type === 'GRATIS')
        .slice()
        .sort((a, b) => String(a.expiredAt || '9999').localeCompare(String(b.expiredAt || '9999'))),
    [statuses]
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

  function openDetail(item) {
    setDetailItem(item);
    setModalMode('view');
    setConfirmDelete(false);
  }

  function closeDetail() {
    setDetailItem(null);
    setModalMode('view');
    setConfirmDelete(false);
  }

  function beginEdit() {
    if (!detailItem) return;
    setEditName(detailItem.brand);
    setEditDate(detailItem.expiredAt || '');
    setConfirmDelete(false);
    setModalMode('edit');
  }

  function saveModalEdit() {
    const item = detailItem;
    if (!item) return;
    const name = editName.trim();
    if (!name) {
      notify('Nama brand tidak boleh kosong', 'error');
      return;
    }
    if (item.type === 'GRATIS' && !editDate) {
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
    updateStatus(item.id, { brand: name, ...(item.type === 'GRATIS' ? { expiredAt: editDate } : {}) })
      .then(() => {
        setDetailItem({ ...item, brand: name, ...(item.type === 'GRATIS' ? { expiredAt: editDate } : {}) });
        setModalMode('view');
        notify(`${name} diperbarui.${offTag}`, 'success');
      })
      .catch((err) => notify(errMsg(err), 'error'));
  }

  function doModalDelete() {
    const item = detailItem;
    if (!item) return;
    (async () => {
      try {
        await removeStatus(item.id);
        closeDetail();
        notify(`${item.brand} dihapus dari ${item.type === 'GRATIS' ? 'Free Maintenance' : 'Monthly'}.${offTag}`, 'info');
      } catch (err) {
        notify(errMsg(err), 'error');
      }
    })();
  }

  // Aksi baris terpusat di modal detail: satu pola untuk Monthly dan Free
  // (R-31: kurangi titik aksi, baris hanya untuk baca + ketuk menuju detail).

  // Baris hanya untuk baca: seluruh isi bisa diketuk menuju modal detail.
  // Chevron kanan sebagai penanda drill-in (satu-satunya panah di halaman,
  // alasan: menandai baris bisa dibuka, bukan dekorasi).
  function RowButton({ item, onOpen, children }) {
    return (
      <button
        onClick={() => onOpen(item)}
        aria-label={`Lihat detail ${item.brand}`}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60"
      >
        {children}
        <svg className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    );
  }

  function MonthlyRow({ item }) {
    return (
      <li>
        <RowButton item={item} onOpen={openDetail}>
          <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-[11px] font-bold">
            {initials(item.brand)}
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.brand}</span>
        </RowButton>
      </li>
    );
  }

  function FreeRow({ item }) {
    const st = expiryState(item.expiredAt);
    return (
      <li>
        <RowButton item={item} onOpen={openDetail}>
          <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-[11px] font-bold">
            {initials(item.brand)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.brand}</span>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <svg className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              {fmtDateID(item.expiredAt)}
              {st === 'expired' && <span className="text-rose-500 font-bold"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
              {st === 'soon' && <span className="text-amber-600 dark:text-amber-400 font-bold"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
              {st === 'active' && <span className="text-slate-500 dark:text-slate-400"> · {fmtLeft(daysLeft(item.expiredAt))}</span>}
            </span>
          </span>
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
        </RowButton>
      </li>
    );
  }

  return (
    <div className="page">
      {!ready && (
        <div aria-busy="true" aria-label="Memuat data brand" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 animate-pulse">Memuat data brand...</p>
        </div>
      )}
      {/* Hero identitas brand: gradien indigo ke ungu (R-01, alasan = brand Revota) */}
      <Reveal className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] p-5 sm:p-6 text-white">
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
      </Reveal>

      {/* Tambah cepat */}
      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col md:flex-row gap-3 md:items-end shadow-sm"
      >
        <div className="flex-1">
          <label htmlFor="cb-brand" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
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
          <span id="cb-type-label" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Masuk ke</span>
          <div className="flex mt-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-1" role="group" aria-labelledby="cb-type-label">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                aria-pressed={type === t.id}
                className={`flex-1 px-4 min-h-[44px] rounded-lg text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                  type === t.id
                    ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {type === 'GRATIS' && (
          <div className="md:w-72">
            <label htmlFor="cb-exp" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Expired <span className="text-rose-500">*</span>
            </label>
            <div className="mt-1.5">
              <DatePickerInput id="cb-exp" value={expiredAt} onChange={setExpiredAt} />
            </div>
          </div>
        )}
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-sm font-bold px-6 py-2.5 min-h-[44px] rounded-xl shadow-md shadow-brand-600/25 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Tambah
        </button>
      </form>

      {/* Status koneksi + contoh */}
      <div className="flex flex-wrap items-center gap-2">
        {serverOk === false && (
          <span className="inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
            Mode offline
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {serverOk === false && (
            <button
              onClick={async () => {
                const ok = await retryConnection();
                notify(ok ? 'Tersambung ke server.' : 'Backend belum terjangkau.', ok ? 'success' : 'error');
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
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
              className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 active:bg-brand-100 dark:active:bg-brand-500/20 px-3 py-2 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Isi contoh finance
            </button>
          )}
        </div>
      </div>

      {/* Dua daftar: monthly dan free, urut expired terdekat */}
      <Reveal className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section aria-label="Support Monthly" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
          <header className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Support Monthly</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Brand berlangganan bulanan</p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20">
              {monthly.length}
            </span>
          </header>
          {monthly.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">Belum ada. Ketik nama lalu Tambah ke Monthly.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[440px] overflow-y-auto scrollbar-thin">
              {monthly.map((it) => <MonthlyRow key={it.id} item={it} />)}
            </ul>
          )}
        </section>

        <section aria-label="Kontrak Free Maintenance" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
          <header className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kontrak Free Maintenance</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {expiredCount > 0 ? `${expiredCount} expired` : 'Urut dari expired terdekat'}
                {soonCount > 0 && ` · ${soonCount} segera habis`}
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
              {gratis.length}
            </span>
          </header>
          {gratis.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">Belum ada. Pilih Free Maintenance dan isi tanggal expired.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[440px] overflow-y-auto scrollbar-thin">
              {gratis.map((it) => <FreeRow key={it.id} item={it} />)}
            </ul>
          )}
        </section>
      </Reveal>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">Tersimpan otomatis di browser ini. Backend disambungkan nanti tanpa mengubah tampilan.</p>

      {/* Modal detail: dibuka dari baris mana pun; berisi detail + Update + Hapus */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeDetail} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Detail kontrak ${detailItem.brand}`}
            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-fade-in-fast"
          >
            <div className="bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-xl bg-white/15 flex items-center justify-center text-xs font-bold">
                  {initials(modalMode === 'edit' ? editName || detailItem.brand : detailItem.brand)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white">
                    {modalMode === 'edit' ? 'Ubah data' : detailItem.type === 'GRATIS' ? 'Free Maintenance' : 'Monthly'}
                  </p>
                  <h3 className="font-bold truncate" title={detailItem.brand}>{detailItem.brand}</h3>
                </div>
                <button
                  onClick={closeDetail}
                  aria-label="Tutup detail"
                  className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {modalMode === 'edit' ? (
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label htmlFor="dm-name" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Nama brand <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="dm-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nama brand"
                    className={`${INPUT_CLS} mt-1.5`}
                  />
                </div>
                {detailItem.type === 'GRATIS' && (
                  <div>
                    <label htmlFor="dm-exp" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Expired sampai <span className="text-rose-500">*</span>
                    </label>
                    <div className="mt-1.5">
                      <DatePickerInput id="dm-exp" value={editDate} onChange={setEditDate} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Tanggal terakhir kontrak gratis berlaku.</p>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveModalEdit}
                    className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-sm font-bold px-4 rounded-xl shadow-md shadow-brand-600/25 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Simpan
                  </button>
                  <button
                    onClick={() => setModalMode('view')}
                    className="flex-1 min-h-[44px] inline-flex items-center justify-center text-sm font-bold text-slate-500 dark:text-slate-300 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <>
                <dl className="px-5 py-4 space-y-3 text-sm">
                  {detailItem.type === 'GRATIS' ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Expired sampai</dt>
                        <dd>
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                            <svg className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                            </svg>
                            {fmtDateID(detailItem.expiredAt)}
                          </span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sisa kontrak</dt>
                        <dd className="font-bold text-slate-800 dark:text-slate-100">{fmtLeft(daysLeft(detailItem.expiredAt)) || '-'}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status</dt>
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
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tipe</dt>
                        <dd>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20">MONTHLY</span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tercatat sejak</dt>
                        <dd className="font-bold text-slate-800 dark:text-slate-100">{fmtDateID(String(detailItem.createdAt || '').slice(0, 10))}</dd>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Berlangganan bulanan, tanpa tanggal expired.</p>
                    </>
                  )}
                </dl>
                <div className="px-5 pb-5">
                  {confirmDelete ? (
                    <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/5 p-3">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Hapus <span className="font-bold">{detailItem.brand}</span> permanen?
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <button
                          onClick={doModalDelete}
                          className="flex-1 min-h-[44px] inline-flex items-center justify-center text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 px-4 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                        >
                          Ya, hapus
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="flex-1 min-h-[44px] inline-flex items-center justify-center text-sm font-bold text-slate-500 dark:text-slate-300 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={beginEdit}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-sm font-bold px-4 rounded-xl shadow-md shadow-brand-600/25 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                        Update
                      </button>
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 text-sm font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 px-4 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 active:bg-rose-100 dark:active:bg-rose-500/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916" />
                        </svg>
                        Hapus
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
