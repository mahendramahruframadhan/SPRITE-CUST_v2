// Lapisan API frontend → backend NestJS.
// Context7 /vitejs/vite: hanya var berprefix VITE_ yang terekspos via import.meta.env.
// Default '/api' (di-proxy vite.config.js ke backend) → tanpa config & bebas CORS saat dev.
import { get as storageGet, set as storageSet, remove as storageRemove } from './storage.js';

// ?. karena import.meta.env hanya ada di Vite; unit test node --test mengimpor
// modul ini tanpa bundler dan harus tetap bisa jalan.
export const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

// Sesi cookie httpOnly (M3): browser mengirim cookie otomatis via
// credentials:include — token TIDAK PERNAH disimpan di localStorage atau
// dikirim via header (menutup jalur eksfiltrasi XSS). Backend
// (PermGuard) memvalidasi cookie sesi ini; x-user-email hanya display.
// Anti-redirect-ganda bila banyak request 401 bersamaan.
let redirectingToLogin = false;

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-user-email': storageGet('userEmail', '') };
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...opts,
    ...(opts.body && typeof opts.body !== 'string' ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (res.status === 401) {
    // Sesi mati/dicabut (backend: SESSION_EXPIRED) — bersihkan sesi basi,
    // arahkan login ulang SEKALI (anti-loop bila sudah di /login), lalu
    // lempar error ramah agar pemanggil tak lanjut dengan state basi.
    storageRemove('loggedIn', 'userEmail', 'userName', 'userRole', 'authToken');
    try {
      sessionStorage.setItem('sessionExpired', '1');
    } catch {}
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !redirectingToLogin) {
      redirectingToLogin = true;
      window.location.href = '/login';
    }
    const err = new Error('Sesi berakhir — silakan login lagi.');
    err.status = 401;
    err.code = 'SESSION_EXPIRED';
    throw err;
  }
  if (!res.ok) {
    // Teruskan pesan backend (mis. { code: 'EMAIL_TAKEN', message }) agar
    // halaman (registrasi, roles) bisa menampilkan alasan yang tepat.
    // 403 di sini = sesi VALID tapi modul tak diizinkan (bukan sesi mati).
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
// Imp#2: config AI terpisah dari config umum — key tak pernah lewat /config.
export const getConfigAi = (key) => get(`/config/ai?k=${encodeURIComponent(key || 'aiConnections')}`);
export const putConfigAi = (config, key) => put('/config/ai', { key: key || 'aiConnections', config });
export const getStatusOptions = () => get('/config/status-options');
export const putStatusOptions = (body) => put('/config/status-options', body);
export const renameStatusOption = (body) => patch('/config/status-options/rename', body);
export const getHealth = () => get('/health');
export const createCase = (body) => post('/cases', body);
export const patchAudit = (uuid, action) => patch(`/cases/${uuid}/audit`, { action });
export const patchInvoice = (uuid, status, extra = {}) => patch(`/cases/${uuid}/invoice`, { status, ...extra });
export const patchInvoiceMeta = (uuid, invoiceNo, keterangan) => patch(`/billing/invoice-meta/${uuid}`, { invoiceNo, keterangan });
export const getBillingStats = () => get('/billing/stats');
export const getInvoiceMap = () => get('/billing/invoice-map');
export const getAuditMap = () => get('/billing/audit-map');
export const getTaxMap = () => get('/billing/tax-map');
export const patchTax = (uuid, body) => patch(`/cases/${uuid}/tax`, body);
export const triggerSync = () => post('/sync/trigger', {});
export const getSyncLogs = () => get('/sync/logs');
export const signIn = (email, password) => post('/auth/sign-in/email', { email, password });
export const signUp = (email, password, name, role) => post('/auth/sign-up/email', { email, password, name, role });
export const signOut = () => post('/auth/sign-out', {});
export const getSession = () => get('/auth/session');
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
// POPI NAVA (master outlet, spec §9) — dipakai hook usePopinava hanya saat
// probe list sukses (/api/popinava ada); selain itu mode lokal.
export const getPopinava = (qs = '') => get(`/popinava${qs}`);
export const postAuditMark = (body) => post('/audit-schedule/mark', body);
export const getAuditHistory = (month, itemId) =>
  get(`/audit-schedule/history?month=${encodeURIComponent(month)}${itemId ? `&item_id=${encodeURIComponent(itemId)}` : ''}`);
export const postPopinava = (body) => post('/popinava', body);
export const patchPopinava = (uuid, body) => patch(`/popinava/${uuid}`, body);
export const deletePopinava = (uuid) => req(`/popinava/${uuid}`, { method: 'DELETE' });
export const postPopinavaBulk = (body) => post('/popinava/bulk', body);
// Riwayat aktivitas 1 outlet (activity_logs by record_uuid): kapan & siapa.
export const getPopinavaHistory = (uuid) => get(`/popinava/${encodeURIComponent(uuid)}/history`);
// Log aktivitas POPI NAVA (kategori 'popinava', urut terbaru) — khusus Super Admin.
export const getPopinavaLogs = (limit) => get(`/popinava/logs${limit ? `?limit=${encodeURIComponent(limit)}` : ''}`);

// Analitik backend (overview agregasi + drilldown paginated server-side).
export async function fetchAnalyticsOverview({ from = '', to = '', brand = '', module = '' } = {}) {
  const qs = `${from ? `?from=${encodeURIComponent(from)}` : '?from=1970-01-01'}${to ? `&to=${encodeURIComponent(to)}` : '&to=2999-12-31'}${brand ? `&brand=${encodeURIComponent(brand)}` : ''}${module ? `&module=${encodeURIComponent(module)}` : ''}`;
  return get(`/analytics/overview${qs}`);
}
export async function fetchAnalyticsDrilldown({ dim = '', key = '', from = '', to = '', q = '', page = 1, limit = 10, brand = '', module = '' } = {}) {
  const p = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (dim) p.set('dim', dim);
  if (key) p.set('key', key);
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  if (q) p.set('q', q);
  if (brand) p.set('brand', brand);
  if (module) p.set('module', module);
  return get(`/analytics/drilldown?${p.toString()}`);
}

// GET /api/cases dengan filter group KPI server-side.
export async function fetchCasesByGroupKpi(groupKpi = '') {
  const qs = groupKpi ? `&groupKpi=${encodeURIComponent(groupKpi)}` : '';
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

// Screenshot audit POPI/NAVA — presigned R2, pola sama seperti PDF invoice.
export const requestShotUploadUrl = (body) => post('/popinava/audit-shots/upload-url', body);
export const confirmShotUpload = (body) => post('/popinava/audit-shots/confirm', body);
export const listShotsByOutlet = (uuid) => get(`/popinava/audit-shots/by-outlet/${uuid}`);
export const requestShotDownloadUrl = (id, opts = {}) => get(`/popinava/audit-shots/${id}/download-url${opts.inline ? '?inline=1' : ''}`);
export const deleteShot = (id) => req(`/popinava/audit-shots/${id}`, { method: 'DELETE' });
