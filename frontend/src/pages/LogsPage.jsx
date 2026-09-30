import { useEffect, useMemo, useState } from 'react';
import { Reveal } from '../components/Reveal.jsx';
import { Button } from '../components/ui/Button.jsx';
import { HistoryTracking } from '../components/ui/HistoryTracking.jsx';
import { getLogs } from '../lib/api.js';
import { readLocalActivity } from '../lib/activity.js';
import { useToast } from '../context/ToastContext.jsx';

const CATS = ['Semua', 'Penambahan', 'Validasi', 'Invoice', 'Pengguna', 'Konfigurasi', 'Sinkron', 'Lainnya'];

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

// bare=true: ditempel sebagai tab di Pengaturan (tanpa padding halaman sendiri)
export default function LogsPage({ bare = false }) {
  const { notify } = useToast();
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
    notify(`Export ${items.length} aktivitas berhasil diunduh.`, 'success');
  }

  return (
    <div className={bare ? 'space-y-5' : 'page'}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={exportData}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export
        </Button>
      </div>

      {/* Filter kategori */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mr-1">Kategori:</span>
        {CATS.map((c) => (
          /* eslint-disable-next-line react/forbid-elements -- pil kategori segmented kustom */
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 min-h-[44px] rounded-lg border transition ${
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
      </Reveal>

      {/* Daftar log */}
      <Reveal className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <h3 className="font-bold text-slate-900 dark:text-white">Riwayat Aktivitas</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">{loading ? 'Memuat…' : `${items.length} aktivitas`}</span>
          <div className="ml-auto relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Cari pelaku / aktivitas..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 pr-3 py-2 min-h-[44px] w-full sm:w-auto text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 max-h-[55vh] overflow-y-auto scrollbar-thin">
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse py-6 text-center">Memuat…</p>
          ) : paged.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              Belum ada aktivitas tercatat — ubah status di Billing / Finance, atau tambah kasus baru.
            </p>
          ) : (
            <HistoryTracking
              steps={paged.map((e) => ({
                id: e.id,
                name: e.text,
                timestamp: fmtTime(e.time),
                description: `oleh ${e.who} · ${entryCat(e)}`,
                isCompleted: true,
              }))}
            />
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-800/40">
          <span>
            Menampilkan {items.length === 0 ? 0 : (safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, items.length)} dari {items.length} aktivitas
          </span>
          <div className="flex items-center gap-1 ml-auto overflow-x-auto max-w-full scrollbar-thin">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Halaman sebelumnya"
              className="shrink-0 font-bold disabled:opacity-40"
            >
              ‹
            </Button>
            {pageNums.map((n) => (
              <Button
                key={n}
                variant={n === safePage ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setPage(n)}
                aria-current={n === safePage ? 'page' : undefined}
                className="shrink-0 font-bold"
              >
                {n}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Halaman berikutnya"
              className="shrink-0 font-bold disabled:opacity-40"
            >
              ›
            </Button>
          </div>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-200"
          >
            <option value={10}>10 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
          </select>
        </div>
      </Reveal>
    </div>
  );
}
