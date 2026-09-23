// Hook frontend-only untuk halaman Client & Brand.
// Context7 react: useState lazy init + useEffect untuk sinkronisasi efek samping,
// useMemo untuk turunan yang dihitung ulang hanya saat dependensi berubah.
// Sengaja TANPA backend (permintaan: frontend dulu). Persistensi via localStorage.
// TODO(backend): ganti loadLS/saveLS dengan GET/POST /api/clients dan /api/brand-status.
import { useEffect, useMemo, useState } from 'react';

const CLIENT_KEY = 'sprite.clients.v1';
const STATUS_KEY = 'sprite.brandStatus.v1';

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export const STATUS_TYPES = ['MONTHLY', 'BARU', 'GRATIS'];

export function daysLeft(expiredAt) {
  if (!expiredAt) return null;
  const end = new Date(`${expiredAt}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - now) / 86400000);
}

export function expiryState(expiredAt) {
  const d = daysLeft(expiredAt);
  if (d === null) return 'unknown';
  if (d < 0) return 'expired';
  if (d <= 30) return 'soon';
  return 'active';
}

export function useClientBrands() {
  // Lazy init agar baca localStorage sekali (pola Context7 react).
  const [clients, setClients] = useState(() => loadLS(CLIENT_KEY, []));
  const [statuses, setStatuses] = useState(() => loadLS(STATUS_KEY, []));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(CLIENT_KEY, JSON.stringify(clients));
    } catch {
      // Kuota penuh / mode privat: abaikan, state memori tetap jalan.
    }
  }, [clients, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
    } catch {
      // Sama seperti di atas.
    }
  }, [statuses, ready]);

  const stats = useMemo(() => {
    const monthly = statuses.filter((s) => s.type === 'MONTHLY').length;
    const gratis = statuses.filter((s) => s.type === 'GRATIS' && expiryState(s.expiredAt) !== 'expired').length;
    const baru = statuses.filter((s) => s.type === 'BARU').length;
    return {
      totalBrand: new Set([...clients.map((c) => c.brand), ...statuses.map((s) => s.brand)].filter(Boolean)).size,
      totalClient: clients.length,
      monthly,
      gratis,
      baru,
    };
  }, [clients, statuses]);

  function addClient(payload) {
    const row = { id: uid(), createdAt: new Date().toISOString(), ...payload };
    setClients((prev) => [row, ...prev]);
    return row;
  }

  function removeClient(id) {
    setClients((prev) => prev.filter((c) => c.id !== id));
  }

  function addStatus(payload) {
    const row = {
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...payload,
    };
    setStatuses((prev) => [row, ...prev]);
    return row;
  }

  function updateStatus(id, patch) {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
  }

  function removeStatus(id) {
    setStatuses((prev) => prev.filter((s) => s.id !== id));
  }

  return {
    ready,
    clients,
    statuses,
    stats,
    addClient,
    removeClient,
    addStatus,
    updateStatus,
    removeStatus,
  };
}
