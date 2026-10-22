// Tab Report halaman Client Follow-Up (frontend-first: dihitung dari data
// `items`; backend /report menyusul bila dibutuhkan).
// Design Read: panel report data operasional internal tim support, bahasa
// visual data-dense brand Revota, dial ENERGY 2 / RHYTHM 2 / MOTION 2,
// radius rounded-2xl (DESIGN.md, halaman kecil).
// Alasan (R-31): satu kartu per pertanyaan pemilik (ringkasan, status, tren,
// client, modul, aging) = komposisi mengikuti konten, bukan grid seragam;
// indigo/ungu = brand, emerald/amber/rose hanya untuk status fungsional
// (R-01/R-09); label data 10px uppercase = gaya tabel padat halaman ini;
// mem klik bar/segmen/chip = drill-down ke tab Daftar dengan filter terpasang,
// jadi setiap kontrol hidup (R-26); semua angka dihitung dari items nyata,
// tanpa klaim (R-17); chip periode menautkan kartu ke tanggal issue,
// dinyatakan di caption agar tidak ambigu.
import { useMemo, useState } from 'react';
import { Reveal } from '../Reveal.jsx';
import { STATUSES, isOverdue, overdueDays } from '../../hooks/useFollowups.js';

/* eslint-disable react/forbid-elements -- chip segmen/bar drill-down dengan state aktif kustom di .map(); Button tak punya variant aktif (className hanya layout, Button.jsx). */

const PERIODS = [
  ['7', '7 hari'],
  ['30', '30 hari'],
  ['90', '90 hari'],
  ['all', 'Semua'],
];

// Warna segmen status mengikuti makna STATUS_PILL halaman (fungsional, R-09).
const SEG = {
  Open: 'bg-rose-500',
  'Perlu Pengecekan': 'bg-amber-500',
  'Menunggu Client': 'bg-brand-500',
  Selesai: 'bg-emerald-500',
};

const AGING_BANDS = [
  ['1-7', '1 s.d. 7 hari', (d) => d >= 1 && d <= 7],
  ['8-14', '8 s.d. 14 hari', (d) => d >= 8 && d <= 14],
  ['15-30', '15 s.d. 30 hari', (d) => d >= 15 && d <= 30],
  ['31+', 'Lebih dari 30 hari', (d) => d > 30],
];

const CARD =
  'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm';

const LABEL_CLS =
  'text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400';

