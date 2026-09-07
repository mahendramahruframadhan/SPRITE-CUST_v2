// Lapisan API frontend → backend NestJS.
// Context7 /vitejs/vite: hanya var berprefix VITE_ yang terekspos via import.meta.env.
// Default '/api' (di-proxy vite.config.js ke backend) → tanpa config & bebas CORS saat dev.
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function req(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    // x-user-email = identitas untuk PermGuard backend (diisi saat login)
    headers: { 'Content-Type': 'application/json', 'x-user-email': localStorage.getItem('userEmail') || '' },
    ...opts,
    ...(opts.body && typeof opts.body !== 'string' ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export const get = (p) => req(p);
export const post = (p, body) => req(p, { method: 'POST', body });
export const put = (p, body) => req(p, { method: 'PUT', body });
export const patch = (p, body) => req(p, { method: 'PATCH', body });

// GET /api/cases (limit max 100) → gabung semua halaman. Cache modul agar
// semua halaman berbagi 1x fetch; reload() memaksa fetch ulang.
let allCache = null;
export function fetchAllCases() {
  if (!allCache) {
    allCache = (async () => {
      const first = await get('/cases?page=1&limit=100');
      const out = [...(first.data || [])];
      for (let p = 2; p <= (first.totalPages || 1); p++) {
        const r = await get(`/cases?page=${p}&limit=100`);
        out.push(...(r.data || []));
      }
      return out;
    })().catch((e) => {
      allCache = null;
      throw e;
    });
  }
  return allCache;
}
export function reloadAllCases() {
  allCache = null;
  return fetchAllCases();
}

export const getMasters = () => get('/masters');
export const getConfig = (key) => get(key ? `/config?key=${encodeURIComponent(key)}` : '/config');
export const putConfig = (config, key) => put('/config', key ? { key, config } : { config });
export const createCase = (body) => post('/cases', body);
export const patchAudit = (uuid, action) => patch(`/cases/${uuid}/audit`, { action });
export const patchInvoice = (uuid, status) => patch(`/cases/${uuid}/invoice`, { status });
export const getBillingStats = () => get('/billing/stats');
export const triggerSync = () => post('/sync/trigger', {});
export const getSyncLogs = () => get('/sync/logs');
export const signIn = (email, password) => post('/auth/sign-in/email', { email, password });
export const signUp = (email, password, name, role) => post('/auth/sign-up/email', { email, password, name, role });
export const signOut = () => post('/auth/sign-out', {});
export const getUsers = () => get('/users');
export const patchUser = (id, body) => patch(`/users/${id}`, body);
export const deleteUser = (id) => req(`/users/${id}`, { method: 'DELETE' });
export const setUserPassword = (id, password) => post(`/users/${id}/password`, { password });
export const getPerms = () => get('/roles/permissions');
export const putPerms = (perms) => put('/roles/permissions', { perms });
export const getLogs = () => get('/roles/logs');
export const postLog = (who, action) => post('/roles/logs', { who, action });
