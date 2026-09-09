import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { NAV_MODULES } from '../config/modules.js';
import Icon from '../components/Icon.jsx';
import { getUsers, patchUser, setUserPassword, postLog, getStatusOptions, putStatusOptions } from '../lib/api.js';

const ROLE_BADGE = {
  'Super Admin': 'bg-violet-50 text-violet-600 border-violet-200',
  'Admin CS': 'bg-sky-50 text-sky-600 border-sky-200',
  Support: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  Finance: 'bg-amber-50 text-amber-600 border-amber-200',
  Viewer: 'bg-slate-100 text-slate-500 border-slate-200',
};

const initials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

function SectionHead({ icon, title, desc }) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
      <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
        <Icon name={icon} className="w-5 h-5" strokeWidth={1.8} />
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
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
  'block w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 disabled:bg-slate-50 disabled:text-slate-400 transition';

function Notice({ kind, children }) {
  if (!children) return null;
  const cls =
    kind === 'ok'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : 'bg-rose-50 border-rose-200 text-rose-700';
  return (
    <p role={kind === 'ok' ? 'status' : 'alert'} className={`text-xs font-medium border rounded-lg px-3 py-2.5 ${cls}`}>
      {children}
    </p>
  );
}

// Satu daftar master status (tambah + hapus) — dipakai untuk Status Validasi & Status Invoice
function StatusListManager({ label, hint, items, newVal, onNewVal, onAdd, onDelete, disabled, busy }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
      </div>
      <ul className="space-y-1.5">
        {items.map((s) => (
          <li key={s} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
            <span className="flex-1 text-xs font-semibold text-slate-700 truncate">{s}</span>
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
  const { can, perms, role } = usePermissions();
  const [myId, setMyId] = useState('');

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
    <div className="px-8 py-6 space-y-5 max-w-4xl">
      {/* Kartu identitas */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-4 animate-fade-in-fast">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-lg font-bold shrink-0">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900 truncate">{name || 'Pengguna'}</h2>
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          <span
            className={`inline-block mt-1.5 text-[10px] font-bold border rounded-full px-2 py-0.5 ${ROLE_BADGE[role] || 'bg-slate-100 text-slate-500 border-slate-200'}`}
          >
            {role}
          </span>
        </div>
      </div>

      {/* Profil */}
      <form
        onSubmit={saveProfile}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 animate-fade-in-fast"
        style={{ animationDelay: '.05s' }}
      >
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
      <form
        onSubmit={savePassword}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 animate-fade-in-fast"
        style={{ animationDelay: '.1s' }}
      >
        <SectionHead icon="lock" title="Keamanan" desc="Ubah password akun" />
        {!canManage && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
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

      {/* Master status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 animate-fade-in-fast" style={{ animationDelay: '.12s' }}>
        <SectionHead icon="billing" title="Master Status" desc="Daftar status Billing & Finance — disharing semua user, tersimpan di database" />
        {!canEditMaster && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
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

      {/* Akses saya */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 animate-fade-in-fast" style={{ animationDelay: '.15s' }}>
        <SectionHead icon="dashboard" title="Akses Saya" desc={`${accessCount} dari ${myAccess.length} modul dapat diakses role ${role}`} />
        <ul className="grid sm:grid-cols-2 gap-2">
          {myAccess.map((m) => (
            <li
              key={m.id}
              className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${m.allowed ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60'}`}
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
                <p className={`text-sm font-semibold truncate ${m.allowed ? 'text-slate-800' : 'text-slate-400'}`}>{m.title}</p>
                <p className="text-[11px] text-slate-400 truncate">{m.sub}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Sesi */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 animate-fade-in-fast" style={{ animationDelay: '.2s' }}>
        <SectionHead icon="logout" title="Sesi" desc="Perangkat yang sedang login & keluar akun" />
        <div className="flex items-center gap-3 text-sm">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <p className="text-slate-600">
            Login sebagai <span className="font-semibold text-slate-800">{user?.email}</span> di perangkat ini
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
    </div>
  );
}
