import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getPerms } from '../lib/api.js';

// Matriks default — cermin backend src/db/init.ts ROLE_PERMS. Super Admin
// selalu penuh (dikunci backend + bypass di can()).
export const DEFAULT_PERMS = {
  'Super Admin': { dashboard: 1, cases: 1, form: 1, hrreport: 1, cfg: 1, billing: 1, finance: 1, mockup: 1, roles: 1 },
  'Admin CS': { dashboard: 1, cases: 1, form: 1, hrreport: 1, cfg: 1, billing: 1, finance: 0, mockup: 1, roles: 0 },
  Support: { dashboard: 1, cases: 1, form: 1, hrreport: 1, cfg: 0, billing: 0, finance: 0, mockup: 0, roles: 0 },
  Finance: { dashboard: 1, cases: 0, form: 0, hrreport: 0, cfg: 0, billing: 1, finance: 1, mockup: 0, roles: 0 },
  Viewer: { dashboard: 1, cases: 1, form: 0, hrreport: 0, cfg: 0, billing: 0, finance: 0, mockup: 0, roles: 0 },
};

// Path route → modul izin (menu /kasus memakai modul 'cases')
export const ROUTE_PERM = {
  '/dashboard': 'dashboard',
  '/kasus': 'cases',
  '/mockup': 'mockup',
  '/form': 'form',
  '/hrreport': 'hrreport',
  '/cfg': 'cfg',
  '/billing': 'billing',
  '/finance': 'finance',
  '/roles': 'roles',
};

// id menu sidebar → modul izin
export const menuPerm = (menuId) => (menuId === 'kasus' ? 'cases' : menuId);

function loadLS() {
  try {
    return JSON.parse(localStorage.getItem('appPerms')) || structuredClone(DEFAULT_PERMS);
  } catch {
    return structuredClone(DEFAULT_PERMS);
  }
}

// Cache modul agar semua guard/menu berbagi 1x fetch
let permsCache = null;
export function fetchPerms() {
  if (!permsCache) {
    permsCache = getPerms().catch((e) => {
      permsCache = null;
      throw e;
    });
  }
  return permsCache;
}

export function usePermissions() {
  const { user } = useAuth();
  const [perms, setPerms] = useState(loadLS);

  useEffect(() => {
    let ignore = false;
    fetchPerms()
      .then((r) => {
        if (!ignore && r && r.perms && Object.keys(r.perms).length) {
          setPerms(r.perms);
          localStorage.setItem('appPerms', JSON.stringify(r.perms));
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const role = user?.role || 'Viewer';
  const can = (mod) => role === 'Super Admin' || !!perms?.[role]?.[mod];
  return { perms, role, can };
}
