import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { NAV_MODULES } from '../config/modules.js';
import Icon from '../components/Icon.jsx';
import { getUsers, patchUser, setUserPassword, postLog } from '../lib/api.js';

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

  // Ubah akun sendiri butuh izin tulis modul 'roles' (aturan backend PermGuard)
  const canManage = can('roles');

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
