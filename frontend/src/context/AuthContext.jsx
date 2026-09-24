import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { signIn as apiSignIn, signOut as apiSignOut, getSession, getAuthToken, setAuthToken } from '../lib/api.js';
import { get, set as storageSet, remove as storageRemove } from '../lib/storage.js';

// Role per email (backend menyimpan user tanpa role) + akun demo yang di-seed backend
// (password awal: password123 — lihat backend/src/db/init.ts)
export const MOCK_USERS = {
  'rani@revota.id': { name: 'Rani Admin', role: 'Super Admin' },
  'budi.cs@revota.id': { name: 'Budi Santoso', role: 'Admin CS' },
  'sari@revota.id': { name: 'Sari Support', role: 'Support' },
  'finance@revota.id': { name: 'Fajar Finance', role: 'Finance' },
  'vina@revota.id': { name: 'Vina Viewer', role: 'Viewer' },
};

const AuthContext = createContext(null);

function readSession() {
  // Sesi lama (tanpa token) dianggap kedaluwarsa — user login ulang sekali
  // untuk mendapatkan token sesi (wajib untuk endpoint tulis sejak P1-3).
  if (get('loggedIn') !== 'true' || !getAuthToken()) return null;
  return {
    email: get('userEmail', ''),
    name: get('userName', 'Pengguna'),
    role: get('userRole', 'Viewer'),
  };
}

function clearSession() {
  storageRemove('loggedIn', 'userEmail', 'userName', 'userRole');
  setAuthToken('');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession);

  useEffect(() => {
    const onStorage = () => setUser(readSession());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Validasi token ke backend saat boot (mis. backend restart pg-mem atau
  // token dicabut) — token tak valid = paksa login ulang, bukan state basi.
  useEffect(() => {
    if (get('loggedIn') !== 'true' || !getAuthToken()) return;
    let ignore = false;
    getSession()
      .then((r) => {
        if (ignore) return;
        if (!r?.user) {
          clearSession();
          setUser(null);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      async login(email, password) {
        const key = email.trim().toLowerCase();
        if (!key || !password || password.length < 5) {
          throw new Error('Email atau password salah (min. 5 karakter).');
        }
        // POST /api/auth/sign-in/email — user & password 'password123' sudah di-seed backend
        let r;
        try {
          r = await apiSignIn(key, password);
        } catch {
          throw new Error('Backend tidak terjangkau — pastikan backend jalan di port 5005.');
        }
        if (!r || r.error || !r.user) throw new Error('Email atau password salah.');
        if (!r.token) throw new Error('Backend tidak mengeluarkan token sesi — hubungi admin.');
        // Role dari backend (diatur admin di /roles) → MOCK → Viewer
        const u = {
          name: r.user.name || key.split('@')[0],
          role: r.user.role || MOCK_USERS[key]?.role || 'Viewer',
        };
        storageSet('loggedIn', 'true');
        storageSet('userEmail', key);
        storageSet('userName', u.name);
        storageSet('userRole', u.role);
        setAuthToken(r.token);
        const session = { email: key, name: u.name, role: u.role };
        setUser(session);
        return session;
      },
      logout() {
        apiSignOut().catch(() => {});
        clearSession();
        setUser(null);
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
