import { postLog } from './api.js';
import { get, getJSON, set as storageSet } from './storage.js';

// Pencatatan aktivitas ringan (frontend-first):
// - tersimpan instan di localStorage `appActivityLog` (max 200)
// - diteruskan ke backend POST /roles/logs (activity_logs) bila terjangkau
const KEY = 'appActivityLog';
const MAX = 200;

export function currentWho() {
  return get('userName') || get('userEmail') || 'Admin';
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
  const prev = getJSON(KEY, []);
  storageSet(KEY, [entry, ...(Array.isArray(prev) ? prev : [])].slice(0, MAX));
  postLog(entry.who, action, { detail: detail || undefined, category: category || undefined }).catch(() => {});
  return entry;
}

export function readLocalActivity() {
  const v = getJSON(KEY, []);
  return Array.isArray(v) ? v : [];
}
