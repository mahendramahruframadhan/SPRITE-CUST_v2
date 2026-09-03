import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Auth mock — nanti diganti API NestJS
export const MOCK_USERS = {
  'rani@revota.id': { name: 'Rani Admin', role: 'Super Admin' },
  'budi.cs@revota.id': { name: 'Budi Santoso', role: 'Admin CS' },
  'sari@revota.id': { name: 'Sari Support', role: 'Support' },
  'finance@revota.id': { name: 'Fajar Finance', role: 'Finance' },
  'vina@revota.id': { name: 'Vina Viewer', role: 'Viewer' },
};

const AuthContext = createContext(null);

function readSession() {
  if (!localStorage.getItem('loggedIn')) return null;
  return {
    email: localStorage.getItem('userEmail') || '',
    name: localStorage.getItem('userName') || 'Pengguna',
    role: localStorage.getItem('userRole') || 'Viewer',
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession);

  useEffect(() => {
    const onStorage = () => setUser(readSession());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({
      user,
      login(email, password) {
        const key = email.trim().toLowerCase();
        if (!key || !password || password.length < 6) {
          throw new Error('Email atau password salah (min. 6 karakter).');
        }
        const u = MOCK_USERS[key] || { name: key.split('@')[0], role: 'Viewer' };
        localStorage.setItem('loggedIn', 'true');
        localStorage.setItem('userEmail', key);
        localStorage.setItem('userName', u.name);
        localStorage.setItem('userRole', u.role);
        const session = { email: key, name: u.name, role: u.role };
        setUser(session);
        return session;
      },
      logout() {
        ['loggedIn', 'userEmail', 'userName', 'userRole'].forEach((k) =>
          localStorage.removeItem(k)
        );
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
