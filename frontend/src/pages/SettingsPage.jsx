import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { NAV_MODULES } from '../config/modules.js';
import Icon from '../components/Icon.jsx';
import RolesPage from './RolesPage.jsx';
import LogsPage from './LogsPage.jsx';
import { getUsers, patchUser, setUserPassword, postLog, getStatusOptions, putStatusOptions } from '../lib/api.js';

const ROLE_BADGE = {
  'Super Admin': 'bg-violet-50 text-violet-600 border-violet-200',
  'Admin CS': 'bg-sky-50 text-sky-600 border-sky-200',
  Support: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  Finance: 'bg-amber-50 text-amber-600 border-amber-200',
  Viewer: 'bg-slate-100 text-slate-500 border-slate-200',
};

const TABS = [
  { id: 'akun', label: 'Akun', desc: 'Profil, keamanan & sesi', icon: 'user' },
  { id: 'tampilan', label: 'Tampilan', desc: 'Tema gelap & terang', icon: 'sun' },
  { id: 'master', label: 'Master Status', desc: 'Status Billing & Finance', icon: 'billing' },
  { id: 'akses', label: 'Akses Saya', desc: 'Modul yang dapat diakses', icon: 'dashboard' },
  { id: 'roles', label: 'Hak Akses', desc: 'Kelola pengguna & izin', icon: 'roles', perm: 'roles' },
  { id: 'logs', label: 'Logs', desc: 'Riwayat aktivitas', icon: 'logs', perm: 'logs' },
  { id: 'sesi', label: 'Sesi', desc: 'Perangkat & keluar', icon: 'logout' },
];

const initials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

