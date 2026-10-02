// Drawer "Tambah jadwal" untuk Jadwal Audit POPI NAVA. Daftar tersusun per
// brand sebagai kategori (seperti tampilan Kategori PopiNava): header grup =
// avatar + nama brand + jumlah outlet + tombol pilih (seluruh outletnya ikut),
// outlet lokasi brand itu tampil di bawahnya. Pilih minggu tujuan (W1-W5
// sesuai kalender), bebas campur brand/outlet. Unit yang sudah dijadwalkan di
// bulan yang sama dinonaktifkan. Escape menutup, fokus awal ke pencarian.
// Pola UI mengikuti OutletDrawer: panel kanan, Escape menutup, fokus awal
// ke pencarian, footer aksi lengket.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { ScrollArea } from '../ui/ScrollArea.jsx';
import {
  formatWeekRange,
  monthWeeks,
} from '../../lib/auditSchedule.js';

const INPUT_CLS =
  'w-full min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition';

const CHECK_CLS =
  'h-4 w-4 rounded accent-brand-600 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60';

function parseMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return { year: y, month: m - 1 };
}

export default function AuditScheduleDrawer({ open, monthKey, weekKey, outlets, scheduled, onClose, onSave }) {
  const [selWeek, setSelWeek] = useState(weekKey || 'W1');
  const [search, setSearch] = useState('');
  const [brands, setBrands] = useState(() => new Set());
  const [units, setUnits] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(null);

  // Reset state setiap drawer dibuka; minggu awal = minggu kartu asal.
  useEffect(() => {
    if (!open) return;
    setSelWeek(weekKey || 'W1');
    setSearch('');
    setBrands(new Set());
    setUnits(new Set());
    setCollapsed(new Set());
    setBusy(false);
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, weekKey]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { year, month } = parseMonth(monthKey);
  const { weekKeys, weekRanges } = useMemo(() => {
    const ws = monthWeeks(year, month);
    return {
      weekKeys: ws.map((w) => w.key),
      weekRanges: Object.fromEntries(ws.map((w) => [w.key, formatWeekRange(w)])),
    };
  }, [year, month]);

  // q = kata kunci pencarian (lowercase, tanpa spasi tepi).
  const q = search.trim().toLowerCase();

  // Grup per brand A→Z (pola Kategori PopiNava). Pencarian menyaring lintas
  // grup: nama brand cocok -> seluruh outletnya tampil; nama outlet cocok ->
  // hanya outlet itu di dalam grupnya.
  const groups = useMemo(() => {
    const map = new Map();
    for (const o of outlets) {
      const b = o.brandName || '-';
      if (!map.has(b)) map.set(b, []);
      map.get(b).push(o);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'id'))
      .map(([brand, all]) => {
        const brandHit = !q || brand.toLowerCase().includes(q);
        const items = brandHit
          ? all
          : all.filter((o) => `${o.brandName} ${o.deptChannelName}`.toLowerCase().includes(q));
        return { brand, all, items };
      })
      .filter((g) => g.items.length > 0);
  }, [outlets, q]);

  function toggleBrand(brand) {
    setBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  }

  function toggleUnit(uuid) {
    setUnits((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  function toggleGroup(brand) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  }

  const newCount =
    [...brands].filter((b) => !scheduled.has(`brand:${b}`)).length +
    [...units].filter((u) => !scheduled.has(u)).length;

  async function submit(e) {
    e.preventDefault();
    if (!newCount || busy) return;
    const items = [];
    for (const b of brands) {
      if (scheduled.has(`brand:${b}`)) continue;
      items.push({ id: crypto.randomUUID(), type: 'brand', brand: b });
    }
    for (const uuid of units) {
      if (scheduled.has(uuid)) continue;
      const o = outlets.find((x) => x.uuid === uuid);
      if (!o) continue;
      items.push({ id: crypto.randomUUID(), type: 'outlet', uuid, brand: o.brandName || '-', name: o.deptChannelName || '-' });
    }
    setBusy(true);
    try {
      await onSave(selWeek, items);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tambah jadwal audit"
        className="relative w-full max-w-lg h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col animate-fade-in-fast"
      >
        <header className="bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] px-5 py-4 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white">Jadwal audit</p>
              <h2 className="font-bold truncate">
                Tambah ke {selWeek} · {weekRanges[selWeek]}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Tutup jadwal"
              className="shrink-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15 focus-visible:ring-white/70"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </header>

        <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col" noValidate>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Minggu tujuan</span>
                <div
                  role="group"
                  aria-label="Pilih minggu tujuan"
                  className={`mt-1.5 grid gap-2 ${weekKeys.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}
                >
                  {weekKeys.map((k) => (
                    <Button
                      key={k}
                      type="button"
                      variant={selWeek === k ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={selWeek === k}
                      onClick={() => setSelWeek(k)}
                    >
                      {k}
                    </Button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Rentang {weekRanges[selWeek]} (hari kerja).</p>
              </div>

              <div>
                <label htmlFor="as-search" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Cari brand / outlet
                </label>
                <input
                  id="as-search"
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Chambers, SCH, Tebet…"
                  className={`${INPUT_CLS} mt-1.5`}
                />
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Brand (kategori) & lokasi outlet
                </p>
                <div className="mt-1.5 space-y-2">
                  {groups.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Tidak ada brand atau outlet yang cocok.</p>
                  )}
                  {groups.map((g) => {
                    const isOpen = !collapsed.has(g.brand);
                    const done = scheduled.get(`brand:${g.brand}`);
                    const on = brands.has(g.brand);
                    const panelId = `as-grp-${g.brand.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
                    return (
                      <section
                        key={g.brand}
                        aria-label={g.brand}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-800/60">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => toggleGroup(g.brand)}
                            className="gap-1.5 min-h-[44px]"
                          >
                            <svg
                              aria-hidden="true"
                              className={`w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                            <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-600/10 text-brand-700 dark:text-brand-300 text-[11px] font-bold">
                              {g.brand.slice(0, 1)}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">{g.brand}</span>
                          </Button>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/30">
                            {g.all.length} outlet
                          </span>
                          <Button
                            type="button"
                            variant={on ? 'primary' : 'secondary'}
                            size="sm"
                            aria-label={`Pilih brand ${g.brand}`}
                            aria-pressed={on}
                            aria-disabled={done ? 'true' : undefined}
                            onClick={() => !done && toggleBrand(g.brand)}
                            className="ml-auto"
                          >
                            {done ? `Sudah ${done}` : 'Pilih'}
                          </Button>
                        </div>
                        <ul id={panelId} className="p-2 space-y-1.5 border-t border-slate-100 dark:border-slate-800">
                          {isOpen &&
                            g.items.map((o) => {
                              const oDone = scheduled.get(o.uuid);
                              const viaBrand = brands.has(o.brandName);
                              const onOut = units.has(o.uuid);
                              const disabled = !!oDone;
                              return (
                                <li key={o.uuid}>
                                  <label
                                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[44px] transition ${
                                      disabled
                                        ? 'border-slate-100 dark:border-slate-800 opacity-60'
                                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className={CHECK_CLS}
                                      checked={onOut || viaBrand}
                                      disabled={disabled || viaBrand}
                                      onChange={() => toggleUnit(o.uuid)}
                                      aria-label={`${o.deptChannelName} (${o.brandName})`}
                                    />
                                    <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                      {o.deptChannelName}
                                    </span>
                                    {(oDone || viaBrand) && (
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
                                        {oDone ? `Sudah ${oDone}` : 'Ikut brand'}
                                      </span>
                                    )}
                                  </label>
                                </li>
                              );
                            })}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-2">
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={busy} disabled={!newCount} className="flex-1 active:scale-[.98]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Simpan jadwal
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
                Batal
              </Button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {newCount ? `${newCount} item siap ditambahkan ke ${selWeek}.` : 'Pilih brand atau outlet dulu.'}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