const BTN_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60';

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDmy(iso) {
  const [, m, d] = String(iso).split('-');
  return `${d}/${m}`;
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function dayDiff(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
}

const num = (n) => n.toLocaleString('id-ID');

export default function FollowupsReport({ items, today, ready, serverOk, onDrill }) {
  const [period, setPeriod] = useState('30');

  const cutoff = period === 'all' ? null : addDaysIso(today, -(Number(period) - 1));
  const sinceLabel = cutoff ? `Sejak ${fmtDmy(cutoff)} (berdasarkan tanggal issue)` : 'Semua data (berdasarkan tanggal issue)';

  // Basis periode: issue yang masuk pada rentang terpilih.
  const scoped = useMemo(
    () => (cutoff ? items.filter((r) => r.issueDate && r.issueDate >= cutoff) : items),
    [items, cutoff]
  );

  const stats = useMemo(() => {
    const done = scoped.filter((r) => r.status === 'Selesai');
    const overdue = scoped.filter((r) => isOverdue(r, today));
    const resolveDays = done
      .map((r) => dayDiff(r.issueDate, String(r.resolvedAt).slice(0, 10)))
      .filter((d) => d >= 0);
    const avg = resolveDays.length
      ? resolveDays.reduce((a, b) => a + b, 0) / resolveDays.length
      : null;
    return {
      total: scoped.length,
      done: done.length,
      overdue: overdue.length,
      avg,
      avgLabel: avg == null ? '-' : `${avg.toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari`,
    };
  }, [scoped, today]);

  const statusCounts = useMemo(() => {
    const m = new Map(STATUSES.map((s) => [s, 0]));
    for (const r of scoped) m.set(r.status, (m.get(r.status) || 0) + 1);
    return STATUSES.map((s) => ({ status: s, n: m.get(s) }));
  }, [scoped]);

  // Tren aktivitas: masuk (tanggal issue) vs selesai (resolved_at) per bucket.
  const trend = useMemo(() => {
    const t0 =
      cutoff ||
      [
        ...items.map((r) => r.issueDate).filter(Boolean),
        ...items.map((r) => String(r.resolvedAt || '').slice(0, 10)).filter(Boolean),
      ]
        .sort()
        .shift() ||
      today;
    const span = Math.max(0, dayDiff(t0, today));
    const width = Math.max(1, Math.ceil((span + 1) / 12));
    const buckets = [];
    for (let s = t0; s <= today; s = addDaysIso(s, width)) {
      const end = s === today ? today : addDaysIso(s, width - 1);
      buckets.push({
        start: s,
        end,
        label: fmtDmy(s),
        masuk: 0,
        selesai: 0,
      });
    }
    if (!buckets.length) return null;
    const last = buckets[buckets.length - 1];
    last.end = today;
    for (const r of items) {
      const issue = r.issueDate;
      const resolved = String(r.resolvedAt || '').slice(0, 10);
      const inPeriod = !cutoff || (issue && issue >= cutoff);
      if (inPeriod && issue) {
        const b = buckets.find((x) => issue >= x.start && issue <= x.end);
        if (b) b.masuk += 1;
      }
      if (resolved && inPeriod) {
        const b = buckets.find((x) => resolved >= x.start && resolved <= x.end);
        if (b) b.selesai += 1;
      }
    }
    if (buckets.length === 1) {
      buckets[0].label = `${fmtDmy(buckets[0].start)}-${fmtDmy(buckets[0].end)}`;
    }
    return buckets;
  }, [items, cutoff, today]);

  const trendMax = trend ? Math.max(1, ...trend.map((b) => Math.max(b.masuk, b.selesai))) : 1;

  function rankBy(field, limit) {
    const m = new Map();
    for (const r of scoped) {
      const k = r[field];
      if (!k) continue;
      if (!m.has(k)) m.set(k, { name: k, total: 0, overdue: 0 });
      const e = m.get(k);
      e.total += 1;
      if (isOverdue(r, today)) e.overdue += 1;
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, limit);
  }

  const byClient = useMemo(() => rankBy('client', 6), [scoped, today]);
  const byModule = useMemo(() => rankBy('module', 5), [scoped, today]);

  const overdueAging = useMemo(() => {
    const ovd = scoped.filter((r) => isOverdue(r, today));
    return AGING_BANDS.map(([key, label, inBand]) => ({
      key,
      label,
      n: ovd.filter((r) => inBand(overdueDays(r, today))).length,
    }));
  }, [scoped, today]);

  if (!ready) {
    return (
      <div aria-busy="true" className={`${CARD} p-6 text-center`}>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 animate-pulse">Memuat report…</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:gap-4">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {serverOk === false
          ? `Mode offline: report dihitung dari data browser ini. ${sinceLabel}.`
          : `Report follow-up · ${sinceLabel}.`}
      </p>

      {/* Ringkasan + pilihan periode (satu focal point: angka periode) */}
      <Reveal className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Ringkasan</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pilih periode">
            {PERIODS.map(([k, label]) => (
              <button
                key={k}
                aria-pressed={period === k}
                onClick={() => setPeriod(k)}
                className={`min-h-[36px] px-3.5 text-xs font-semibold rounded-full border transition ${BTN_FOCUS} ${
                  period === k
                    ? 'bg-brand-600 border-brand-600 text-white shadow-sm shadow-brand-600/25'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Issue dalam periode', num(stats.total), false],
            ['Selesai', num(stats.done), false],
            ['Overdue', num(stats.overdue), stats.overdue > 0],
            ['Rata-rata hari penyelesaian', stats.avgLabel, false],
          ].map(([label, val, warn]) => (
            <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-3.5 py-3">
              <p className={LABEL_CLS}>{label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${warn ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
                {val}
              </p>
            </div>
          ))}
        </div>
      </Reveal>

      {items.length === 0 ? (
        <Reveal className={`${CARD} px-5 py-10 text-center`}>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Belum ada data follow-up. Isi issue dulu di tab Daftar, lalu kembali ke sini.
          </p>
          <button
            onClick={() => onDrill({})}
            className={`mt-3 text-sm font-semibold text-brand-700 dark:text-brand-300 hover:underline ${BTN_FOCUS} rounded-lg px-2 py-1`}
          >
            Ke tab Daftar
          </button>
        </Reveal>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-3 sm:gap-4 items-start">
            {/* Sebaran status: klik segmen/chip = filter status di tab Daftar */}
            <Reveal className={`${CARD} p-4 sm:p-5`}>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Sebaran status</h2>
              {stats.total === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Tidak ada issue dalam periode ini.</p>
              ) : (
                <>
                  <div className="mt-4 flex h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                    {statusCounts.map(({ status, n }) => (
                      <span key={status} className={SEG[status]} style={{ width: `${(n / stats.total) * 100}%` }} title={`${status}: ${n}`} />
                    ))}
                  </div>
                  <ul className="mt-4 grid sm:grid-cols-2 gap-2">
                    {statusCounts.map(({ status, n }) => (
                      <li key={status}>
                        <button
                          onClick={() => onDrill({ status })}
                          className={`w-full min-h-[44px] flex items-center gap-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-700/60 ${BTN_FOCUS}`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SEG[status]}`} aria-hidden="true" />
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{status}</span>
                          <span className="ml-auto text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{num(n)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">Klik status untuk melihat issue-nya di tab Daftar.</p>
                </>
              )}
            </Reveal>

            {/* Aktivitas: bar masuk vs selesai; angka dari issue & resolved_at */}
            <Reveal className={`${CARD} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Aktivitas</h2>
                <p className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-500" aria-hidden="true" /> Masuk
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" /> Selesai
                  </span>
                </p>
              </div>
              {stats.total === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Tidak ada issue dalam periode ini.</p>
              ) : (
                <>
                  <div className="mt-4 flex items-end gap-1.5 sm:gap-2 h-28" role="img" aria-label="Grafik batang issue masuk dan selesai per periode">
                    {trend.map((b) => (
                      <div key={b.start} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 h-full">
                        <div className="flex-1 w-full flex items-end justify-center gap-[3px]" title={`${b.label}: ${b.masuk} masuk, ${b.selesai} selesai`}>
                          <span className="w-2 sm:w-2.5 rounded-t-md bg-brand-500" style={{ height: `${(b.masuk / trendMax) * 100}%` }} />
                          <span className="w-2 sm:w-2.5 rounded-t-md bg-emerald-500" style={{ height: `${(b.selesai / trendMax) * 100}%` }} />
                        </div>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{b.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                    Batang tinggi = lebih banyak issue; label bulan/tanggal = awal periode bucket.
                  </p>
                </>
              )}
            </Reveal>

            {/* Per client: bar indigo = issue, merah = bagian overdue; klik = filter */}
            <Reveal className={`${CARD} p-4 sm:p-5`}>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Per client</h2>
              {byClient.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Tidak ada issue dalam periode ini.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {byClient.map((c) => (
                    <li key={c.name}>
                      <button
                        onClick={() => onDrill({ client: c.name })}
                        className={`w-full min-h-[44px] px-1 py-1 rounded-lg text-left transition group ${BTN_FOCUS}`}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{c.name}</span>
                          <span className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100 shrink-0">
                            {num(c.total)}
                            {c.overdue > 0 && <span className="ml-1.5 font-semibold text-rose-600 dark:text-rose-400">· {num(c.overdue)} overdue</span>}
                          </span>
                        </span>
                        <span className="mt-1 flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                          <span className="bg-rose-400" style={{ width: `${(c.overdue / byClient[0].total) * 100}%` }} />
                          <span className="bg-brand-500" style={{ width: `${((c.total - c.overdue) / byClient[0].total) * 100}%` }} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>

            {/* Per modul + aging keterlambatan */}
            <Reveal className={`${CARD} p-4 sm:p-5`}>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Per modul</h2>
              {byModule.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Tidak ada issue dalam periode ini.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {byModule.map((m) => (
                    <li key={m.name}>
                      <button
                        onClick={() => onDrill({ module: m.name })}
                        className={`w-full min-h-[44px] px-1 py-1 rounded-lg text-left transition ${BTN_FOCUS}`}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{m.name}</span>
                          <span className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100 shrink-0">{num(m.total)}</span>
                        </span>
                        <span className="mt-1 flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                          <span className="bg-brand-400" style={{ width: `${(m.total / byModule[0].total) * 100}%` }} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {stats.overdue > 0 && (
                <>
                  <h3 className={`${LABEL_CLS} mt-5 pt-4 border-t border-slate-100 dark:border-slate-800`}>Keterlambatan follow-up</h3>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {overdueAging.map((b) =>
                      b.n > 0 ? (
                        <button
                          key={b.key}
                          onClick={() => onDrill({ status: 'Overdue' })}
                          className={`min-h-[44px] rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 px-2 py-2 text-center transition hover:bg-rose-100/70 dark:hover:bg-rose-500/20 ${BTN_FOCUS}`}
                        >
                          <span className="block text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">{num(b.n)}</span>
                          <span className="block text-[10px] font-semibold text-rose-700/80 dark:text-rose-300/80">{b.label}</span>
                        </button>
                      ) : (
                        <div key={b.key} className="min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-2 py-2 text-center">
                          <span className="block text-lg font-bold tabular-nums text-slate-300 dark:text-slate-600">0</span>
                          <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500">{b.label}</span>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
            </Reveal>
          </div>
        </>
      )}
    </div>
  );
}
