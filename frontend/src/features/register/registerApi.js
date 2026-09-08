// Lapisan API registrasi — terintegrasi dengan backend yang sudah
// diimplementasikan (backend/src/setup/setup.controller.ts +
// backend/src/auth/auth.controller.ts).
//
// Alur: daftar HANYA menyimpan ke DB, lalu frontend mengarahkan ke /login
// agar pengguna mengisi email & password dan login dari sana.
//   GET  /api/setup/status        → { firstRun, userCount }
//   POST /api/setup/first-admin   → 201 { user } (akun pertama, Super Admin)
//   POST /api/auth/sign-up/email  → 201 { user } (reguler, role Viewer)
// Error backend: { code, message, fields? } dengan status 400/409/429.
//
// Kompatibilitas: bila backend lama tanpa /setup/* (404
// ENDPOINT_NOT_IMPLEMENTED), akun pertama fallback ke sign-up reguler agar
// UI tetap bisa dipakai. Mode demo offline: ?demo=1.

import { API_BASE, signUp as apiSignUp } from '../../lib/api.js';
import { normalizeEmail } from './validation.js';

const FIRST_RUN_KEY = 'sprite_first_run_done';

async function tryJson(path, opts) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', 'x-user-email': localStorage.getItem('userEmail') || '' },
      ...opts,
      ...(opts?.body && typeof opts.body !== 'string'
        ? { body: JSON.stringify(opts.body) }
        : {}),
    });
  } catch {
    const err = new Error('Backend tidak terjangkau — pastikan backend jalan di port 5005.');
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.status === 404 && path.startsWith('/setup/')) {
    const err = new Error('ENDPOINT_NOT_IMPLEMENTED');
    err.code = 'ENDPOINT_NOT_IMPLEMENTED';
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(friendlyMessage(data, res.status, path));
    err.code = data?.code || `HTTP_${res.status}`;
    err.status = res.status;
    err.fields = data?.fields;
    err.data = data;
    throw err;
  }
  return data;
}

function friendlyMessage(data, status, path) {
  if (data?.message) return data.message;
  if (status === 409) return 'Email sudah terdaftar. Silakan login.';
  if (status === 429) return 'Terlalu banyak percobaan. Coba lagi semenit lagi.';
  return `Pendaftaran gagal (API ${status}: ${path}).`;
}

function isDemoMode() {
  try {
    return new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
}

/**
 * Cek apakah ini instalasi fresh (belum ada user sama sekali).
 * Resolve selalu — tidak pernah throw — agar halaman tetap render offline.
 */
export async function getSetupStatus() {
  if (isDemoMode()) {
    const done = localStorage.getItem(FIRST_RUN_KEY) === 'true';
    return { firstRun: !done, userCount: done ? 1 : 0, source: 'demo' };
  }
  try {
    const r = await tryJson('/setup/status');
    return {
      firstRun: Boolean(r.firstRun ?? r.userCount === 0),
      userCount: Number(r.userCount ?? (r.firstRun ? 0 : 1)),
      source: 'backend',
    };
  } catch {
    // Backend lama / mati → anggap BUKAN first-run agar alur normal tetap jalan,
    // kecuali user eksplisit memaksa ?firstrun=1 untuk preview akun pertama.
    try {
      if (new URLSearchParams(window.location.search).has('firstrun')) {
        return { firstRun: true, userCount: 0, source: 'query-override' };
      }
    } catch {
      /* abaikan */
    }
    return { firstRun: false, userCount: -1, source: 'fallback-legacy' };
  }
}

/**
 * Daftarkan AKUN PERTAMA (Super Admin, dikunci di sisi server).
 * Payload: { name, email, password } → resolve { user, source }.
 * Hanya menyimpan ke DB — TANPA auto-login (caller mengarahkan ke /login).
 */
export async function registerFirstAccount({ name, email, password }) {
  const payload = {
    name: (name || '').trim(),
    email: normalizeEmail(email),
    password,
  };
  if (isDemoMode()) {
    await new Promise((r) => setTimeout(r, 600));
    localStorage.setItem(FIRST_RUN_KEY, 'true');
    return {
      user: { ...payload, role: 'Super Admin', id: 'demo-first-admin' },
      source: 'demo',
    };
  }
  try {
    const r = await tryJson('/setup/first-admin', {
      method: 'POST',
      body: payload,
    });
    localStorage.setItem(FIRST_RUN_KEY, 'true');
    return { user: r.user || r, source: 'backend' };
  } catch (err) {
    if (err?.code === 'ENDPOINT_NOT_IMPLEMENTED') {
      // Backend lama tanpa /setup/* → fallback sign-up reguler.
      return { ...(await registerAccount(payload)), source: 'fallback-legacy' };
    }
    throw err;
  }
}

/**
 * Daftarkan akun REGULER (role awal Viewer, admin menaikkan di /roles).
 * Payload: { name, email, password } → resolve { user, source }.
 * Hanya menyimpan ke DB — TANPA auto-login (caller mengarahkan ke /login).
 */
export async function registerAccount({ name, email, password }) {
  const payload = {
    name: (name || '').trim(),
    email: normalizeEmail(email),
    password,
  };
  if (isDemoMode()) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      user: { ...payload, role: 'Viewer', id: 'demo-user' },
      source: 'demo',
    };
  }
  try {
    const r = await apiSignUp(payload.email, payload.password, payload.name);
    if (!r?.user) throw new Error('Pendaftaran gagal — coba lagi.');
    return { user: r.user, source: 'backend' };
  } catch (err) {
    if (err?.code === 'EMAIL_TAKEN') throw new Error('Email sudah terdaftar. Silakan login.');
    throw err instanceof Error ? err : new Error('Pendaftaran gagal — pastikan backend jalan.');
  }
}
