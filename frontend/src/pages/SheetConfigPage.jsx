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
  { id: 'pricelist', label: 'Pricelist' },
  { id: 'brands', label: 'Brand Name' },
  { id: 'bcmap', label: 'Billing Category' },
  { id: 'module', label: 'Module & Sub-Module' },
  { id: 'support', label: 'Support Type & Kategori' },
  { id: 'status', label: 'Billing Status & Group KPI' },
  { id: 'channel', label: 'Channel & Team' },
  { id: 'calendar', label: 'Kalender' },
  { id: 'headers', label: 'Header Mapping (Backend)' },
];

const CFG_INPUT =
  'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-[3px] focus:ring-brand-500/25 focus:border-brand-400';

export default function SheetConfigPage() {
  const [cfg, setCfg] = useState(loadCfg);
  const [tab, setTab] = useState('pricelist');
  const [toast, setToast] = useState(null);
  const synced = useRef(false);

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
    <div className="px-8 py-6 space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 -mt-1">
        <button
          onClick={resetConfig}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Reset ke Default
        </button>
        <button
          onClick={exportJSON}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export JSON (Backend)
        </button>
      </div>

      {/* Info */}
      <div className="bg-brand-50 border border-brand-100 rounded-2xl px-5 py-4 flex items-start gap-3 animate-fade-in-fast">
        <svg className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-xs text-brand-800 leading-relaxed">
          Struktur & isi halaman ini <span className="font-bold">persis mengikuti tab konfigurasi di Google Sheets</span> (gid=0): nama tabel dan nama kolom sama persis, sehingga aman saat dihubungkan ke backend nanti. Semua perubahan <span className="font-semibold">tersimpan otomatis di browser & backend</span> dan bisa dikembalikan ke default kapan saja. Gunakan <span className="font-semibold">Export JSON</span> untuk menyerahkan konfigurasi final ke backend.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 bg-slate-200/60 rounded-xl p-1 text-xs font-semibold overflow-x-auto scrollbar-thin animate-fade-in-fast" style={{ animationDelay: '.05s' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-lg whitespace-nowrap transition ${
              tab === t.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {tab === 'pricelist' && <TabPricelist cfg={cfg} patch={patch} />}
        {tab === 'brands' && (
          <ListPanel
            title="BRAND NAME"
            desc="Daftar semua brand/klien (kolom BRAND NAME di sheet)"
            arr={cfg.brands}
            badge="bg-brand-50 text-brand-700 border-brand-200"
            onAdd={(v) => patch((c) => void (c.brands.includes(v) ? null : (c.brands.push(v), c.brands.sort())), 'Ditambahkan: ' + v)}
            onDel={(i) => patch((c) => c.brands.splice(i, 1), 'Dihapus: ' + cfg.brands[i])}
          />
        )}
        {tab === 'bcmap' && <TabBcMap cfg={cfg} patch={patch} />}
        {tab === 'module' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ListPanel title="MODULE" desc="Daftar modul sistem (kolom MODULE di sheet)" arr={cfg.modules} badge="bg-violet-50 text-violet-600 border-violet-200"
              onAdd={(v) => patch((c) => void (!c.modules.includes(v) && (c.modules.push(v), c.modules.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.modules.splice(i, 1), 'Dihapus: ' + cfg.modules[i])} />
            <ListPanel title="SUB-MODULE" desc="Daftar sub-modul (kolom SUB-MODULE di sheet)" arr={cfg.subModules}
              onAdd={(v) => patch((c) => void (!c.subModules.includes(v) && (c.subModules.push(v), c.subModules.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.subModules.splice(i, 1), 'Dihapus: ' + cfg.subModules[i])} />
          </div>
        )}
        {tab === 'support' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ListPanel title="SUPPORT TYPE" desc="Tipe support: TRAVICS!, SUPPORT TYPE - A/B/C, SUPPORT MONTHLY, X00–X13 (kolom SUPPORT TYPE di sheet)" arr={cfg.supportTypes} badge="bg-sky-50 text-sky-600 border-sky-200"
              onAdd={(v) => patch((c) => void (!c.supportTypes.includes(v) && (c.supportTypes.push(v), c.supportTypes.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.supportTypes.splice(i, 1), 'Dihapus: ' + cfg.supportTypes[i])} />
            <ListPanel title="SUPPORT CATEGORY" desc="Kategori support (kolom SUPPORT CATEGORY di sheet)" arr={cfg.supportCategories} badge="bg-emerald-50 text-emerald-600 border-emerald-200"
              onAdd={(v) => patch((c) => void (!c.supportCategories.includes(v) && (c.supportCategories.push(v), c.supportCategories.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.supportCategories.splice(i, 1), 'Dihapus: ' + cfg.supportCategories[i])} />
          </div>
        )}
        {tab === 'status' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ListPanel title="BILLING STATUS" desc="Status penagihan (kolom BILLING STATUS di sheet)" arr={cfg.billingStatuses} badge="bg-amber-50 text-amber-600 border-amber-200"
              onAdd={(v) => patch((c) => void (!c.billingStatuses.includes(v) && (c.billingStatuses.push(v), c.billingStatuses.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.billingStatuses.splice(i, 1), 'Dihapus: ' + cfg.billingStatuses[i])} />
            <ListPanel title="GROUP_KPI" desc="Kelompok KPI untuk HR Report (kolom GROUP_KPI di sheet)" arr={cfg.groupKpi} badge="bg-rose-50 text-rose-600 border-rose-200"
              onAdd={(v) => patch((c) => void (!c.groupKpi.includes(v) && (c.groupKpi.push(v), c.groupKpi.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.groupKpi.splice(i, 1), 'Dihapus: ' + cfg.groupKpi[i])} />
          </div>
        )}
        {tab === 'channel' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ListPanel title="Channel Ticket" desc="Sumber masuknya tiket (kolom Channel Ticket di sheet)" arr={cfg.channels} badge="bg-sky-50 text-sky-600 border-sky-200"
              onAdd={(v) => patch((c) => void (!c.channels.includes(v) && (c.channels.push(v), c.channels.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.channels.splice(i, 1), 'Dihapus: ' + cfg.channels[i])} />
            <ListPanel title="TEAM NAME" desc="Anggota tim support (kolom TEAM NAME di sheet)" arr={cfg.teamNames} badge="bg-brand-50 text-brand-700 border-brand-200"
              onAdd={(v) => patch((c) => void (!c.teamNames.includes(v) && (c.teamNames.push(v), c.teamNames.sort())), 'Ditambahkan: ' + v)}
              onDel={(i) => patch((c) => c.teamNames.splice(i, 1), 'Dihapus: ' + cfg.teamNames[i])} />
          </div>
        )}
        {tab === 'calendar' && <TabCalendar cfg={cfg} />}
        {tab === 'headers' && <TabHeaders cfg={cfg} />}
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
function ListPanel({ title, desc, arr, badge = 'bg-slate-50 text-slate-600 border-slate-200', onAdd, onDel }) {
  const [val, setVal] = useState('');
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-fade-in-fast">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5">{arr.length} item</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">{desc}</p>
      <form
        className="flex gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = val.trim().toUpperCase();
          if (!v) return;
          if (arr.includes(v)) {
            alert('Item sudah ada');
            return;
          }
          onAdd(v);
          setVal('');
        }}
      >
        <input
          type="text"
          required
          placeholder={`Tambah ${title.toLowerCase()} baru...`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className={`${CFG_INPUT} flex-1`}
        />
        <button className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 rounded-lg transition">Tambah</button>
      </form>
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
  const versions = useMemo(
    () => [...new Set(cfg.pricelist.map((p) => p.version))].sort(),
    [cfg.pricelist]
  );

  function addPriceRow(version) {
    const cat = prompt(
      'Billing Category baru untuk ' + version + ':\n(Referensi: ' +
        cfg.billingCategoryMap.map((b) => b.billingCategory).slice(0, 8).join(', ') + ', ...)'
    );
    if (!cat || !cat.trim()) return;
    patch((c) => {
      c.pricelist.push({ billingCategory: cat.trim().toUpperCase(), tariff: 0, supportType: 'SUPPORT TYPE - C', version });
    }, 'Baris ditambahkan ke ' + version);
  }

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[11px] text-amber-800 animate-fade-in-fast">
        <span className="font-bold">Sesuai sheet:</span> kolom{' '}
        <span className="font-mono">BILLING CATEGORY · TARIFF · SUPPORT TYPE · NOTES (versi)</span>. Tariff dalam Rupiah tanpa
        titik/koma. Versi <span className="font-semibold">PRICELIST - 3 & 4</span> di sheet masih tarif 0 (cadangan kenaikan harga).
      </div>
      {versions.map((v) => {
        const rows = cfg.pricelist.map((p, i) => ({ ...p, _i: i })).filter((p) => p.version === v);
        const maxT = Math.max(...rows.map((r) => r.tariff), 1);
        return (
          <div key={v} className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-fast">
            <div className="px-6 py-4 bg-slate-800 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">{v}</h3>
                <p className="text-[11px] text-slate-300">{rows.length} billing category</p>
              </div>
              <button onClick={() => addPriceRow(v)} className="text-xs font-bold bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition">
                + Tambah Baris
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <th className="px-6 py-2.5 text-left">Billing Category</th>
                  <th className="px-4 py-2.5 text-right">Tariff (Rp)</th>
                  <th className="px-4 py-2.5 text-left">Support Type</th>
                  <th className="px-4 py-2.5 text-left">Visual</th>
                  <th className="px-4 py-2.5 text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr key={p._i} className="hover:bg-slate-50/60 transition">
                    <td className="px-6 py-2.5 font-semibold text-slate-700">{p.billingCategory}</td>
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
                        className={`${CFG_INPUT} !w-32 text-right font-bold ${p.tariff ? 'text-slate-800' : 'text-slate-400'}`}
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
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.round((p.tariff / maxT) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => {
                          if (confirm(`Hapus "${p.billingCategory}" dari ${p.version}?`))
                            patch((c) => c.pricelist.splice(p._i, 1), 'Baris dihapus');
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition"
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
    </div>
  );
}

/* ===== Tab Billing Category Map ===== */
function TabBcMap({ cfg, patch }) {
  function addBcRow() {
    const cat = prompt('Billing Category baru:');
    if (!cat || !cat.trim()) return;
    patch((c) => {
      c.billingCategoryMap.push({ billingCategory: cat.trim().toUpperCase(), supportType: 'SUPPORT TYPE - C' });
    }, 'Mapping ditambahkan');
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-fast">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Mapping BILLING CATEGORY → SUPPORT TYPE</h3>
          <p className="text-[11px] text-slate-400">Sesuai 2 kolom pertama di sheet — menentukan tipe support otomatis dari kategori billing</p>
        </div>
        <button onClick={addBcRow} className="text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg px-3 py-1.5 transition">
          + Tambah Mapping
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
            <th className="px-6 py-2.5 text-left">Billing Category</th>
            <th className="px-4 py-2.5 text-left">Support Type</th>
            <th className="px-4 py-2.5 text-center w-16">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cfg.billingCategoryMap.map((b, i) => (
            <tr key={i} className="hover:bg-slate-50/60 transition">
              <td className="px-6 py-2.5 font-semibold text-slate-700">{b.billingCategory}</td>
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
    </div>
  );
}

/* ===== Tab Kalender (read-only) ===== */
function RoTable({ title, desc, head, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
        <p className="text-[11px] text-slate-400">{desc}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
            {head.map((h) => (
              <th key={h} className="px-5 py-2 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
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
              <td className="px-5 py-2 font-semibold text-slate-700">{d.day}</td>
              <td className="px-5 py-2 text-slate-500">{d.convert}</td>
            </tr>
          ))}
        </RoTable>
        <RoTable title="month_no / month_init / month_name" desc="Kode bulan periode 2026 (kolom month_no di sheet)" head={['No', 'Init', 'Name']}>
          {cfg.monthNoMap.map((m, i) => (
            <tr key={i}>
              <td className="px-5 py-2 font-semibold text-slate-700">{m.no}</td>
              <td className="px-5 py-2 text-slate-500">{m.init}</td>
              <td className="px-5 py-2 text-slate-500">{m.name}</td>
            </tr>
          ))}
        </RoTable>
        <RoTable title="MONTH NAME / INIT MONTH / MONTH ID" desc="Nama bulan lengkap (kolom MONTH NAME di sheet)" head={['Month', 'Init', 'ID']}>
          {cfg.monthNameMap.map((m, i) => (
            <tr key={i}>
              <td className="px-5 py-2 font-semibold text-slate-700">{m.month}</td>
              <td className="px-5 py-2 text-slate-500">{m.init}</td>
              <td className="px-5 py-2 text-slate-500">{m.id}</td>
            </tr>
          ))}
        </RoTable>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-900 text-sm">WEEKNUM & YEAR</h3>
          <p className="text-[11px] text-slate-400 mb-3">Nomor minggu dan tahun yang dikenali sheet</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Weeknum (1–{cfg.weeknums.length})</p>
          <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto scrollbar-thin mb-4">
            {cfg.weeknums.map((w) => (
              <span key={w} className="text-[10px] font-semibold bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{w}</span>
            ))}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Year</p>
          <div className="flex flex-wrap gap-1.5">
            {cfg.years.map((y) => (
              <span key={y} className="text-[11px] font-bold bg-brand-50 text-brand-700 border border-brand-100 rounded-full px-3 py-1">{y}</span>
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
      <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-[11px] text-rose-700 flex items-center gap-2 animate-fade-in-fast">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>
          <span className="font-bold">KRITIS UNTUK BACKEND — TERKUNCI.</span> Tabel ini adalah mapping kolom sheet master (HEADER NAME → COL NO → DEF_HEADERS_NAME). Jangan diubah tanpa koordinasi dengan backend agar sinkronisasi tidak rusak.
        </span>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-fast">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Mapping Kolom Sheet Master ({cfg.headerMapping.length} kolom)</h3>
            <p className="text-[11px] text-slate-400">HEADER NAME (nama internal) · COL NO (posisi kolom) · DEF_HEADERS_NAME (judul tampilan)</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 bg-slate-100 rounded-full px-3 py-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            READ-ONLY
          </span>
        </div>
        <div className="overflow-y-auto scrollbar-thin max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                <th className="px-6 py-2.5 text-left bg-slate-50">Header Name</th>
                <th className="px-4 py-2.5 text-left bg-slate-50">Col No</th>
                <th className="px-4 py-2.5 text-left bg-slate-50">Def Headers Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cfg.headerMapping.map((h, i) => (
                <tr key={i} className="hover:bg-slate-50/60 transition">
                  <td className="px-6 py-2 font-mono text-xs font-bold text-brand-700">{h.header}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 font-mono">{h.colNo}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-slate-700">{h.defName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
