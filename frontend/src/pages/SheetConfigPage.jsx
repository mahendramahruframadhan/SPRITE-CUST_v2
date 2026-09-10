import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CONFIG } from '../data/sheetConfig.js';
import { getConfig, putConfig } from '../lib/api.js';

const LS_KEY = 'sheetConfig';

function loadCfg() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY));
    if (v && Array.isArray(v.brands)) return v;
  } catch (e) {
    /* abaikan */
  }
  return structuredClone(DEFAULT_CONFIG);
}

const ST_CHOICES = ['SUPPORT TYPE - A', 'SUPPORT TYPE - B', 'SUPPORT TYPE - C', 'SUPPORT MONTHLY'];
const ST_BADGE = {
  'SUPPORT TYPE - A': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'SUPPORT TYPE - B': 'bg-amber-50 text-amber-600 border-amber-200',
  'SUPPORT TYPE - C': 'bg-sky-50 text-sky-600 border-sky-200',
  'SUPPORT MONTHLY': 'bg-violet-50 text-violet-600 border-violet-200',
};

const TABS = [
  { id: 'pricelist', label: 'Pricelist', desc: 'Tarif (Rp) per billing category untuk tiap versi pricelist.', used: 'Form Kasus · Billing · Finance' },
  { id: 'brands', label: 'Brand Name', desc: 'Daftar semua brand/klien.', used: 'Form Kasus · filter semua halaman' },
  { id: 'bcmap', label: 'Billing Category', desc: 'Pasangan billing category → support type default (otomatis).', used: 'Form Kasus' },
  { id: 'module', label: 'Module & Sub-Module', desc: 'Daftar modul dan sub-modul sistem.', used: 'Form Kasus · Dashboard' },
  { id: 'support', label: 'Support Type & Kategori', desc: 'Tipe dan kategori support yang tersedia.', used: 'Form Kasus · Billing' },
  { id: 'status', label: 'Billing Status & Group KPI', desc: 'Status penagihan dan kelompok KPI HR Report.', used: 'Billing · HR Report' },
  { id: 'channel', label: 'Channel & Team', desc: 'Sumber tiket dan anggota tim support.', used: 'Form Kasus · HR Report · Dashboard' },
  { id: 'calendar', label: 'Kalender', desc: 'Referensi konversi tanggal — read-only dari sheet.', used: 'Sinkronisasi' },
  { id: 'headers', label: 'Header Mapping (Backend)', desc: 'Mapping kolom sheet master — TERKUNCI untuk backend.', used: 'Backend sync' },
  { id: 'ai', label: 'AI Assistant', desc: 'Sakelar fitur AI.', used: 'AI Assistant' },
];

// Default sakelar fitur AI — status aktif tersimpan di backend (app_config key 'agentConfig')
const DEFAULT_AGENTS = [
  { id: 'chatbot-cs', name: 'Chatbot CS', desc: 'Asisten chat otomatis untuk pertanyaan pelanggan', enabled: false },
  { id: 'auto-reply', name: 'Auto-Reply Tiket', desc: 'Balasan awal otomatis saat tiket masuk', enabled: false },
  { id: 'auto-summary', name: 'Ringkasan Kasus Otomatis', desc: 'Ringkas issue + completion notes per kasus', enabled: false },
];

const CFG_INPUT =
  'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-[3px] focus:ring-brand-500/25 focus:border-brand-400 transition';

