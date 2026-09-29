// Halaman master data POPI NAVA (spec §10), fase frontend: daftar outlet +
// filter + tabel + drawer form + wizard impor + ekspor + aksi massal.
// Backend /popinava belum ada (fase ini): data seed 88 baris dari sheet
// sumber + localStorage, dengan badge "mode lokal" yang jujur (R-26) dan
// banner bila server benar-benar gagal (spec §10.4 state error).
// Design Read: hero gradien indigo ke ungu identitas brand Revota (R-01);
// radius rounded-2xl mengikuti halaman sekunder (DESIGN.md, bukan 28px);
// badge kapsul hanya status fungsional (R-09); reveal satu grup tanpa
// cascade (R-19, MOTION 2); angka metrik diambil dari data aktual
// (13 brand, 88 outlet, R-17), tanpa klaim berlebih (R-36).
// UI search: tabel lebar dibungkus overflow-x-auto, bulk action memakai
// checkbox + action bar, empty state punya CTA Impor (panduan
// ui-ux-pro-max: Table Handling, Bulk Actions, Empty States, Error
// Placement; diverifikasi terhadap pola repo sebelum dipakai).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Reveal } from '../components/Reveal.jsx';
import { Button } from '../components/ui/Button.jsx';
import { useConfirm } from '../components/ui/ConfirmProvider.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { usePopinava } from '../hooks/usePopinava.js';
import { exportRecords } from '../lib/popinavaExport.js';
import { fmtDateID } from '../utils/contract.js';
import ImportWizard from '../components/popinava/ImportWizard.jsx';
import OutletDrawer from '../components/popinava/OutletDrawer.jsx';

const INPUT_CLS =
  'w-full min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition';

const COLS = [
  { key: 'brandName', label: 'Brand', sort: true },
  { key: 'rvtCustcode', label: 'Custcode', sort: true },
  { key: 'deptCode', label: 'Dept code', sort: true },
  { key: 'deptName', label: 'Dept', sort: true },
  { key: 'deptChannelName', label: 'Channel' },
  { key: 'isoCode', label: 'Iso' },
  { key: 'city', label: 'Kota', sort: true },
  { key: 'province', label: 'Provinsi' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'area', label: 'Area' },
  { key: 'status', label: 'Status', sort: true },
  { key: 'sourceCreatedAt', label: 'Dibuat (sumber)', sort: true },
];

function statusBadge(status) {
  return status === 'inactive' ? (
    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
      NONAKTIF
    </span>
  ) : (
    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
      AKTIF
    </span>
  );
}

