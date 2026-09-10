import { useEffect, useMemo, useState } from 'react';
import { getLogs } from '../lib/api.js';
import { readLocalActivity } from '../lib/activity.js';

const CATS = ['Semua', 'Penambahan', 'Validasi', 'Invoice', 'Pengguna', 'Konfigurasi', 'Sinkron', 'Lainnya'];

const CAT_BADGE = {
  Penambahan: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  Validasi: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  Invoice: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
  Pengguna: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
  Konfigurasi: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20',
  Sinkron: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  Lainnya: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

function categorize(text) {
  const t = String(text || '').toLowerCase();
  if (/pengguna|role|izin|akun|password/.test(t)) return 'Pengguna';
  if (/invoice|paid/.test(t)) return 'Invoice';
  if (/validasi|audit|dicek/.test(t)) return 'Validasi';
  if (/status validasi baru|status invoice baru|master|konfigurasi/.test(t)) return 'Konfigurasi';
  if (/menambah|baru|membuat/.test(t)) return 'Penambahan';
  if (/sync|cron|sheet|unggah|impor/.test(t)) return 'Sinkron';
  return 'Lainnya';
}

// Kategori terstruktur dari backend diutamakan; fallback tebak dari teks
const entryCat = (e) => (e.category && CATS.includes(e.category) ? e.category : categorize(e.text));

// Entri lokal yang sudah tersimpan di server (tulisan ganda frontend+backend)
// disembunyikan: cocok who+teks dalam selisih 5 menit
function dedupe(local, remote) {
  return local.filter(
    (l) => !remote.some((r) => r.who === l.who && r.text === l.text && Math.abs(new Date(r.time) - new Date(l.time)) < 5 * 60 * 1000)
  );
}

function fmtTime(t) {
  const d = new Date(t);
  if (isNaN(d)) return String(t || '—');
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const initials = (name) =>
  String(name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// bare=true: ditempel sebagai tab di Pengaturan (tanpa padding halaman sendiri)
export default function LogsPage({ bare = false }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Semua');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  useEffect(() => {
    let ignore = false;
    const local = readLocalActivity().map((e) => ({
      id: `local-${e.id}`,
      time: e.time,
      who: e.who,
      action: e.action,
      detail: e.detail || null,
      category: e.category || null,
      text: e.detail ? `${e.action} — ${e.detail}` : e.action,
    }));
    getLogs()
      .then((r) => {
        if (ignore) return;
        const remote = Array.isArray(r)
          ? r.map((e, i) => ({
              id: `srv-${e.id || i}`,
              time: e.created_at || e.time,
              who: e.who,
              action: e.action || e.act,
              detail: e.detail || null,
              category: e.category || null,
              text: e.detail ? `${e.action || e.act} — ${e.detail}` : (e.action || e.act),
            }))
          : [];
        const merged = [...dedupe(local, remote), ...remote]
          .filter((e) => e.text)
          .sort((a, b) => new Date(b.time) - new Date(a.time));
        setLogs(merged.length ? merged : local);
      })
      .catch(() => {
        if (!ignore) setLogs(local);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, cat, perPage]);

  const counts = useMemo(() => {
    const m = { Semua: logs.length };
    logs.forEach((e) => {
      const c = entryCat(e);
      m[c] = (m[c] || 0) + 1;
    });
    return m;
  }, [logs]);

  const items = useMemo(
    () =>
      logs.filter(
        (e) =>
          (cat === 'Semua' || entryCat(e) === cat) &&
          `${e.who} ${e.text}`.toLowerCase().includes(q.toLowerCase())
      ),
    [logs, q, cat]
  );

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = items.slice((safePage - 1) * perPage, safePage * perPage);
  const pageNums = (() => {
    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  })();

  function exportData() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['WAKTU', 'PELAKU', 'KATEGORI', 'AKTIVITAS'].join(','),
      ...items.map((e) => [fmtTime(e.time), e.who, categorize(e.text), e.text].map(esc).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'logs-aktivitas.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={bare ? 'space-y-5' : 'w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5'}>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 -mt-1">
        <button
          onClick={exportData}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export
        </button>
      </div>

      {/* Filter kategori */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">Kategori:</span>
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
              cat === c
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {c}
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${cat === c ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
              {counts[c] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Daftar log */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <h3 className="font-bold text-slate-900 dark:text-white">Riwayat Aktivitas</h3>
          <span className="text-xs text-slate-400">{loading ? 'Memuat…' : `${items.length} aktivitas`}</span>
          <div className="ml-auto relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Cari pelaku / aktivitas..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/70">
                <th className="px-6 py-3 font-semibold">Waktu</th>
                <th className="px-4 py-3 font-semibold">Pelaku</th>
                <th className="px-4 py-3 font-semibold">Kategori</th>
                <th className="px-6 py-3 font-semibold">Aktivitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paged.map((e) => {
                const c = entryCat(e);
                return (
                  <tr key={e.id} className="even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs tabular-nums">{fmtTime(e.time)}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-[10px] font-bold">
                          {initials(e.who)}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{e.who}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] font-bold border rounded-full px-2.5 py-1 ${CAT_BADGE[c]}`}>
                        {c}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600 dark:text-slate-300">{e.text}</td>
                  </tr>
                );
              })}
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Belum ada aktivitas tercatat — ubah status di Billing / Finance, atau tambah kasus baru.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs text-slate-400 bg-slate-50/60 dark:bg-slate-800/40">
          <span>
            Menampilkan {items.length === 0 ? 0 : (safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, items.length)} dari {items.length} aktivitas
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              ‹
            </button>
            {pageNums.map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`min-w-[32px] px-2 py-1.5 rounded-lg border font-bold transition ${
                  n === safePage ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              ›
            </button>
          </div>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-200"
          >
            <option value={10}>10 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
          </select>
        </div>
      </div>
    </div>
  );
}
