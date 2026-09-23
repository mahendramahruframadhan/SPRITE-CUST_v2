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
  if (!res.ok) {
    // Teruskan pesan backend (mis. { code: 'EMAIL_TAKEN', message }) agar
    // halaman (registrasi, roles) bisa menampilkan alasan yang tepat.
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const err = new Error(data?.message || `API ${res.status}: ${path}`);
    err.status = res.status;
    err.code = data?.code;
    err.fields = data?.fields;
    err.data = data;
    throw err;
  }
  return res.json();
}

export const get = (p) => req(p);
export const post = (p, body) => req(p, { method: 'POST', body });
export const put = (p, body) => req(p, { method: 'PUT', body });
export const patch = (p, body) => req(p, { method: 'PATCH', body });

// GET /api/cases (limit max 100) → gabung semua halaman. Cache modul agar
// semua halaman berbagi 1x fetch; reload() memaksa fetch ulang.
// Halaman 2..N diambil PARALEL (bukan serial) — 21 halaman: ~16 dtk → ~2 dtk.
let allCache = null;
export function fetchAllCases() {
  if (!allCache) {
    allCache = (async () => {
      const first = await get('/cases?page=1&limit=100');
      const out = [...(first.data || [])];
      const totalPages = first.totalPages || 1;
      if (totalPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => get(`/cases?page=${i + 2}&limit=100`))
        );
        rest.forEach((r) => out.push(...(r.data || [])));
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

// GET /api/cases dengan filter rentang tanggal server-side (WHERE date_issue).
// Dipakai pemilih bulan (Billing): DB yang memfilter, bukan browser.
// Tanpa cache global (rentang bervariasi); halaman 2..N diambil paralel.
export async function fetchCasesRange({ from = '', to = '' } = {}) {
  const qs = `${from ? `&from=${encodeURIComponent(from)}` : ''}${to ? `&to=${encodeURIComponent(to)}` : ''}`;
  const first = await get(`/cases?page=1&limit=100${qs}`);
  const out = [...(first.data || [])];
  const totalPages = first.totalPages || 1;
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => get(`/cases?page=${i + 2}&limit=100${qs}`))
    );
    rest.forEach((r) => out.push(...(r.data || [])));
  }
  return out;
}

export const getMasters = () => get('/masters');
export const getConfig = (key) => get(key ? `/config?key=${encodeURIComponent(key)}` : '/config');
export const putConfig = (config, key) => put('/config', key ? { key, config } : { config });
export const getStatusOptions = () => get('/config/status-options');
export const putStatusOptions = (body) => put('/config/status-options', body);
export const renameStatusOption = (body) => patch('/config/status-options/rename', body);
export const getHealth = () => get('/health');
export const createCase = (body) => post('/cases', body);
export const patchAudit = (uuid, action) => patch(`/cases/${uuid}/audit`, { action });
export const patchInvoice = (uuid, status) => patch(`/cases/${uuid}/invoice`, { status });
export const getBillingStats = () => get('/billing/stats');
export const getInvoiceMap = () => get('/billing/invoice-map');
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
export const postLog = (who, action, extra = {}) => post('/roles/logs', { who, action, ...extra });
export const chatAi = (messages, connectionId) => post('/ai/chat', connectionId ? { messages, connectionId } : { messages });
export const getAiConnections = () => get('/ai/connections');
// PDF invoice (R2 presigned URL). Upload file via PUT langsung ke URL R2,
// bukan lewat body API (lihat backend/src/pdf).
export const requestPdfUploadUrl = (body) => post('/pdf/upload-url', body);
export const confirmPdfUpload = (body) => post('/pdf/confirm', body);
export const listPdfsByCase = (uuid) => get(`/pdf/by-case/${uuid}`);
export const getPdfState = (uuid) => get(`/pdf/state/${uuid}`);
export const getPdfHistory = (uuid) => get(`/pdf/history/${uuid}`);
export const requestPdfDownloadUrl = (id, opts = {}) => get(`/pdf/${id}/download-url${opts.inline ? '?inline=1' : ''}`);
export const deletePdf = (id) => req(`/pdf/${id}`, { method: 'DELETE' });
// Client & Brand (kontrak monthly vs maintenance). Backend sumber kebenaran bila
// terjangkau; hook useClientBrands memakai localStorage sebagai fallback offline.
export const getClients = () => get('/clients');
export const createClient = (body) => post('/clients', body);
export const patchClient = (id, body) => patch(`/clients/${id}`, body);
export const deleteClient = (id) => req(`/clients/${id}`, { method: 'DELETE' });
export const getBrandStatuses = () => get('/brand-status');
export const createBrandStatus = (body) => post('/brand-status', body);
export const patchBrandStatus = (id, body) => patch(`/brand-status/${id}`, body);
export const deleteBrandStatus = (id) => req(`/brand-status/${id}`, { method: 'DELETE' });
