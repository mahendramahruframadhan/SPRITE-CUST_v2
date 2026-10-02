// Tab "Jadwal Audit" di halaman POPI NAVA: kartu minggu kalender per bulan
// (W1 mulai Senin pertama, Senin penentu bulan, 4-5 minggu) + penetapan
// brand/outlet per minggu. Penyimpanan lewat lib/auditSchedule (localStorage
// sekarang; kontrak async {month, weeks} siap dialihkan ke backend).
// Sengaja tanpa indikator slot: bebas berapa item per minggu (keputusan owner).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Reveal } from '../Reveal.jsx';
import { Button } from '../ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirm } from '../ui/ConfirmProvider.jsx';
import AuditScheduleDrawer from './AuditScheduleDrawer.jsx';
import {
  WEEK_LABELS,
  addItem,
  emptyWeeks,
  formatMonthLabel,
  formatWeekRange,
  getSchedule,
  monthKeyOf,
  monthWeeks,
  moveItem,
  removeItem,
  saveSchedule,
  shiftMonthKey,
} from '../../lib/auditSchedule.js';

function parseMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function itemLabel(item) {
  return item.type === 'brand' ? item.brand : item.name;
}

export default function AuditSchedule({ outlets, canWrite }) {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(new Date()));
  const [weeks, setWeeks] = useState(null); // null = masih memuat
  const [loadErr, setLoadErr] = useState(false);
  const [picker, setPicker] = useState(null); // minggu tujuan drawer, null = tertutup
  const [expanded, setExpanded] = useState(() => new Set()); // id item brand yang daftar outletnya terbuka

  const load = useCallback(async () => {
    setWeeks(null);
    setLoadErr(false);
    try {
      const s = await getSchedule(monthKey);
      setWeeks(s.weeks);
    } catch {
      setLoadErr(true);
    }
  }, [monthKey]);

  useEffect(() => {
    load();
  }, [load]);

  const { year, month } = parseMonth(monthKey);
  const { weekKeys, weekRanges } = useMemo(() => {
    const ws = monthWeeks(year, month);
    return {
      weekKeys: ws.map((w) => w.key),
      weekRanges: Object.fromEntries(ws.map((w) => [w.key, formatWeekRange(w)])),
    };
  }, [year, month]);
  const current = weeks || emptyWeeks();
  const total = WEEK_LABELS.reduce((n, k) => n + current[k].length, 0);

  // Peta unit terjadwal (id item -> minggu) untuk menonaktifkan pilihan ganda
  // di drawer.
  const scheduled = useMemo(() => {
    const m = new Map();
    for (const k of WEEK_LABELS) {
      for (const it of current[k]) {
        m.set(it.type === 'brand' ? `brand:${it.brand}` : it.uuid, k);
      }
    }
    return m;
  }, [current]);

  // Lookup master untuk detail kartu: outlet by uuid (baris sub custcode/kota)
  // dan brand -> outlets (jumlah + daftar yang bisa dibuka). Tidak mengubah
  // bentuk item tersimpan, data lama tetap kompatibel.
  const outletByUuid = useMemo(() => new Map(outlets.map((o) => [o.uuid, o])), [outlets]);
  const outletsByBrand = useMemo(() => {
    const m = new Map();
    for (const o of outlets) {
      const b = o.brandName || '-';
      if (!m.has(b)) m.set(b, []);
      m.get(b).push(o);
    }
    return m;
  }, [outlets]);

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function outletSub(o) {
    if (!o) return '';
    return [o.rvtCustcode, o.city].filter(Boolean).join(' · ');
  }

  async function persist(nextWeeks) {
    await saveSchedule(monthKey, nextWeeks);
    setWeeks(nextWeeks);
  }

  async function handleSave(weekKey, items) {
    let next = current;
    for (const item of items) next = addItem(next, weekKey, item);
    await persist(next);
    setPicker(null);
    notify(`${items.length} item ditambahkan ke ${weekKey}.`, 'success');
  }

  async function handleRemove(weekKey, item) {
    const ok = await confirm({
      title: `Hapus "${itemLabel(item)}" dari ${weekKey}?`,
      description: 'Item jadwal audit ini akan dihapus dari minggu tersebut.',
      variant: 'danger',
      confirmLabel: 'Ya, hapus',
    });
    if (!ok) return;
    await persist(removeItem(current, weekKey, item.id));
    notify(`"${itemLabel(item)}" dihapus dari ${weekKey}.`, 'success');
  }

  async function handleMove(weekKey, item, toKey) {
    if (toKey === weekKey) return;
    await persist(moveItem(current, weekKey, toKey, item.id));
    notify(`"${itemLabel(item)}" dipindah ke ${toKey}.`, 'success');
  }

  const thisMonth = monthKeyOf(new Date());

  return (
    <>
      {/* Navigasi bulan: arah + label + reset; satu reveal per section (MOTION 2) */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Bulan sebelumnya"
              onClick={() => setMonthKey((k) => shiftMonthKey(k, -1))}
              className="rounded-none min-w-[44px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Button>
            <span className="px-3 min-h-[44px] inline-flex items-center text-sm font-bold text-slate-800 dark:text-slate-100 border-x border-slate-200 dark:border-slate-700">
              {formatMonthLabel(monthKey)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Bulan berikutnya"
              onClick={() => setMonthKey((k) => shiftMonthKey(k, 1))}
              className="rounded-none min-w-[44px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Button>
          </div>
          <Button variant="secondary" size="sm" disabled={monthKey === thisMonth} onClick={() => setMonthKey(thisMonth)}>
            Hari ini
          </Button>
          <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">
            Ikut minggu kalender Sen-Jum; Senin menentukan bulan minggu itu. Tersimpan di browser ini.
          </span>
        </div>
      </Reveal>

      {/* State memuat & gagal (R-27) */}
      {weeks === null && !loadErr && (
        <div aria-busy="true" aria-label="Memuat jadwal audit" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 animate-pulse">Memuat jadwal…</p>
        </div>
      )}
      {loadErr && (
        <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-4 py-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-rose-700 dark:text-rose-400">
          Gagal memuat jadwal dari penyimpanan browser.
          <Button variant="secondary" size="sm" onClick={load}>
            Coba lagi
          </Button>
        </div>
      )}

      {/* Empty state bulan ini + CTA (R-27, R-26) */}
      {weeks !== null && total === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-8 text-center">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Belum ada jadwal audit bulan ini.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tetapkan brand atau outlet ke salah satu minggu, W1 sampai {weekKeys[weekKeys.length - 1]}.
          </p>
          {canWrite && (
            <Button variant="primary" size="sm" className="mt-4" onClick={() => setPicker('W1')}>
              Tambah jadwal pertama
            </Button>
          )}
        </div>
      )}

      {/* Kartu minggu kalender bulan ini (4-5 kartu; hierarki setara, R-14) */}
      <Reveal
        innerKey={monthKey}
        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${weekKeys.length === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}
      >
        {weekKeys.map((k) => (
          <section
            key={k}
            aria-labelledby={`as-week-${k}`}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col"
          >
            <header className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <h3 id={`as-week-${k}`} className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                  {k}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{weekRanges[k]}</p>
              </div>
              {canWrite && (
                <Button variant="ghost" size="sm" className="ml-auto" aria-label="Tambah" onClick={() => setPicker(k)}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Tambah
                </Button>
              )}
            </header>
            <ul className="flex-1 p-3 space-y-2">
              {weeks === null && <li className="text-xs text-slate-400 animate-pulse">Memuat…</li>}
              {weeks !== null && current[k].length === 0 && (
                <li className="text-xs text-slate-400 dark:text-slate-500 px-1 py-2">Belum ada item.</li>
              )}
              {weeks !== null &&
                current[k].map((item) => {
                  const isBrand = item.type === 'brand';
                  const brandOutlets = isBrand ? outletsByBrand.get(item.brand) || [] : [];
                  const sub = isBrand
                    ? `${brandOutlets.length} outlet ikut`
                    : outletSub(outletByUuid.get(item.uuid));
                  const isOpen = expanded.has(item.id);
                  const eyebrow = isBrand
                    ? 'Brand'
                    : item.brand && item.brand !== '-'
                      ? `Outlet · ${item.brand}`
                      : 'Outlet';
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2">
                      <span
                        aria-hidden="true"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600/10 text-brand-700 dark:text-brand-300 text-xs font-bold"
                      >
                        {(isBrand ? item.brand : item.brand || '-').slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
                            {eyebrow}
                          </p>
                          {isBrand && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Daftar outlet ${item.brand}`}
                              aria-expanded={isOpen}
                              aria-controls={`as-outlets-${item.id}`}
                              onClick={() => toggleExpand(item.id)}
                              className="h-6 w-6 shrink-0"
                            >
                              <svg
                                className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                              </svg>
                            </Button>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={itemLabel(item)}>
                          {itemLabel(item)}
                        </p>
                        {sub && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{sub}</p>
                        )}
                      </div>
                      {canWrite && (
                        <>
                          <select
                            aria-label={`Pindah minggu ${itemLabel(item)}`}
                            value={k}
                            onChange={(e) => handleMove(k, item, e.target.value)}
                            className="min-h-[44px] text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                          >
                            {weekKeys.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Hapus ${itemLabel(item)}`}
                            onClick={() => handleRemove(k, item)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916"
                              />
                            </svg>
                          </Button>
                        </>
                      )}
                      {isBrand && isOpen && (
                        <ul
                          id={`as-outlets-${item.id}`}
                          className="w-full basis-full mt-1 ml-9 max-h-40 overflow-y-auto space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2"
                        >
                          {brandOutlets.length === 0 && (
                            <li className="text-xs text-slate-400 dark:text-slate-500">
                              Tidak ada outlet terdaftar untuk brand ini.
                            </li>
                          )}
                          {brandOutlets.map((o) => (
                            <li key={o.uuid} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                                {o.deptChannelName}
                              </span>
                              {o.city && (
                                <span className="shrink-0 text-slate-400 dark:text-slate-500">{o.city}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </Reveal>

      <AuditScheduleDrawer
        open={picker !== null}
        monthKey={monthKey}
        weekKey={picker || 'W1'}
        outlets={outlets}
        scheduled={scheduled}
        onClose={() => setPicker(null)}
        onSave={handleSave}
      />
    </>
  );
}
