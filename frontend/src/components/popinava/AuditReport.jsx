// Tab "Laporan Audit" di halaman POPI NAVA: ringkasan + daftar toko per
// minggu/brand untuk bulan aktif, memakai jadwal audit yang sudah diisi.
// Status "Sudah audit" = dicentang manual atau foto LOCAL+WEB lengkap.
// Bulan dibagi dengan tab Jadwal Audit lewat props monthKey/onMonthChange.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Reveal } from '../Reveal.jsx';
import { Button } from '../ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  emptyWeeks,
  formatMonthLabel,
  formatWeekRange,
  getSchedule,
  monthKeyOf,
  monthWeeks,
  shiftMonthKey,
} from '../../lib/auditSchedule.js';
import { buildAuditReport, buildAuditReportHtml } from '../../lib/auditReport.js';
import { listShotsByOutlet } from '../../lib/api.js';

function parseMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function statusBadge(audited) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
        audited
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30'
      }`}
    >
      {audited ? 'Sudah audit' : 'Belum audit'}
    </span>
  );
}

export default function AuditReport({ monthKey, onMonthChange, outlets }) {
  const { notify } = useToast();
  const [weeks, setWeeks] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [shotsComplete, setShotsComplete] = useState({});

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

  const outletsByBrand = useMemo(() => {
    const m = new Map();
    for (const o of outlets) {
      const b = o.brandName || '-';
      if (!m.has(b)) m.set(b, []);
      m.get(b).push(o);
    }
    return m;
  }, [outlets]);

  useEffect(() => {
    if (!weeks) return undefined;
    const uuids = new Set();
    for (const k of Object.keys(weeks)) {
      for (const it of weeks[k] || []) {
        if (!it) continue;
        if (it.type === 'brand') (outletsByBrand.get(it.brand) || []).forEach((o) => uuids.add(o.uuid));
        else if (it.uuid) uuids.add(it.uuid);
      }
    }
    if (!uuids.size) {
      setShotsComplete({});
      return undefined;
    }
    let alive = true;
    Promise.all(
      [...uuids].map(async (u) => {
        try {
          const rows = await listShotsByOutlet(u);
          const slots = new Set((rows || []).filter((r) => r.status === 'completed').map((r) => r.slot));
          return [u, slots.has('local') && slots.has('web')];
        } catch {
          return [u, false];
        }
      }),
    ).then((entries) => {
      if (alive) setShotsComplete(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [weeks, outletsByBrand]);

  const { year, month } = parseMonth(monthKey);
  const weekRanges = useMemo(() => {
    const ws = monthWeeks(year, month);
    return Object.fromEntries(ws.map((w) => [w.key, formatWeekRange(w)]));
  }, [year, month]);

  const report = useMemo(
    () => buildAuditReport(outlets, weeks || emptyWeeks(), shotsComplete),
    [outlets, weeks, shotsComplete],
  );

  const monthLabel = formatMonthLabel(monthKey);
  const thisMonth = monthKeyOf(new Date());

  function downloadHtml() {
    const html = buildAuditReportHtml({
      monthLabel,
      generatedAt: new Date().toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      report,
      weekRanges,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-audit-popinava-${monthKey}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Laporan HTML diunduh.', 'success');
  }

  const summary = [
    { label: 'Total toko', value: report.total, tone: 'text-slate-800 dark:text-slate-100' },
    { label: 'Sudah audit', value: report.audited, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Belum audit', value: report.pending, tone: 'text-rose-600 dark:text-rose-400' },
    { label: 'Progres', value: `${report.percent}%`, tone: 'text-brand-600 dark:text-brand-300' },
  ];

  return (
    <>
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Bulan sebelumnya"
              onClick={() => onMonthChange(shiftMonthKey(monthKey, -1))}
              className="rounded-none min-w-[44px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Button>
            <span className="px-3 min-h-[44px] inline-flex items-center text-sm font-bold text-slate-800 dark:text-slate-100 border-x border-slate-200 dark:border-slate-700">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Bulan berikutnya"
              onClick={() => onMonthChange(shiftMonthKey(monthKey, 1))}
              className="rounded-none min-w-[44px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={monthKey === thisMonth}
            onClick={() => onMonthChange(thisMonth)}
          >
            Hari ini
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={weeks === null || !!loadErr}>
              Cetak
            </Button>
            <Button variant="primary" size="sm" onClick={downloadHtml} disabled={weeks === null || !!loadErr}>
              Unduh HTML
            </Button>
          </div>
        </div>
      </Reveal>

      {weeks === null && !loadErr && (
        <div aria-busy="true" aria-label="Memuat laporan audit" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 animate-pulse">Memuat laporan…</p>
        </div>
      )}

      {loadErr && (
        <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-4 py-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-rose-700 dark:text-rose-400">
          Gagal memuat jadwal audit bulan ini.
          <Button variant="secondary" size="sm" onClick={load}>
            Coba lagi
          </Button>
        </div>
      )}

      {weeks !== null && !loadErr && report.weeks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-8 text-center">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Belum ada toko terjadwal bulan ini.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Isi jadwal di tab Jadwal Audit, lalu laporan ini terisi otomatis.
          </p>
        </div>
      )}

      {weeks !== null && !loadErr && report.weeks.length > 0 && (
        <>
          <Reveal className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {summary.map((s) => (
              <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className={`mt-1 text-2xl font-extrabold tabular-nums ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </Reveal>

          {report.weeks.map((w) => {
            const weekAudited = w.groups.reduce((n, g) => n + g.rows.filter((r) => r.audited).length, 0);
            const weekTotal = w.groups.reduce((n, g) => n + g.rows.length, 0);
            return (
              <Reveal
                key={w.key}
                role="region"
                aria-label={`${w.key} ${weekRanges[w.key] || ''}`.trim()}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{w.key}</h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{weekRanges[w.key]}</span>
                  <span className="ml-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {weekAudited}/{weekTotal} sudah audit
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 text-left font-bold">Toko</th>
                        <th scope="col" className="px-4 py-2.5 text-left font-bold">Custcode</th>
                        <th scope="col" className="px-4 py-2.5 text-left font-bold">Kota</th>
                        <th scope="col" className="px-4 py-2.5 text-left font-bold">Status</th>
                      </tr>
                    </thead>
                    {w.groups.map((g) => (
                      <tbody key={`${w.key}-${g.brand}`} className="divide-y divide-slate-100 dark:divide-slate-800">
                        <tr className="bg-brand-50/60 dark:bg-brand-500/10">
                          <th scope="colgroup" colSpan={4} className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                            {g.brand}
                            <span className="ml-2 font-semibold normal-case tracking-normal text-slate-500 dark:text-slate-400">{g.rows.length} toko</span>
                          </th>
                        </tr>
                        {g.rows.map((r) => (
                          <tr key={r.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                            <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{r.name}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.custcode}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.city}</td>
                            <td className="px-4 py-2.5">{statusBadge(r.audited)}</td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </div>
              </Reveal>
            );
          })}

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Status &quot;Sudah audit&quot; = dicentang manual atau foto LOCAL &amp; WEB lengkap. Cakupan: toko yang masuk jadwal bulan ini.
          </p>
        </>
      )}
    </>
  );
}