export default function PopiNavaPage() {
  const { notify } = useToast();
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canWrite = can('popinava');
  const {
    ready,
    serverOk,
    probeError,
    retryProbe,
    stats,
    facets,
    filters,
    setFilter,
    resetFilters,
    sort,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    total,
    pageRows,
    exportable,
    create,
    update,
    remove,
    bulk,
    previewImport,
    commitImport,
  } = usePopinava();

  // Search debounce 300 ms (spec §10.1) diatur di halaman, filter di hook.
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setFilter('search', searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput, setFilter]);

  const [selected, setSelected] = useState(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('create');
  const [editing, setEditing] = useState(null);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const headCheckRef = useRef(null);

  const offTag = serverOk === false ? ' (mode lokal, tersimpan di browser)' : '';
  const errMsg = (e) => e?.data?.message || e?.message || 'Gagal, coba lagi.';
  const localMode = serverOk === false;

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setExpOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Seleksi baris yang terlihat + indeterminate header checkbox.
  const pageIds = useMemo(() => pageRows.map((r) => r.uuid), [pageRows]);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length;
  useEffect(() => {
    if (headCheckRef.current) headCheckRef.current.indeterminate = selectedOnPage > 0 && !allOnPage;
  }, [selectedOnPage, allOnPage]);

  function toggleOne(uuid) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function openCreate() {
    setDrawerMode('create');
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(rec) {
    setDrawerMode('edit');
    setEditing(rec);
    setDrawerOpen(true);
  }

  async function saveDrawer(payload) {
    setDrawerBusy(true);
    try {
      if (drawerMode === 'edit' && editing) {
        await update(editing.uuid, payload);
        notify(`Outlet ${payload.dept_channel_name} diperbarui.${offTag}`, 'success');
      } else {
        await create(payload);
        notify(`Outlet ${payload.dept_channel_name} ditambahkan.${offTag}`, 'success');
      }
      setDrawerOpen(false);
    } catch (e) {
      notify(errMsg(e), 'error');
    } finally {
      setDrawerBusy(false);
    }
  }

  async function deleteOne(rec) {
    const ok = await confirm({
      title: `Hapus "${rec.deptChannelName}"?`,
      description: `Outlet ${rec.rvtCustcode} / ${rec.deptCode} akan dihapus permanen.`,
      variant: 'danger',
      confirmLabel: 'Ya, hapus',
    });
    if (!ok) return;
    try {
      await remove(rec.uuid);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(rec.uuid);
        return next;
      });
      notify(`Outlet ${rec.deptChannelName} dihapus.${offTag}`, 'success');
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  }

  async function doBulk(action, status) {
    const uuids = [...selected];
    const n = uuids.length;
    if (n === 0) return;
    const ok = await confirm({
      title: action === 'delete' ? `Hapus ${n} outlet?` : `${status === 'active' ? 'Aktifkan' : 'Nonaktifkan'} ${n} outlet?`,
      description:
        action === 'delete'
          ? `${n} baris terpilih akan dihapus permanen.`
          : `${n} baris terpilih akan ditandai ${status}.`,
      variant: action === 'delete' ? 'danger' : 'primary',
      confirmLabel: action === 'delete' ? `Ya, hapus ${n}` : 'Ya, lanjutkan',
    });
    if (!ok) return;
    try {
      await bulk({ action, uuids, status });
      setSelected(new Set());
      notify(
        action === 'delete'
          ? `${n} outlet dihapus.${offTag}`
          : `${n} outlet ditandai ${status}.${offTag}`,
        'success'
      );
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  }

  async function doExport(format) {
    try {
      const n = await exportRecords(exportable, format);
      // Audit activity_logs ikut endpoint backend (§12), fase frontend ditiadakan.
      notify(`Ekspor ${n} baris ke ${format.toUpperCase()}.${offTag}`, 'success');
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  }

  function commitWizard(entries, mode) {
    const res = commitImport(entries, mode);
    return res;
  }

  return (
    <div className="page">
      {!ready && (
        <div aria-busy="true" aria-label="Memuat data outlet" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 animate-pulse">Memuat data outlet…</p>
        </div>
      )}

      {/* Hero master data: gradien brand + ringkasan + aksi utama (§10.1) */}
      <Reveal className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] p-5 sm:p-6 text-white">
        <div className="relative flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white">Master data</p>
            <h3 className="mt-1 text-lg sm:text-xl font-bold leading-tight">POPI NAVA</h3>
            <p className="mt-1 text-xs text-white/90">
              Outlet dan department per brand, impor dari sheet, kelola tanpa menyunting Excel.
            </p>
          </div>
          <dl className="flex gap-2 sm:gap-3">
            <div className="rounded-xl bg-white/15 px-4 py-2.5 text-center">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-white">Brand</dt>
              <dd className="text-xl font-bold">{stats.brands}</dd>
            </div>
            <div className="rounded-xl bg-white/15 px-4 py-2.5 text-center">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-white">Outlet aktif</dt>
              <dd className="text-xl font-bold">{stats.active}</dd>
            </div>
            <div className="hidden sm:block rounded-xl bg-white/15 px-4 py-2.5 text-center">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-white">Nonaktif</dt>
              <dd className="text-xl font-bold">{stats.inactive}</dd>
            </div>
          </dl>
        </div>
        {canWrite && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setWizardOpen(true)} className="text-white border border-white/40 hover:bg-white/15 focus-visible:ring-white/70">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Impor
            </Button>
            <div className="relative">
              <Button variant="ghost" size="sm" onClick={() => setExpOpen((v) => !v)} aria-haspopup="menu" aria-expanded={expOpen} className="text-white border border-white/40 hover:bg-white/15 focus-visible:ring-white/70">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Ekspor
              </Button>
              {expOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExpOpen(false)} aria-hidden="true" />
                  <div role="menu" aria-label="Format ekspor" className="absolute left-0 z-20 mt-1.5 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-xl">
                    <Button variant="ghost" role="menuitem" onClick={() => { setExpOpen(false); doExport('csv'); }} className="w-full justify-start text-slate-700 dark:text-slate-200">
                      CSV (dibuka di Excel)
                    </Button>
                    <Button variant="ghost" role="menuitem" onClick={() => { setExpOpen(false); doExport('xlsx'); }} className="w-full justify-start text-slate-700 dark:text-slate-200">
                      Excel (.xlsx)
                    </Button>
                  </div>
                </>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={openCreate} className="bg-white/95 border-0 text-slate-800 hover:bg-white">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah Outlet
            </Button>
          </div>
        )}
      </Reveal>

      {/* Koneksi & error: jujur soal mode lokal; banner bila server gagal */}
      <div className="flex flex-wrap items-center gap-2">
        {localMode && (
          <span className="inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
            Mode lokal: backend /popinava belum tersambung, data tersimpan di browser
          </span>
        )}
        {serverOk === true && (
          <span className="inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
            Terhubung ke server
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {(localMode || probeError) && (
            <Button variant="secondary" size="sm" onClick={async () => { const ok = await retryProbe(); notify(ok ? 'Tersambung ke server.' : 'Masih mode lokal.', ok ? 'success' : 'info'); }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Coba lagi
            </Button>
          )}
        </div>
      </div>
      {probeError && (
        <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-4 py-3 text-xs font-semibold text-rose-700 dark:text-rose-400">
          Server tidak bisa dihubungi: {errMsg(probeError)}. Data tetap bisa dikelola secara lokal.
        </div>
      )}

      {/* Filter (§10.1): search debounce + dropdown facet + reset */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label htmlFor="pn-search" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Cari
            </label>
            <div className="relative mt-1.5">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                id="pn-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari uuid, nama channel, alamat, kota…"
                className={`${INPUT_CLS} pl-9`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="pn-filter-brand" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Brand</label>
            <select id="pn-filter-brand" value={filters.brand} onChange={(e) => setFilter('brand', e.target.value)} className={`${INPUT_CLS} mt-1.5`}>
              <option value="">Semua brand</option>
              {facets.brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pn-filter-dept" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Dept</label>
            <select id="pn-filter-dept" value={filters.deptName} onChange={(e) => setFilter('deptName', e.target.value)} className={`${INPUT_CLS} mt-1.5`}>
              <option value="">Semua dept</option>
              <option value="DISTRIBUTION">DISTRIBUTION</option>
              <option value="SHOP">SHOP</option>
            </select>
          </div>
          <div>
            <label htmlFor="pn-filter-status" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</label>
            <select id="pn-filter-status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={`${INPUT_CLS} mt-1.5`}>
              <option value="">Semua status</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <div>
            <label htmlFor="pn-filter-city" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Kota</label>
            <select id="pn-filter-city" value={filters.city} onChange={(e) => setFilter('city', e.target.value)} className={`${INPUT_CLS} mt-1.5`}>
              <option value="">Semua kota</option>
              {facets.cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-6 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-56">
              <label htmlFor="pn-filter-area" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Area</label>
              <select id="pn-filter-area" value={filters.area} onChange={(e) => setFilter('area', e.target.value)} className={`${INPUT_CLS} mt-1.5`}>
                <option value="">Semua area</option>
                {facets.areas.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { resetFilters(); setSearchInput(''); }} className="mt-1.5">
              Reset filter
            </Button>
          </div>
        </div>
      </Reveal>

      {/* Selection bar: muncul bila ada checkbox terpilih (§10.1) */}
      {selected.size > 0 && canWrite && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-4 py-3">
          <span className="text-xs font-bold text-brand-800 dark:text-brand-200">
            {selected.size} outlet terpilih
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => doBulk('set-status', 'inactive')}>Nonaktifkan</Button>
            <Button variant="secondary" size="sm" onClick={() => doBulk('set-status', 'active')}>Aktifkan</Button>
            <Button variant="destructive" size="sm" onClick={() => doBulk('delete')}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916" />
              </svg>
              Hapus
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Bersihkan</Button>
          </div>
        </div>
      )}

      {/* Tabel utama */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {total === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {stats.total === 0 ? 'Belum ada data outlet' : 'Tidak ada outlet yang cocok dengan filter'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {stats.total === 0
                ? 'Impor file dari sheet POPI NAVA atau tambah outlet secara manual.'
                : 'Ubah kata kunci atau reset filter.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {stats.total === 0 && canWrite && (
                <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)}>
                  Impor data
                </Button>
              )}
              {stats.total > 0 && (
                <Button variant="secondary" size="sm" onClick={() => { resetFilters(); setSearchInput(''); }}>
                  Reset filter
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 w-10 text-left">
                      {canWrite && (
                        <input
                          ref={headCheckRef}
                          type="checkbox"
                          checked={allOnPage}
                          onChange={togglePage}
                          aria-label="Pilih semua baris di halaman ini"
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40"
                        />
                      )}
                    </th>
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={c.sort ? (sort.field === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                        className="px-3 py-2.5 text-left font-bold whitespace-nowrap"
                      >
                        {c.sort ? (
                          /* eslint-disable-next-line react/forbid-elements -- kontrol mikro header tabel: tombol sort kolom */
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded"
                          >
                            {c.label}
                            <span aria-hidden="true" className={sort.field === c.key ? 'text-brand-600' : 'text-slate-300 dark:text-slate-600'}>
                              {sort.field === c.key && sort.dir === 'desc' ? '↓' : '↑'}
                            </span>
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2.5 text-right font-bold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map((r) => (
                    <tr key={r.uuid} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="px-3 py-2.5">
                        {canWrite && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.uuid)}
                            onChange={() => toggleOne(r.uuid)}
                            aria-label={`Pilih ${r.deptChannelName}`}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{r.brandName || '-'}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.rvtCustcode}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.deptCode}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.deptName}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 max-w-52 truncate" title={r.deptChannelName}>{r.deptChannelName}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.isoCode}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.city}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.province}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.postcode || '-'}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.area || '-'}</td>
                      <td className="px-3 py-2.5">{statusBadge(r.status)}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {r.sourceCreatedAt ? fmtDateID(String(r.sourceCreatedAt).slice(0, 10)) : '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        {canWrite && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(r)}
                              aria-label={`Ubah ${r.deptChannelName}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteOne(r)}
                              aria-label={`Hapus ${r.deptChannelName}`}
                              className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916" />
                              </svg>
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination server-side shape (default 50, §10.1) */}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 dark:border-slate-800 px-4 py-3">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {`${total} baris cocok · halaman ${page} dari ${totalPages}`}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <label htmlFor="pn-pagesize" className="text-[11px] text-slate-500 dark:text-slate-400">Per halaman</label>
                <select
                  id="pn-pagesize"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="min-h-[36px] text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Sebelumnya
                </Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Berikutnya
                </Button>
              </div>
            </div>
          </>
        )}
      </Reveal>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {localMode
          ? 'Data tersimpan di browser ini. Endpoint /popinava terpakai otomatis begitu server tersambung.'
          : 'Data tersimpan di server.'}
      </p>

      <OutletDrawer
        open={drawerOpen}
        mode={drawerMode}
        initial={editing}
        busy={drawerBusy}
        onClose={() => setDrawerOpen(false)}
        onSave={saveDrawer}
      />
      <ImportWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onPreview={previewImport}
        onCommit={commitWizard}
        localMode={localMode}
      />
    </div>
  );
}
