// Drawer "Detail jadwal" untuk Jadwal Audit POPI NAVA. Read-only: seluruh
// field master unit terjadwal (brand atau outlet) + minggu tujuan. Pindah
// tetap lewat drag, hapus lewat tombol di kartu. Pola UI mengikuti
// AuditScheduleDrawer: panel kanan, Escape menutup, fokus awal ke tutup.
import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button.jsx';
import { ScrollArea } from '../ui/ScrollArea.jsx';

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const active = String(status || '').toLowerCase() === 'active';
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
        active
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
          : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
      }`}
    >
      {status || '-'}
    </span>
  );
}

function OutletRow({ o }) {
  return (
    <li className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 space-y-1">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{o.deptChannelName}</span>
        <StatusBadge status={o.status} />
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{[o.rvtCustcode, o.deptCode, o.deptName].filter(Boolean).join(' · ')}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{[o.isoCode, o.city, o.province, o.postcode, o.region].filter(Boolean).join(' · ')}</p>
    </li>
  );
}

export default function AuditScheduleDetail({ open, item, weekLabel, outlet, outlets, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => closeRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open || !item) return null;

  const isBrand = item.type === 'brand';
  const title = isBrand ? item.brand : item.name;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detail jadwal audit"
        className="relative w-full max-w-lg h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col animate-fade-in-fast"
      >
        <header className="bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] px-5 py-4 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white">Jadwal audit</p>
              <h2 className="font-bold truncate">{title}</h2>
              <p className="text-[11px] text-white/80">{weekLabel}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Tutup detail"
              ref={closeRef}
              className="shrink-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15 focus-visible:ring-white/70"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </header>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-5">
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Jadwal</p>
              <div className="mt-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 divide-y divide-slate-100 dark:divide-slate-800">
                <Field label="Status audit" value={item.audited ? 'Sudah audit' : 'Belum audit'} />
                <Field label="Jenis" value={isBrand ? 'Brand (seluruh outlet)' : 'Outlet'} />
              </div>
            </section>

            {isBrand ? (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Outlet yang diaudit ({outlets.length})
                </p>
                <ul className="mt-1.5 space-y-2">
                  {outlets.map((o) => (
                    <OutletRow key={o.uuid} o={o} />
                  ))}
                </ul>
              </section>
            ) : (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Outlet</p>
                <div className="mt-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 divide-y divide-slate-100 dark:divide-slate-800">
                  <Field label="Brand" value={outlet?.brandName || item.brand} />
                  <Field label="Custcode" value={outlet?.rvtCustcode} />
                  <Field label="Dept code" value={outlet?.deptCode} />
                  <Field label="Dept name" value={outlet?.deptName} />
                  <Field label="ISO" value={outlet?.isoCode} />
                  <Field label="Kota" value={outlet?.city} />
                  <Field label="Provinsi" value={outlet?.province} />
                  <Field label="Kode pos" value={outlet?.postcode} />
                  <Field label="Region" value={outlet?.region} />
                  <div className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Status</span>
                    <StatusBadge status={outlet?.status} />
                  </div>
                </div>
              </section>
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-2">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full">
            Tutup
          </Button>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">Pindah lewat drag · hapus lewat tombol di kartu.</p>
        </div>
      </div>
    </div>
  );
}
