// Tab "Jadwal Audit" di halaman POPI NAVA: kartu minggu kalender per bulan
// (W1 mulai Senin pertama, Senin penentu bulan, 4-5 minggu) + penetapan
// brand/outlet per minggu. Pindah minggu lewat drag & drop antar kolom
// (desktop, mouse) dengan label minggu statis di kartu; tanpa select.
// Penyimpanan lewat lib/auditSchedule (server /api/audit-schedule dulu,
// localStorage fallback); badge status sinkron di header menandai
// Tersinkron (plus pengubah & waktu) / Tersimpan lokal / Menyinkronkan….
// Sengaja tanpa indikator slot: bebas berapa item per minggu (keputusan owner).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Reveal } from '../Reveal.jsx';
import { Button } from '../ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirm } from '../ui/ConfirmProvider.jsx';
import AuditScheduleDrawer from './AuditScheduleDrawer.jsx';
import AuditScheduleDetail from './AuditScheduleDetail.jsx';
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

const STAMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// "2 Okt 14:32" (waktu lokal) dari ISO backend; kosong bila tak valid.
function formatStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${STAMP_MONTHS[d.getMonth()]} ${hh}:${mm}`;
}

// Teks badge sinkron: status + (bila ada) pengubah & waktu terakhir.
function syncBadgeText(sync) {
  if (sync.status === 'saving') return 'Menyinkronkan…';
  if (sync.status === 'local') return 'Tersimpan lokal · belum terkirim';
  const parts = ['Tersinkron'];
  if (sync.updatedBy) parts.push(sync.updatedBy);
  const stamp = formatStamp(sync.updatedAt);
  if (stamp) parts.push(stamp);
  return parts.join(' · ');
}

export default function AuditSchedule({ outlets, canWrite }) {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(new Date()));
  const [weeks, setWeeks] = useState(null); // null = masih memuat
  const [loadErr, setLoadErr] = useState(false);
  const [picker, setPicker] = useState(null); // minggu tujuan drawer, null = tertutup
  const [expanded, setExpanded] = useState(() => new Set()); // id item brand yang daftar outletnya terbuka
  const [drag, setDrag] = useState(null); // {id, from} kartu yang sedang di-drag
  const [over, setOver] = useState(null); // weekKey kolom yang jadi tujuan highlight
  const [sync, setSync] = useState(null); // {status: saving|synced|local, updatedBy, updatedAt}; null = belum dimuat
  const [detail, setDetail] = useState(null); // {item, weekKey} kartu yang dibuka di drawer detail

  const load = useCallback(async () => {
    setWeeks(null);
    setLoadErr(false);
    try {
      const s = await getSchedule(monthKey);
      setWeeks(s.weeks);
      setSync({
        status: s.source === 'server' ? 'synced' : 'local',
        updatedBy: s.updatedBy,
        updatedAt: s.updatedAt,
      });
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

  // Buka drawer detail (read-only). Klik kartu atau Enter/Space saat kartu
  // terfokus; drag tidak memicu klik, jadi kartu tetap aman di-drag.
  function openDetail(weekKey, item) {
    setDetail({ item, weekKey });
  }

  function outletSub(o) {
    if (!o) return '';
    return [o.rvtCustcode, o.city].filter(Boolean).join(' · ');
  }

  async function persist(nextWeeks) {
    setSync((prev) => ({ status: 'saving', updatedBy: prev?.updatedBy ?? null, updatedAt: prev?.updatedAt ?? null }));
    const r = await saveSchedule(monthKey, nextWeeks);
    setWeeks(nextWeeks);
    setSync({ status: r.synced ? 'synced' : 'local', updatedBy: r.updatedBy, updatedAt: r.updatedAt });
    if (!r.synced) {
      notify('Gagal kirim ke server. Perubahan tersimpan lokal, belum terkirim.', 'warning');
    }
    return r;
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

  // Toggle tanda "sudah audit" di kartu. Item tersimpan dengan audited:true
  // (kembali lewat PUT yang sama; data lama tanpa field = belum audit).
  async function handleToggleAudit(weekKey, item) {
    const next = {
      ...current,
      [weekKey]: current[weekKey].map((x) => (x.id === item.id ? { ...x, audited: !x.audited } : x)),
    };
    await persist(next);
    notify(item.audited ? `Tanda "${itemLabel(item)}" dibatalkan.` : `"${itemLabel(item)}" ditandai sudah audit.`, 'success');
  }

  // Drag & drop antar kolom (HTML5, desktop mouse). Logika pindah memakai
  // handleMove yang sama dengan select lama; dataTransfer membawa {id, from}.
  function onItemDragStart(e, weekKey, item) {
    e.dataTransfer?.setData?.('text/plain', JSON.stringify({ id: item.id, from: weekKey }));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    setDrag({ id: item.id, from: weekKey });
    setOver(null);
  }

  function onItemDragEnd() {
    setDrag(null);
    setOver(null);
  }

  function onWeekDragOver(e, weekKey) {
    if (!canWrite) return;
    e.preventDefault(); // wajib agar drop diperbolehkan browser
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (drag) setOver(weekKey);
  }

  function onWeekDragLeave(e, weekKey) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setOver((cur) => (cur === weekKey ? null : cur));
  }

  async function onWeekDrop(e, weekKey) {
    e.preventDefault();
    const raw = e.dataTransfer?.getData?.('text/plain') || '';
    setDrag(null);
    setOver(null);
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const item = (current[payload.from] || []).find((x) => x.id === payload.id);
    if (!item) return;
    await handleMove(payload.from, item, weekKey);
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
          <span className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Ikut minggu kalender Sen-Jum; Senin menentukan bulan minggu itu.</span>
            {sync && (
              <span
                aria-live="polite"
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  sync.status === 'synced'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
                    : sync.status === 'local'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'
                      : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 animate-pulse'
                }`}
              >
                {syncBadgeText(sync)}
              </span>
            )}
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
            onDragOver={canWrite ? (e) => onWeekDragOver(e, k) : undefined}
            onDragLeave={canWrite ? (e) => onWeekDragLeave(e, k) : undefined}
            onDrop={canWrite ? (e) => onWeekDrop(e, k) : undefined}
            className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm flex flex-col transition ${
              over === k
                ? 'border-brand-500 ring-2 ring-brand-500/50'
                : 'border-slate-200 dark:border-slate-800'
            }`}
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
                    <li
                      key={item.id}
                      draggable={canWrite ? 'true' : 'false'}
                      onDragStart={canWrite ? (e) => onItemDragStart(e, k, item) : undefined}
                      onDragEnd={canWrite ? onItemDragEnd : undefined}
                      tabIndex={0}
                      aria-haspopup="dialog"
                      onClick={() => openDetail(k, item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDetail(k, item);
                        }
                      }}
                      className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2 transition hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
                        drag?.id === item.id ? 'opacity-50' : ''
                      } ${canWrite ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                    >
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
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(item.id);
                              }}
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
                      {item.audited && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30">
                          Sudah audit
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/30">
                        {k}
                      </span>
                      {canWrite && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={item.audited ? `Batalkan tanda ${itemLabel(item)} sudah audit` : `Tandai ${itemLabel(item)} sudah audit`}
                            aria-pressed={item.audited}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAudit(k, item);
                            }}
                            className={`h-6 w-6 shrink-0 ${
                              item.audited
                                ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                                : ''
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Hapus ${itemLabel(item)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemove(k, item);
                            }}
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

      <AuditScheduleDetail
        open={detail !== null}
        item={detail?.item || null}
        weekLabel={detail ? `${detail.weekKey} · ${weekRanges[detail.weekKey]}` : ''}
        outlet={detail && detail.item.type === 'outlet' ? outletByUuid.get(detail.item.uuid) : null}
        outlets={detail && detail.item.type === 'brand' ? outletsByBrand.get(detail.item.brand) || [] : []}
        onClose={() => setDetail(null)}
      />
    </>
  );
}
