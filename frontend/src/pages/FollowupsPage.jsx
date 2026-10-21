// Halaman Client Follow-Up Reminder (fase 1 frontend-only, PRD terlampir).
// Design Read: halaman data operasional internal untuk tim support, bahasa
// visual data-dense brand Revota, dial ENERGY 2 / RHYTHM 2 / MOTION 2, radius
// rounded-2xl (halaman kecil, DESIGN.md).
// Alasan (R-31): hero gradien indigo→ungu = identitas brand (R-01); kartu
// ringkasan identik karena metrik setara (R-14, motif kartu metrik DESIGN.md);
// merah/capsule hanya status fungsional overdue (R-09); satu Reveal per
// grup (R-19); baris tabel untuk baca — ketuk membuka modal detail, aksi
// terpusat di modal (satu titik aksi, R-31).
// TODO(backend): sambungkan useFollowups ke /api/followups saat backend jadi.
import { useEffect, useMemo, useState } from 'react';
import { Reveal } from '../components/Reveal.jsx';
import { useFollowups, isOverdue, isDueToday, overdueDays, todayStr } from '../hooks/useFollowups.js';
import { useClientBrands } from '../hooks/useClientBrands.js';
import { Button } from '../components/ui/Button.jsx';
import { useToast } from '../context/ToastContext.jsx';
import FollowupFormModal from '../components/followups/FollowupFormModal.jsx';
import FollowupDetailModal from '../components/followups/FollowupDetailModal.jsx';
import { buildFollowupsCsv, followupsCsvFilename } from '../lib/followupsExport.js';
import { getUsers } from '../lib/api.js';

const LABEL_CLS = 'text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400';

const FILTER_CLS =
  'min-h-[44px] text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 transition';

const STATUS_PILL = {
  Open: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  'Perlu Pengecekan': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  'Menunggu Client': 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20',
  Selesai: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
};

const STATUS_FILTERS = ['Open', 'Perlu Pengecekan', 'Menunggu Client', 'Selesai', 'Overdue'];

// Urutan default PRD §8: overdue dulu, lalu follow-up terdekat.
function byFollowup(a, b) {
  return String(a.followupDate).localeCompare(String(b.followupDate));
}