export default function SheetConfigPage() {
  const [cfg, setCfg] = useState(loadCfg);
  const [agents, setAgents] = useState(DEFAULT_AGENTS);
  const [tab, setTab] = useState('pricelist');
  const [toast, setToast] = useState(null);
  const synced = useRef(false);
  const syncedAgents = useRef(false);

  // Ambil config dari backend (DB) sekali saat mount; lokal sebagai fallback instan
  useEffect(() => {
    let ignore = false;
    getConfig()
      .then((r) => {
        if (!ignore && r && r.config && Object.keys(r.config).length) setCfg(r.config);
      })
      .catch(() => {})
      .finally(() => {
        synced.current = true;
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    if (!synced.current) return;
    const t = setTimeout(() => {
      putConfig(cfg).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [cfg]);

  // Sakelar AI: ambil dari backend sekali, simpan debounce (pola sama seperti cfg)
  useEffect(() => {
    let ignore = false;
    getConfig('agentConfig')
      .then((r) => {
        if (!ignore && r && Array.isArray(r.config?.agents) && r.config.agents.length) {
          setAgents(r.config.agents);
        }
      })
      .catch(() => {})
      .finally(() => {
        syncedAgents.current = true;
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!syncedAgents.current) return;
    const t = setTimeout(() => {
      putConfig({ agents }, 'agentConfig').catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [agents]);

  function toggleAgent(id) {
    setAgents((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
      const hit = next.find((a) => a.id === id);
      setToast(`${hit.name} ${hit.enabled ? 'diaktifkan' : 'dinonaktifkan'}`);
      return next;
    });
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const save = (msg) => setToast(msg || 'Tersimpan otomatis');
  const patch = (fn, msg) => {
    setCfg((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    save(msg);
  };

  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];
  const heroStats = useMemo(() => ({
    brands: (cfg.brands || []).length,
    modules: (cfg.modules || []).length,
    prices: (cfg.pricelist || []).length,
  }), [cfg]);

  function exportJSON() {
    const payload = {
      meta: {
        source: 'https://docs.google.com/spreadsheets/d/1dJKS7iJ80iK2rV5Jd9D6ap3yATcaUOlj07IcJg74CuY/edit?gid=0',
        description: 'Master config Pusat Data Bantuan — struktur mengikuti tab konfigurasi Google Sheets',
        exportedAt: new Date().toISOString(),
      },
      config: cfg,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sheet-config.json';
    a.click();
    URL.revokeObjectURL(url);
    setToast('JSON config di-download untuk backend');
  }

  function resetConfig() {
    if (!confirm('Kembalikan SEMUA konfigurasi ke default (sesuai sheet)? Perubahan lokal akan hilang.')) return;
    setCfg(structuredClone(DEFAULT_CONFIG));
    setToast('Konfigurasi dikembalikan ke default sheet');
  }

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#4c1d95] via-[#7c3aed] to-[#a78bfa] text-white shadow-2xl shadow-violet-600/25 animate-fade-in-fast">
        <div aria-hidden="true" className="absolute inset-0 opacity-[.14]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div aria-hidden="true" className="absolute -right-24 -top-24 w-96 h-96 bg-white/15 rounded-full blur-3xl" />
        <div aria-hidden="true" className="absolute -left-16 -bottom-28 w-80 h-80 bg-fuchsia-300/20 rounded-full blur-3xl" />
        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] bg-white/15 border border-white/20 backdrop-blur rounded-full px-3 py-1">
                [ KONFIGURASI /// SHEET ]
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white/10 border border-white/15 rounded-full px-3 py-1">
                Autosave aktif
              </span>
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              Konfigurasi Sheet
            </h1>
            <p className="mt-2 text-sm text-white/75 max-w-xl leading-relaxed">
              {heroStats.brands} brand · {heroStats.modules} modul · {heroStats.prices} baris pricelist. Setiap perubahan tersimpan otomatis ke browser & backend.
            </p>
          </div>
          <div className="flex flex-wrap lg:flex-col gap-2.5 shrink-0">
            <button
              onClick={exportJSON}
              className="inline-flex items-center justify-center gap-2 bg-white text-violet-700 text-sm font-extrabold px-4 py-3 rounded-2xl shadow-lg hover:bg-violet-50 transition active:scale-[.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export JSON (Backend)
            </button>
            <button
              onClick={resetConfig}
              className="inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white/90 bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2.5 rounded-2xl transition active:scale-[.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Reset ke Default
            </button>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-2 animate-fade-in-fast" style={{ animationDelay: '.05s' }}>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Kategori konfigurasi">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                tab === t.id ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25' : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1 text-[11px]">
          <span className="font-extrabold text-slate-700 dark:text-slate-200">{activeTab.label}</span>
          <span className="text-slate-400">— {activeTab.desc}</span>
          <span className="font-semibold text-violet-600 dark:text-violet-400">Dipakai di: {activeTab.used}</span>
        </div>
      </div>

      {/* Content */}
      <div>
        {tab === 'pricelist' && <TabPricelist cfg={cfg} patch={patch} />}
        {tab === 'brands' && (
          <ListPanel
            title="BRAND NAME"
            desc="Daftar semua brand/klien (kolom BRAND NAME di sheet)"
            arr={cfg.brands}
            badge="bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/20"
            onAdd={(v) => patch((c) => void (c.brands.includes(v) ? null : (c.brands.push(v), c.brands.sort())), 'Ditambahkan: ' + v)}
            onDel={(i) => patch((c) => c.brands.splice(i, 1), 'Dihapus: ' + cfg.brands[i])}
          />
        )}
        {tab === 'bcmap' && <TabBcMap cfg={cfg} patch={patch} />}
        {tab === 'module' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ListPanel title="MODULE" desc="Daftar modul sistem (kolom MODULE di sheet)" arr={cfg.modules} badge="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20"
              onAdd={(v) => patch((c) => void (!c.modules.includes(v) && (c.modules.push(v), c.modules.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.modules.splice(i, 1), 'Dihapus: ' + cfg.modules[i])} />
            <ListPanel title="SUB-MODULE" desc="Daftar sub-modul (kolom SUB-MODULE di sheet)" arr={cfg.subModules}
              onAdd={(v) => patch((c) => void (!c.subModules.includes(v) && (c.subModules.push(v), c.subModules.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.subModules.splice(i, 1), 'Dihapus: ' + cfg.subModules[i])} />
          </div>
        )}
        {tab === 'support' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ListPanel title="SUPPORT TYPE" desc="Tipe support: TRAVICS!, SUPPORT TYPE - A/B/C, SUPPORT MONTHLY, X00–X13 (kolom SUPPORT TYPE di sheet)" arr={cfg.supportTypes} badge="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20"
              onAdd={(v) => patch((c) => void (!c.supportTypes.includes(v) && (c.supportTypes.push(v), c.supportTypes.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.supportTypes.splice(i, 1), 'Dihapus: ' + cfg.supportTypes[i])} />
            <ListPanel title="SUPPORT CATEGORY" desc="Kategori support (kolom SUPPORT CATEGORY di sheet)" arr={cfg.supportCategories} badge="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
              onAdd={(v) => patch((c) => void (!c.supportCategories.includes(v) && (c.supportCategories.push(v), c.supportCategories.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.supportCategories.splice(i, 1), 'Dihapus: ' + cfg.supportCategories[i])} />
          </div>
        )}
        {tab === 'status' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ListPanel title="BILLING STATUS" desc="Status penagihan (kolom BILLING STATUS di sheet)" arr={cfg.billingStatuses} badge="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
              onAdd={(v) => patch((c) => void (!c.billingStatuses.includes(v) && (c.billingStatuses.push(v), c.billingStatuses.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.billingStatuses.splice(i, 1), 'Dihapus: ' + cfg.billingStatuses[i])} />
            <ListPanel title="GROUP_KPI" desc="Kelompok KPI untuk HR Report (kolom GROUP_KPI di sheet)" arr={cfg.groupKpi} badge="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
              onAdd={(v) => patch((c) => void (!c.groupKpi.includes(v) && (c.groupKpi.push(v), c.groupKpi.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.groupKpi.splice(i, 1), 'Dihapus: ' + cfg.groupKpi[i])} />
          </div>
        )}
        {tab === 'channel' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ListPanel title="Channel Ticket" desc="Sumber masuknya tiket (kolom Channel Ticket di sheet)" arr={cfg.channels} badge="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20"
              onAdd={(v) => patch((c) => void (!c.channels.includes(v) && (c.channels.push(v), c.channels.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.channels.splice(i, 1), 'Dihapus: ' + cfg.channels[i])} />
            <ListPanel title="TEAM NAME" desc="Anggota tim support (kolom TEAM NAME di sheet)" arr={cfg.teamNames} badge="bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/20"
              onAdd={(v) => patch((c) => void (!c.teamNames.includes(v) && (c.teamNames.push(v), c.teamNames.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.teamNames.splice(i, 1), 'Dihapus: ' + cfg.teamNames[i])} />
          </div>
        )}
        {tab === 'calendar' && <TabCalendar cfg={cfg} />}
        {tab === 'headers' && <TabHeaders cfg={cfg} />}
        {tab === 'ai' && <TabAi agents={agents} onToggle={toggleAgent} />}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-xl animate-fade-in-fast">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ===== Panel daftar generik (chip + tambah/hapus) ===== */
function ListPanel({ title, desc, arr, badge = 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', onAdd, onDel }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-5 animate-fade-in-fast">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-extrabold text-slate-900 dark:text-white text-sm tracking-tight">{title}</h3>
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-0.5 tabular-nums">{arr.length} item</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">{desc}</p>
      <form
        className="flex gap-2 mb-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = val.trim().toUpperCase();
          if (!v) return;
          if (arr.includes(v)) {
            setErr(`"${v}" sudah ada di daftar.`);
            return;
          }
          setErr('');
          onAdd(v);
          setVal('');
        }}
      >
        <input
          type="text"
          required
          placeholder={`Tambah ${title.toLowerCase()} baru...`}
          value={val}
          onChange={(e) => { setVal(e.target.value); setErr(''); }}
          className={`${CFG_INPUT} flex-1 !rounded-xl !py-2.5`}
        />
        <button className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 rounded-xl transition shrink-0">Tambah</button>
      </form>
      {err && <p className="mb-2 text-[11px] font-semibold text-rose-600">{err}</p>}
      <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto scrollbar-thin">
        {arr.map((v, i) => (
          <span key={`${v}-${i}`} className={`group inline-flex items-center gap-1.5 text-[11px] font-semibold border rounded-full pl-3 pr-1.5 py-1 ${badge}`}>
            {v}
            <button
              type="button"
              title="Hapus"
              onClick={() => {
                if (confirm(`Hapus "${v}" dari daftar?`)) onDel(i);
              }}
              className="w-4 h-4 rounded-full text-slate-400 hover:text-white hover:bg-rose-500 flex items-center justify-center transition"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ===== Tab Pricelist ===== */
function TabPricelist({ cfg, patch }) {
  const [addingVersion, setAddingVersion] = useState(null);
  const versions = useMemo(
    () => [...new Set(cfg.pricelist.map((p) => p.version))].sort(),
    [cfg.pricelist]
  );

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3 text-[11px] text-amber-800 dark:text-amber-400 animate-fade-in-fast">
        <span className="font-bold">Sesuai sheet:</span> kolom{' '}
        <span className="font-mono">BILLING CATEGORY · TARIFF · SUPPORT TYPE · NOTES (versi)</span>. Tariff dalam Rupiah tanpa
        titik/koma. Versi <span className="font-semibold">PRICELIST - 3 & 4</span> di sheet masih tarif 0 (cadangan kenaikan harga).
      </div>
      {versions.map((v) => {
        const rows = cfg.pricelist.map((p, i) => ({ ...p, _i: i })).filter((p) => p.version === v);
        const maxT = Math.max(...rows.map((r) => r.tariff), 1);
        return (
          <div key={v} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] overflow-hidden animate-fade-in-fast">
            <div className="px-6 py-4 bg-slate-800 dark:bg-slate-950 text-white flex flex-wrap items-center gap-3 justify-between">
              <div>
                <h3 className="font-extrabold text-sm tracking-tight">{v}</h3>
                <p className="text-[11px] text-slate-300 tabular-nums">{rows.length} billing category</p>
              </div>
              <button onClick={() => setAddingVersion(v)} className="text-xs font-bold bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition">
                + Tambah Baris
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-2.5 text-left">Billing Category</th>
                  <th className="px-4 py-2.5 text-right">Tariff (Rp)</th>
                  <th className="px-4 py-2.5 text-left">Support Type</th>
                  <th className="px-4 py-2.5 text-left">Visual</th>
                  <th className="px-4 py-2.5 text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((p) => (
                  <tr key={p._i} className="even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-brand-50/50 dark:hover:bg-slate-800 transition">
                    <td className="px-6 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{p.billingCategory}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        defaultValue={p.tariff ? p.tariff.toLocaleString('id-ID') : 0}
                        onBlur={(e) => {
                          const n = parseInt(String(e.target.value).replace(/[^\d]/g, ''), 10) || 0;
                          patch((c) => {
                            c.pricelist[p._i].tariff = n;
                          }, 'Tariff ' + p.billingCategory + ' = Rp ' + n.toLocaleString('id-ID'));
                        }}
                        className={`${CFG_INPUT} !w-32 text-right font-bold tabular-nums ${p.tariff ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={p.supportType}
                        onChange={(e) =>
                          patch((c) => {
                            c.pricelist[p._i].supportType = e.target.value;
                          })
                        }
                        className={`${CFG_INPUT} !w-44`}
                      >
                        {ST_CHOICES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 w-40">
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.round((p.tariff / maxT) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => {
                          if (confirm(`Hapus "${p.billingCategory}" dari ${p.version}?`))
                            patch((c) => c.pricelist.splice(p._i, 1), 'Baris dihapus');
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition"
                        title="Hapus baris"
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {addingVersion && (
        <PromptModal
          title={`Tambah Baris — ${addingVersion}`}
          desc="Tariff awal 0 dengan support type C — bisa diubah langsung di tabel."
          placeholder="Nama billing category..."
          suggestions={cfg.billingCategoryMap.map((b) => b.billingCategory)}
          onClose={() => setAddingVersion(null)}
          onSubmit={(cat) => {
            patch((c) => {
              c.pricelist.push({ billingCategory: cat, tariff: 0, supportType: 'SUPPORT TYPE - C', version: addingVersion });
            }, 'Baris ditambahkan ke ' + addingVersion);
            setAddingVersion(null);
            return null;
          }}
        />
      )}
    </div>
  );
}

/* ===== Tab Billing Category Map ===== */
function TabBcMap({ cfg, patch }) {
  const [addingBc, setAddingBc] = useState(false);
  const suggestions = useMemo(() => {
    const mapped = new Set(cfg.billingCategoryMap.map((b) => b.billingCategory));
    return [...new Set(cfg.pricelist.map((p) => p.billingCategory))].filter((x) => !mapped.has(x)).sort();
  }, [cfg]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] overflow-hidden animate-fade-in-fast">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 justify-between bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-800/60 dark:to-slate-900">
        <div>
          <h3 className="font-extrabold text-slate-900 dark:text-white text-sm tracking-tight">Mapping BILLING CATEGORY → SUPPORT TYPE</h3>
          <p className="text-[11px] text-slate-400">Sesuai 2 kolom pertama di sheet — menentukan tipe support otomatis dari kategori billing</p>
        </div>
        <button onClick={() => setAddingBc(true)} className="text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-xl px-3 py-2 transition">
          + Tambah Mapping
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50/80 dark:bg-slate-800/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <th className="px-6 py-2.5 text-left">Billing Category</th>
            <th className="px-4 py-2.5 text-left">Support Type</th>
            <th className="px-4 py-2.5 text-center w-16">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {cfg.billingCategoryMap.map((b, i) => (
            <tr key={i} className="even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-brand-50/50 dark:hover:bg-slate-800 transition">
              <td className="px-6 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{b.billingCategory}</td>
              <td className="px-4 py-2.5">
                <select
                  value={b.supportType}
                  onChange={(e) =>
                    patch((c) => {
                      c.billingCategoryMap[i].supportType = e.target.value;
                    })
                  }
                  className={`${CFG_INPUT} !w-48`}
                >
                  {ST_CHOICES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-2.5 text-center">
                <button
                  onClick={() => {
                    if (confirm(`Hapus mapping "${b.billingCategory}"?`))
                      patch((c) => c.billingCategoryMap.splice(i, 1), 'Mapping dihapus');
                  }}
                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition"
                >
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {addingBc && (
        <PromptModal
          title="Tambah Mapping"
          desc="Pasangan billing category baru dengan support type default C."
          placeholder="Nama billing category..."
          suggestions={suggestions}
          onClose={() => setAddingBc(false)}
          onSubmit={(cat) => {
            if (cfg.billingCategoryMap.some((b) => b.billingCategory === cat)) {
              return `Mapping "${cat}" sudah ada.`;
            }
            patch((c) => {
              c.billingCategoryMap.push({ billingCategory: cat, supportType: 'SUPPORT TYPE - C' });
            }, 'Mapping ditambahkan');
            setAddingBc(false);
            return null;
          }}
        />
      )}
    </div>
  );
}

/* ===== Modal tambah generik (pengganti prompt() bawaan browser) ===== */
function PromptModal({ title, desc, placeholder, suggestions = [], submitLabel = 'Tambah', onClose, onSubmit }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const listId = useMemo(() => `pm-${Math.random().toString(36).slice(2)}`, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <form
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-fast"
        onSubmit={(e) => {
          e.preventDefault();
          const v = val.trim().toUpperCase();
          if (!v) {
            setErr('Nama tidak boleh kosong.');
            return;
          }
          const msg = onSubmit(v);
          if (msg) setErr(msg);
        }}
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-violet-50/80 to-white dark:from-slate-800 dark:to-slate-900">
          <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">{title}</h3>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
        </div>
        <div className="px-6 py-4">
          <input
            autoFocus
            type="text"
            value={val}
            maxLength={60}
            onChange={(e) => { setVal(e.target.value); setErr(''); }}
            list={suggestions.length ? listId : undefined}
            placeholder={placeholder}
            className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold uppercase focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
          />
          {suggestions.length > 0 && (
            <datalist id={listId}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
          {err
            ? <p className="mt-2 text-xs font-semibold text-rose-600">{err}</p>
            : <p className="mt-2 text-[11px] text-slate-400">Otomatis UPPERCASE.{suggestions.length > 0 ? ' Ketik untuk mencari dari saran.' : ''}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 hover:bg-slate-100 px-4 py-2.5 rounded-xl transition">
              Batal
            </button>
            <button type="submit" className="text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 px-5 py-2.5 rounded-xl transition">
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ===== Tab Kalender (read-only) ===== */
function RoTable({ title, desc, head, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
        <h3 className="font-extrabold text-slate-900 dark:text-white text-sm tracking-tight">{title}</h3>
        <p className="text-[11px] text-slate-400">{desc}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50/80 dark:bg-slate-800/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            {head.map((h) => (
              <th key={h} className="px-5 py-2 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

function TabCalendar({ cfg }) {
  return (
    <div className="space-y-5">
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] text-slate-500 flex items-center gap-2 animate-fade-in-fast">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        Tabel kalender bersifat referensi tetap dari sheet (read-only) — dipakai untuk konversi tanggal, bulan, dan weeknum saat sinkronisasi.
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <RoTable title="DAYNAME → CONVERT DAYNAME" desc="Konversi nama hari (kolom DAYNAME & CONVERT DAYNAME di sheet)" head={['Dayname', 'Convert']}>
          {cfg.daynameConvert.map((d, i) => (
            <tr key={i}>
              <td className="px-5 py-2 font-semibold text-slate-700 dark:text-slate-200">{d.day}</td>
              <td className="px-5 py-2 text-slate-500 dark:text-slate-400">{d.convert}</td>
            </tr>
          ))}
        </RoTable>
        <RoTable title="month_no / month_init / month_name" desc="Kode bulan periode 2026 (kolom month_no di sheet)" head={['No', 'Init', 'Name']}>
          {cfg.monthNoMap.map((m, i) => (
            <tr key={i}>
              <td className="px-5 py-2 font-semibold text-slate-700 dark:text-slate-200">{m.no}</td>
              <td className="px-5 py-2 text-slate-500 dark:text-slate-400">{m.init}</td>
              <td className="px-5 py-2 text-slate-500 dark:text-slate-400">{m.name}</td>
            </tr>
          ))}
        </RoTable>
        <RoTable title="MONTH NAME / INIT MONTH / MONTH ID" desc="Nama bulan lengkap (kolom MONTH NAME di sheet)" head={['Month', 'Init', 'ID']}>
          {cfg.monthNameMap.map((m, i) => (
            <tr key={i}>
              <td className="px-5 py-2 font-semibold text-slate-700 dark:text-slate-200">{m.month}</td>
              <td className="px-5 py-2 text-slate-500 dark:text-slate-400">{m.init}</td>
              <td className="px-5 py-2 text-slate-500 dark:text-slate-400">{m.id}</td>
            </tr>
          ))}
        </RoTable>
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-5">
          <h3 className="font-extrabold text-slate-900 dark:text-white text-sm tracking-tight">WEEKNUM & YEAR</h3>
          <p className="text-[11px] text-slate-400 mb-3">Nomor minggu dan tahun yang dikenali sheet</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Weeknum (1–{cfg.weeknums.length})</p>
          <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto scrollbar-thin mb-4">
            {cfg.weeknums.map((w) => (
              <span key={w} className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded px-1.5 py-0.5">{w}</span>
            ))}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Year</p>
          <div className="flex flex-wrap gap-1.5">
            {cfg.years.map((y) => (
              <span key={y} className="text-[11px] font-bold bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-500/20 rounded-full px-3 py-1">{y}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Tab Header Mapping (read-only) ===== */
function TabHeaders({ cfg }) {
  return (
    <div className="space-y-5">
      <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-4 py-3 text-[11px] text-rose-700 dark:text-rose-400 flex items-center gap-2 animate-fade-in-fast">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>
          <span className="font-bold">KRITIS UNTUK BACKEND — TERKUNCI.</span> Tabel ini adalah mapping kolom sheet master (HEADER NAME → COL NO → DEF_HEADERS_NAME). Jangan diubah tanpa koordinasi dengan backend agar sinkronisasi tidak rusak.
        </span>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] overflow-hidden animate-fade-in-fast">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 justify-between bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-800/60 dark:to-slate-900">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm tracking-tight">Mapping Kolom Sheet Master ({cfg.headerMapping.length} kolom)</h3>
            <p className="text-[11px] text-slate-400">HEADER NAME (nama internal) · COL NO (posisi kolom) · DEF_HEADERS_NAME (judul tampilan)</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            READ-ONLY
          </span>
        </div>
        <div className="overflow-y-auto scrollbar-thin max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-slate-50 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-2.5 text-left bg-slate-50 dark:bg-slate-800">Header Name</th>
                <th className="px-4 py-2.5 text-left bg-slate-50 dark:bg-slate-800">Col No</th>
                <th className="px-4 py-2.5 text-left bg-slate-50 dark:bg-slate-800">Def Headers Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cfg.headerMapping.map((h, i) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800 transition">
                  <td className="px-6 py-2 font-mono text-xs font-bold text-brand-700 dark:text-brand-300">{h.header}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 font-mono">{h.colNo}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{h.defName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ===== Tab AI Assistant (toggle fitur; koneksi API key ada di /roles) ===== */
function TabAi({ agents, onToggle }) {
  const onCount = agents.filter((a) => a.enabled).length;
  return (
    <div className="space-y-4">
      <div className="bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 rounded-xl px-4 py-3 text-[11px] text-brand-800 dark:text-brand-300 animate-fade-in-fast">
        <span className="font-bold">{onCount}/{agents.length} agent aktif.</span> Toggle tersimpan otomatis ke backend.
        Koneksi API key diatur di <span className="font-bold">Hak Akses → AI & API Key</span>.
      </div>
      {agents.map((a) => (
        <div key={a.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-5 flex items-center gap-4 animate-fade-in-fast">
          <button
            onClick={() => onToggle(a.id)}
            title={a.enabled ? 'Nonaktifkan' : 'Aktifkan'}
            className={`relative w-12 h-7 rounded-full transition shrink-0 ${a.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${a.enabled ? 'left-6' : 'left-1'}`} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">{a.name}</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.enabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                {a.enabled ? 'AKTIF' : 'NONAKTIF'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{a.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
