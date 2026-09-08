import { postLog } from './api.js';

// Pencatatan aktivitas ringan (frontend-first):
// - tersimpan instan di localStorage `appActivityLog` (max 200)
// - diteruskan ke backend POST /roles/logs (activity_logs) bila terjangkau
const KEY = 'appActivityLog';
const MAX = 200;

export function currentWho() {
  try {
    return localStorage.getItem('userName') || localStorage.getItem('userEmail') || 'Admin';
  } catch {
    return 'Admin';
  }
}

export function recordActivity(action, detail = '', category = '') {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toISOString(),
    who: currentWho(),
    action,
    detail,
    category,
  };
  try {
    const prev = JSON.parse(localStorage.getItem(KEY)) || [];
    localStorage.setItem(KEY, JSON.stringify([entry, ...prev].slice(0, MAX)));
  } catch {}
  postLog(entry.who, action, { detail: detail || undefined, category: category || undefined }).catch(() => {});
  return entry;
}

export function readLocalActivity() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