export default function FollowupsPage() {
  const { notify } = useToast();
  const { ready, items, summary, createFollowup, updateFollowup, removeFollowup, addNote, seedExamples } = useFollowups();
  const { statuses: clientStatuses, serverOk: clientsServerOk } = useClientBrands();

  const [fClient, setFClient] = useState('');
  const [fModule, setFModule] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [formOpen, setFormOpen] = useState(null); // null | 'new' | item
  const [detailId, setDetailId] = useState(null);
  const [picOptions, setPicOptions] = useState([]);

  // PIC diambil dari daftar user backend (opsional: gagal tanggung = kosong).
  useEffect(() => {
    let ignore = false;
    getUsers()
      .then((r) => {
        if (!ignore && Array.isArray(r)) {
          const names = r
            .filter((u) => u?.active !== false)
            .map((u) => u.name || u.email)
            .filter(Boolean);
          setPicOptions([...new Set(names)]);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const clients = useMemo(
    // Daftar client terdaftar = brand dari halaman Client & Brand (data existing).
    () => [...new Set(clientStatuses.map((s) => s.brand).filter(Boolean))],
    [clientStatuses]
  );

  const today = todayStr();
  const moduleHints = useMemo(
    () => [...new Set(items.map((r) => r.module).filter(Boolean))],
    [items]
  );
  const clientHints = useMemo(
    // Gabungan brand terdaftar + client yang pernah dipakai di issue.
    () => [...new Set([...clients, ...items.map((r) => r.client).filter(Boolean)])],
    [clients, items]
  );

  const filtered = useMemo(
    () =>
      items
        .filter((r) => {
          if (fClient && r.client !== fClient) return false;
          if (fModule && r.module !== fModule) return false;
          if (fStatus === 'Overdue') return isOverdue(r, today);
          if (fStatus && r.status !== fStatus) return false;
          return true;
        })
        .slice()
        .sort((a, b) => Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || byFollowup(a, b)),
    [items, fClient, fModule, fStatus, today]
  );

  const detailItem = detailId ? items.find((r) => r.id === detailId) || null : null;

  // Escape menutup modal form/detail (R-32).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setFormOpen(null);
        setDetailId(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function openCsv() {
    try {
      const csv = buildFollowupsCsv(filtered, (r) => isOverdue(r, today));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = followupsCsvFilename();
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      notify('Ekspor CSV gagal.', 'error');
    }
  }

  async function saveForm(form, editing) {
    try {
      if (editing) {
        await updateFollowup(form.id, form);
        notify(`Issue "${form.title}" diperbarui.`, 'success');
      } else {
        await createFollowup(form);
        notify(`Issue "${form.title}" dicatat (mock, backend menyusul).`, 'success');
      }
      setFormOpen(null);
    } catch (e) {
      notify(e?.message || 'Gagal menyimpan, coba lagi.', 'error');
    }
  }

  async function doDelete(item) {
    try {
      await removeFollowup(item.id);
      setDetailId(null);
      notify(`Issue "${item.title}" dihapus.`, 'info');
    } catch (e) {
      notify(e?.message || 'Gagal menghapus, coba lagi.', 'error');
    }
  }

  const stats = [
    ['Total issue', summary.total, false],
    ['Overdue', summary.overdue, summary.overdue > 0],
    ['Jatuh tempo hari ini', summary.dueToday, false],
    ['Selesai', summary.done, false],
  ];

  function OverdueBadge({ r }) {
    if (!isOverdue(r, today)) return null;
    const d = overdueDays(r, today);
    return (
      <span className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
        Overdue {d} hari
      </span>
    );
  }

  return (
    <div className="page">
      {!ready && (
        <div aria-busy="true" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 animate-pulse">Memuat data follow-up…</p>
        </div>
      )}

      {/* Hero: identitas brand + ringkasan (satu focal point halaman) */}
      <Reveal className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#4a4fe9] to-[#7c3aed] p-5 sm:p-6 text-white">
        <div className="relative flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white">Client Follow-Up Reminder</p>
            <h1 className="mt-1 text-lg sm:text-xl font-bold leading-tight">Jangan sampai issue client terlupa</h1>
            <p className="mt-1 text-xs text-white/90">Issue yang perlu diecek ulang lalu di-follow up sesuai jatuh tempo.</p>
          </div>
          <dl className="flex flex-wrap gap-2 sm:gap-3">
            {stats.map(([label, val, warn]) => (
              <div key={label} className="rounded-xl bg-white/15 px-4 py-2.5 text-center">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-white">{label}</dt>
                <dd className={`text-xl font-bold ${warn ? 'text-rose-100' : ''}`}>{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>

      {/* Filter + aksi */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="md:w-52">
            <label htmlFor="fu-f-client" className={LABEL_CLS}>Client</label>
            <select id="fu-f-client" value={fClient} onChange={(e) => setFClient(e.target.value)} className={`${FILTER_CLS} mt-1.5 w-full`}>
              <option value="">Semua client</option>
              {clientHints.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:w-44">
            <label htmlFor="fu-f-module" className={LABEL_CLS}>Modul</label>
            <select id="fu-f-module" value={fModule} onChange={(e) => setFModule(e.target.value)} className={`${FILTER_CLS} mt-1.5 w-full`}>
              <option value="">Semua modul</option>
              {moduleHints.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="md:w-48">
            <label htmlFor="fu-f-status" className={LABEL_CLS}>Status</label>
            <select id="fu-f-status" value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={`${FILTER_CLS} mt-1.5 w-full`}>
              <option value="">Semua status</option>
              {STATUS_FILTERS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2 md:ml-auto">
            <Button variant="secondary" onClick={openCsv}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Ekspor CSV
            </Button>
            <Button variant="primary" onClick={() => setFormOpen('new')} className="active:scale-[.98]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah Issue
            </Button>
          </div>
        </div>
      </Reveal>

      {/* Daftar issue: tabel (desktop) / kartu (mobile) */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {items.length === 0 ? 'Belum ada issue tercatat.' : 'Tidak ada issue cocok dengan filter.'}
            </p>
            {items.length === 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => seedExamples().then(() => notify('Contoh data follow-up dimasukkan.', 'success'))}
                className="mt-3 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10"
              >
                Isi contoh data
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop: tabel scrollable horizontal bila kolom sempit (R-03) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {['Client', 'Tgl issue', 'Modul', 'Issue', 'Prioritas', 'Status', 'Follow-up'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((r) => {
                    const ovd = isOverdue(r, today);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setDetailId(r.id)}
                        className={`cursor-pointer text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60 ${ovd ? 'hover:bg-rose-50/60 dark:hover:bg-rose-500/5' : ''}`}
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setDetailId(r.id))}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{r.client}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{r.issueDate}</td>
                        <td className="px-4 py-3">{r.module}</td>
                        <td className="px-4 py-3 max-w-[240px]">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-100" title={r.title}>{r.title}</span>
                        </td>
                        <td className="px-4 py-3">{r.priority}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block whitespace-nowrap text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_PILL[r.status] || ''}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap ${ovd ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                          <span className={ovd ? 'font-bold' : ''}>{r.followupDate}</span>
                          {ovd && <span className="block text-[10px] font-bold">Overdue {overdueDays(r, today)} hari</span>}
                          {isDueToday(r, today) && <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400">Jatuh tempo hari ini</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: daftar kartu ringkas (R-03) */}
            <ul className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((r) => {
                const ovd = isOverdue(r, today);
                return (
                  <li key={r.id}>
                    {/* eslint-disable-next-line react/forbid-elements -- baris drill-in kartu mobile, sama pola dengan RowButton ClientBrandPage */}
                    <button
                      onClick={() => setDetailId(r.id)}
                      className="w-full min-h-[44px] flex flex-col gap-1.5 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{r.client}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{r.module}</span>
                      </span>
                      <span className={`text-sm font-semibold truncate ${ovd ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>{r.title}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border ${STATUS_PILL[r.status] || ''}`}>{r.status}</span>
                        <OverdueBadge r={r} />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Follow-up {r.followupDate}
                          {isDueToday(r, today) && <span className="font-bold text-amber-600 dark:text-amber-400"> · hari ini</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Reveal>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Mode mock: data tersimpan di browser ini{clientsServerOk === false ? ', daftar client dari mode offline Client & Brand' : ''}. Backend follow-up disambungkan nanti tanpa mengubah tampilan.
      </p>

      {formOpen && (
        <FollowupFormModal
          item={formOpen === 'new' ? null : formOpen}
          clients={clientHints}
          picOptions={picOptions}
          moduleHints={moduleHints}
          onClose={() => setFormOpen(null)}
          onSave={saveForm}
        />
      )}

      <FollowupDetailModal
        item={detailItem}
        onClose={() => setDetailId(null)}
        onEdit={() => {
          setFormOpen(detailItem);
          setDetailId(null);
        }}
        onDelete={() => doDelete(detailItem)}
        onAddNote={(text) => addNote(detailItem.id, text)}
      />
    </div>
  );
}