function SectionHead({ icon, title, desc }) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
      <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 dark:bg-brand-500/10 dark:border-brand-500/20 dark:text-brand-300 flex items-center justify-center shrink-0">
        <Icon name={icon} className="w-5 h-5" strokeWidth={1.8} />
      </div>
      <div>
        <h3 className="font-bold text-slate-900 dark:text-white text-sm">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="text-[11px] text-slate-400 mt-1.5">{hint}</p>}
      {error && (
        <p role="alert" className="text-[11px] text-rose-600 font-medium mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'block w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 disabled:bg-slate-50 disabled:text-slate-400 transition bg-white text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500';

function Notice({ kind, children }) {
  if (!children) return null;
  const cls =
    kind === 'ok'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400'
      : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400';
  return (
    <p role={kind === 'ok' ? 'status' : 'alert'} className={`text-xs font-medium border rounded-lg px-3 py-2.5 ${cls}`}>
      {children}
    </p>
  );
}

// Satu daftar master status (tambah + hapus) — dipakai untuk Status Validasi & Status Invoice
function StatusListManager({ label, hint, items, newVal, onNewVal, onAdd, onDelete, disabled, busy }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
      </div>
      <ul className="space-y-1.5">
        {items.map((s) => (
          <li key={s} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-1.5">
            <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{s}</span>
            <button
              type="button"
              onClick={() => onDelete(s)}
              disabled={disabled || busy || items.length <= 1}
              title={items.length <= 1 ? 'Minimal 1 status harus ada' : `Hapus status ${s}`}
              aria-label={`Hapus status ${s}`}
              className="shrink-0 text-slate-300 hover:text-rose-600 disabled:opacity-40 disabled:cursor-not-allowed rounded p-1 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <input
          value={newVal}
          onChange={(e) => onNewVal(e.target.value)}
          disabled={disabled || busy}
          placeholder="Tambah status baru…"
          aria-label={`Tambah ${label} baru`}
          maxLength={40}
          className={`${inputCls} flex-1`}
        />
        <button
          type="submit"
          disabled={disabled || busy}
          className="shrink-0 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition"
        >
          {busy ? '…' : 'Tambah'}
        </button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { can, perms, role } = usePermissions();
  const location = useLocation();
  const [myId, setMyId] = useState('');
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'akun');

  // Profil
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  // Keamanan
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  // Master status (disharing via backend)
  const [masters, setMasters] = useState({ auditActions: [], invoiceActions: [] });
  const [mastersLoading, setMastersLoading] = useState(true);
  const [newAudit, setNewAudit] = useState('');
  const [newInvoice, setNewInvoice] = useState('');
  const [masterMsg, setMasterMsg] = useState(null);
  const [masterBusy, setMasterBusy] = useState(false);

  // Ubah akun sendiri butuh izin tulis modul 'roles' (aturan backend PermGuard)
  const canManage = can('roles');
  // Kelola master status butuh izin tulis modul 'billing' (cermin backend)
  const canEditMaster = can('billing');

  const visibleTabs = useMemo(() => TABS.filter((t) => !t.perm || can(t.perm)), [perms, role]);
  const safeTab = visibleTabs.some((t) => t.id === tab) ? tab : 'akun';

  // Cari id user sendiri (untuk PATCH nama & password) — GET /users terbuka
  useEffect(() => {
    let ignore = false;
    getUsers()
      .then((rows) => {
        if (ignore) return;
        const me = (rows || []).find(
          (u) => String(u.email || '').toLowerCase() === String(user?.email || '').toLowerCase()
        );
        if (me) setMyId(me.id);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [user?.email]);

  const myAccess = useMemo(
    () => NAV_MODULES.map((m) => ({ ...m, allowed: role === 'Super Admin' || !!perms?.[role]?.[m.id] })),
    [perms, role]
  );
  const accessCount = myAccess.filter((m) => m.allowed).length;

  // Muat master status dari backend (DB); fallback ke default bila backend lama/offline
  useEffect(() => {
    let ignore = false;
    setMastersLoading(true);
    getStatusOptions()
      .then((r) => {
        if (ignore) return;
        setMasters({
          auditActions: Array.isArray(r?.auditActions) && r.auditActions.length ? r.auditActions : ['BELUM DIVALIDASI', 'VALID - SIAP INVOICE', 'PERLU DICEK ULANG'],
          invoiceActions: Array.isArray(r?.invoiceActions) && r.invoiceActions.length ? r.invoiceActions : ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'PAID'],
        });
      })
      .catch(() => {
        if (ignore) return;
        setMasters({
          auditActions: ['BELUM DIVALIDASI', 'VALID - SIAP INVOICE', 'PERLU DICEK ULANG'],
          invoiceActions: ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'PAID'],
        });
      })
      .finally(() => {
        if (!ignore) setMastersLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const normStatus = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();

  async function persistMasters(next, label) {
    setMasterBusy(true);
    try {
      const r = await putStatusOptions(next);
      setMasters({
        auditActions: r.auditActions || next.auditActions || masters.auditActions,
        invoiceActions: r.invoiceActions || next.invoiceActions || masters.invoiceActions,
      });
      postLog(user?.name || user?.email, label).catch(() => {});
      setMasterMsg({ kind: 'ok', text: `${label} — tersimpan & berlaku untuk semua user.` });
    } catch (err) {
      setMasterMsg({
        kind: 'err',
        text: err?.status === 403 ? 'Hanya role dengan akses Billing yang dapat mengubah.' : err.message || 'Gagal menyimpan.',
      });
    } finally {
      setMasterBusy(false);
    }
  }

  function addMaster(kind, raw, clear) {
    setMasterMsg(null);
    const v = normStatus(raw);
    if (!v) {
      setMasterMsg({ kind: 'err', text: 'Nama status tidak boleh kosong.' });
      return;
    }
    const list = masters[kind];
    if (list.some((a) => a.toLowerCase() === v.toLowerCase())) {
      setMasterMsg({ kind: 'err', text: `Status "${v}" sudah ada.` });
      return;
    }
    clear('');
    persistMasters({ [kind]: [...list, v] }, `Menambah master status "${v}"`);
  }

  function delMaster(kind, val) {
    setMasterMsg(null);
    const list = masters[kind];
    if (list.length <= 1) {
      setMasterMsg({ kind: 'err', text: 'Minimal 1 status harus ada.' });
      return;
    }
    persistMasters({ [kind]: list.filter((a) => a !== val) }, `Menghapus master status "${val}"`);
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileMsg(null);
    const v = name.trim();
    if (!v) {
      setProfileMsg({ kind: 'err', text: 'Nama tidak boleh kosong.' });
      return;
    }
    if (!myId) {
      setProfileMsg({ kind: 'err', text: 'Data akun tidak ditemukan — muat ulang halaman.' });
      return;
    }
    setSavingProfile(true);
    try {
      await patchUser(myId, { name: v });
      localStorage.setItem('userName', v);
      window.dispatchEvent(new Event('storage')); // segarkan nama di sidebar
      postLog(v, 'memperbarui nama profil').catch(() => {});
      setProfileMsg({ kind: 'ok', text: 'Nama profil berhasil disimpan.' });
    } catch (err) {
      setProfileMsg({
        kind: 'err',
        text: err?.status === 403 ? 'Hanya admin yang dapat mengubah nama.' : err.message || 'Gagal menyimpan.',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwMsg(null);
    if (pw1.length < 5) {
      setPwMsg({ kind: 'err', text: 'Password minimal 5 karakter.' });
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg({ kind: 'err', text: 'Konfirmasi password tidak sama.' });
      return;
    }
    if (!myId) {
      setPwMsg({ kind: 'err', text: 'Data akun tidak ditemukan — muat ulang halaman.' });
      return;
    }
    setSavingPw(true);
    try {
      await setUserPassword(myId, pw1);
      postLog(user?.name || user?.email, 'memperbarui password akun').catch(() => {});
      setPw1('');
      setPw2('');
      setPwMsg({ kind: 'ok', text: 'Password berhasil diperbarui. Gunakan password baru saat login berikutnya.' });
    } catch (err) {
      setPwMsg({
        kind: 'err',
        text: err?.status === 403 ? 'Hanya admin yang dapat mengubah password.' : err.message || 'Gagal menyimpan.',
      });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5">
      {/* Kartu identitas */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex items-center gap-4 animate-fade-in-fast">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-lg font-bold shrink-0">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white truncate">{name || 'Pengguna'}</h2>
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          <span
            className={`inline-block mt-1.5 text-[10px] font-bold border rounded-full px-2 py-0.5 ${ROLE_BADGE[role] || 'bg-slate-100 text-slate-500 border-slate-200'}`}
          >
            {role}
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Sub-navigasi pengaturan */}
        <nav
          aria-label="Navigasi pengaturan"
          className="w-full lg:w-60 shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 flex lg:flex-col flex-row gap-1 overflow-x-auto scrollbar-thin lg:sticky lg:top-20 animate-fade-in-fast"
        >
          {visibleTabs.map((t) => {
            const active = safeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition shrink-0 lg:shrink ${
                  active
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon name={t.icon} className="w-5 h-5 shrink-0" strokeWidth={1.8} />
                <span className="min-w-0">
                  <span className={`block text-sm font-bold whitespace-nowrap ${active ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                    {t.label}
                  </span>
                  <span className={`hidden lg:block text-[11px] truncate ${active ? 'text-brand-100' : 'text-slate-400'}`}>
                    {t.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Panel konten */}
        <div key={safeTab} className="flex-1 min-w-0 w-full space-y-5 animate-fade-in-fast">
          {safeTab === 'akun' && (
            <div className="max-w-3xl space-y-5">
              {/* Profil */}
              <form onSubmit={saveProfile} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <SectionHead icon="roles" title="Profil Saya" desc="Nama tampil, email & role akun" />
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field
                    label="Nama tampil"
                    hint={canManage ? 'Nama ini tampil di sidebar & log aktivitas.' : 'Hanya admin yang dapat mengubah nama.'}
                  >
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!canManage}
                      className={inputCls}
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Email" hint="Email tidak dapat diubah.">
                    <input value={user?.email || ''} disabled className={inputCls} autoComplete="email" />
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={!canManage || savingProfile}
                    className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition"
                  >
                    {savingProfile ? 'Menyimpan…' : 'Simpan Profil'}
                  </button>
                  <Notice kind={profileMsg?.kind}>{profileMsg?.text}</Notice>
                </div>
              </form>

              {/* Keamanan */}
              <form onSubmit={savePassword} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <SectionHead icon="lock" title="Keamanan" desc="Ubah password akun" />
                {!canManage && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400">
                    Role Anda tidak memiliki izin mengubah password — hubungi admin.
                  </p>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Password baru" hint="Minimal 5 karakter.">
                    <input
                      type="password"
                      value={pw1}
                      onChange={(e) => setPw1(e.target.value)}
                      disabled={!canManage}
                      className={inputCls}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Konfirmasi password baru">
                    <input
                      type="password"
                      value={pw2}
                      onChange={(e) => setPw2(e.target.value)}
                      disabled={!canManage}
                      className={inputCls}
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={!canManage || savingPw}
                    className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition"
                  >
                    {savingPw ? 'Menyimpan…' : 'Ubah Password'}
                  </button>
                  <Notice kind={pwMsg?.kind}>{pwMsg?.text}</Notice>
                </div>
              </form>
            </div>
          )}

          {safeTab === 'tampilan' && (
            <div className="max-w-3xl space-y-5">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <SectionHead icon="sun" title="Tampilan" desc="Pilih tema — tersimpan otomatis di browser ini" />
                <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Pilih tema">
                  {[
                    {
                      id: 'light',
                      label: 'Terang',
                      desc: 'Latar cerah untuk siang hari',
                      preview: 'bg-slate-100 border-slate-200',
                      bar: 'bg-brand-500',
                      dot: 'bg-amber-400',
                    },
                    {
                      id: 'dark',
                      label: 'Gelap',
                      desc: 'Nyaman di mata malam hari',
                      preview: 'bg-slate-900 border-slate-700',
                      bar: 'bg-brand-400',
                      dot: 'bg-slate-500',
                    },
                  ].map((o) => {
                    const activeTheme = theme === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={activeTheme}
                        onClick={() => setTheme(o.id)}
                        className={`relative text-left rounded-2xl border-2 p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          activeTheme
                            ? 'border-brand-500 shadow-lg shadow-brand-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 ${o.preview}`} aria-hidden="true">
                          <span className={`w-6 h-6 rounded-md ${o.bar}`} />
                          <span className="flex-1 space-y-1">
                            <span className={`block h-1.5 rounded-full ${o.id === 'light' ? 'bg-slate-300' : 'bg-slate-600'}`} />
                            <span className={`block h-1.5 w-2/3 rounded-full ${o.id === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`} />
                          </span>
                          <span className={`w-2 h-2 rounded-full ${o.dot}`} />
                        </span>
                        <span className="mt-3 flex items-center justify-between gap-2">
                          <span>
                            <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{o.label}</span>
                            <span className="block text-[11px] text-slate-400 mt-0.5">{o.desc}</span>
                          </span>
                          {activeTheme && (
                            <span className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center shrink-0" aria-hidden="true">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  Pilihan tersimpan otomatis dan langsung berlaku di semua halaman.
                </p>
              </div>
            </div>
          )}

          {safeTab === 'master' && (
            <div className="max-w-3xl bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <SectionHead icon="billing" title="Master Status" desc="Daftar status Billing & Finance — disharing semua user, tersimpan di database" />
              {!canEditMaster && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400">
                  Role Anda tidak memiliki akses Billing — daftar hanya bisa dilihat, hubungi admin untuk mengubah.
                </p>
              )}
              {mastersLoading ? (
                <p className="text-xs text-slate-400 py-4 text-center">Memuat master status…</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  <StatusListManager
                    label="Status Validasi"
                    hint="Dipakai di halaman Billing & Audit."
                    items={masters.auditActions}
                    newVal={newAudit}
                    onNewVal={setNewAudit}
                    onAdd={() => addMaster('auditActions', newAudit, setNewAudit)}
                    onDelete={(v) => delMaster('auditActions', v)}
                    disabled={!canEditMaster}
                    busy={masterBusy}
                  />
                  <StatusListManager
                    label="Status Invoice"
                    hint="Dipakai di halaman Finance Audit."
                    items={masters.invoiceActions}
                    newVal={newInvoice}
                    onNewVal={setNewInvoice}
                    onAdd={() => addMaster('invoiceActions', newInvoice, setNewInvoice)}
                    onDelete={(v) => delMaster('invoiceActions', v)}
                    disabled={!canEditMaster}
                    busy={masterBusy}
                  />
                </div>
              )}
              <Notice kind={masterMsg?.kind}>{masterMsg?.text}</Notice>
            </div>
          )}

          {safeTab === 'akses' && (
            <div className="max-w-3xl bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <SectionHead icon="dashboard" title="Akses Saya" desc={`${accessCount} dari ${myAccess.length} modul dapat diakses role ${role}`} />
              <ul className="grid sm:grid-cols-2 gap-2">
                {myAccess.map((m) => (
                  <li
                    key={m.id}
                    className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${m.allowed ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900' : 'border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'}`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.allowed ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-300'}`}>
                      {m.allowed ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${m.allowed ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>{m.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{m.sub}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {safeTab === 'roles' && <RolesPage bare />}

          {safeTab === 'logs' && <LogsPage bare />}

          {safeTab === 'sesi' && (
            <div className="max-w-3xl bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <SectionHead icon="logout" title="Sesi" desc="Perangkat yang sedang login & keluar akun" />
              <div className="flex items-center gap-3 text-sm">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <p className="text-slate-600 dark:text-slate-300">
                  Login sebagai <span className="font-semibold text-slate-800 dark:text-slate-100">{user?.email}</span> di perangkat ini
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-5 py-2 rounded-lg transition"
              >
                <Icon name="logout" className="w-4 h-4" strokeWidth={2} />
                Keluar dari Akun
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
