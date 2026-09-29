// Matriks izin default (cermin backend ROLE_PERMS) + pemetaan route/id menu
// ke modul izin. Terpisah dari hook usePermissions (yang menarik AuthContext
// ber-JSX) supaya bisa diuji murni dengan node --test.
export const DEFAULT_PERMS = {
  'Super Admin': { dashboard: 1, cases: 1, form: 1, clients: 1, hrreport: 1, cfg: 1, popinava: 1, billing: 1, finance: 1, mockup: 1, roles: 1, logs: 1, settings: 1 },
  'Admin CS': { dashboard: 1, cases: 1, form: 1, clients: 1, hrreport: 1, cfg: 1, popinava: 1, billing: 1, finance: 0, mockup: 1, roles: 0, logs: 1, settings: 1 },
  Support: { dashboard: 1, cases: 1, form: 1, clients: 0, hrreport: 1, cfg: 0, popinava: 0, billing: 0, finance: 0, mockup: 0, roles: 0, logs: 0, settings: 1 },
  Finance: { dashboard: 1, cases: 0, form: 0, clients: 1, hrreport: 0, cfg: 0, popinava: 0, billing: 1, finance: 1, mockup: 0, roles: 0, logs: 1, settings: 1 },
  Viewer: { dashboard: 1, cases: 1, form: 0, clients: 0, hrreport: 0, cfg: 0, popinava: 0, billing: 0, finance: 0, mockup: 0, roles: 0, logs: 0, settings: 1 },
};

// Path route → modul izin (menu /kasus memakai modul 'cases')
export const ROUTE_PERM = {
  '/dashboard': 'dashboard',
  '/kasus': 'cases',
  '/mockup': 'mockup',
  '/form': 'form',
  '/clients': 'clients',
  '/hrreport': 'hrreport',
  '/cfg': 'cfg',
  '/popinava': 'popinava',
  '/billing': 'billing',
  '/finance': 'finance',
  '/roles': 'roles',
  '/logs': 'logs',
  '/settings': 'settings',
};

// id menu sidebar → modul izin
export const menuPerm = (menuId) => (menuId === 'kasus' ? 'cases' : menuId);
