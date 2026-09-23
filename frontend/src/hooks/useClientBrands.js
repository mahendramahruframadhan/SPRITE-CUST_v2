// Hook halaman Client & Brand: backend sebagai sumber kebenaran bila terjangkau,
// localStorage sebagai fallback offline (halaman tetap bisa dipakai tanpa backend).
// Context7 react: useState lazy init + useEffect untuk efek samping async,
// useMemo untuk turunan; backend NestJS + Drizzle via lib/api.js.
// TODO(backend): done — GET/POST/PATCH/DELETE /api/clients dan /api/brand-status.
import { useEffect, useMemo, useState } from 'react';
import { createBrandStatus, deleteBrandStatus, getBrandStatuses, patchBrandStatus } from '../lib/api.js';

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

// Contoh bawaan persis format tim finance (fallback offline + tombol contoh).
export const SEED_MONTHLY = ['Chambers', 'Inspired', 'SCH', 'Skaters', 'Tendencies', 'Screamous'];

export const SEED_FREE = [
  { brand: 'Flora Dera', expiredAt: '2026-10-06' },
  { brand: 'Nusantara Batavia Internasional (NBI)', expiredAt: '2026-10-10' },
  { brand: 'AWW Fashion Kauman (SR)', expiredAt: '2026-12-19' },
  { brand: 'House Of Shopaholic (Solo)', expiredAt: '2027-01-13' },
  { brand: 'Helter', expiredAt: '2027-01-27' },
  { brand: 'Wispie Indonesia Maju', expiredAt: '2027-04-06' },
  { brand: 'Own Store', expiredAt: '2027-04-24' },
  { brand: 'Betterhalf', expiredAt: '2027-05-26' },
  { brand: 'Smith (Modul Produksi)', expiredAt: '2027-06-15' },
];

function buildSeedStatuses() {
  const now = new Date().toISOString();
  return [
    ...SEED_MONTHLY.map((brand, i) => ({ id: `seed-monthly-${i}`, brand, type: 'MONTHLY', createdAt: now, updatedAt: now })),
    ...SEED_FREE.map(({ brand, expiredAt }, i) => ({ id: `seed-free-${i}`, brand, type: 'GRATIS', expiredAt, createdAt: now, updatedAt: now })),
  ];
}

// Baris snake_case backend (brand_statuses) ke bentuk camelCase halaman.
function mapRow(r) {
  return {
    id: r.id,
    brand: r.brand,
    type: r.type,
    startAt: r.start_at || '',
    expiredAt: r.expired_at || '',
    monthlyFee: r.monthly_fee ?? '',
    pic: r.pic || '',
    note: r.note || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function isDupeErr(e) {
  return e?.status === 409 || e?.code === 'BRAND_EXISTS';
}

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
  // Contoh finance langsung jadi isi awal saat browser belum pernah menyimpan;
  // data pengguna yang sudah ada (termasuk array kosong) tetap dihormati.
  const [clients, setClients] = useState(() => loadLS(CLIENT_KEY, []));
  const [statuses, setStatuses] = useState(() => {
    try {
      const raw = localStorage.getItem(STATUS_KEY);
      if (raw === null) return buildSeedStatuses();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : buildSeedStatuses();
    } catch {
      return buildSeedStatuses();
    }
  });
  const [ready, setReady] = useState(false);
  // null = belum tahu, true = backend terjangkau, false = mode offline lokal.
  const [serverOk, setServerOk] = useState(null);

  useEffect(() => {
    setReady(true);
  }, []);

  // Sinkron awal: backend menang bila mengembalikan data (non-kosong).
  useEffect(() => {
    let ignore = false;
    getBrandStatuses()
      .then((rows) => {
        if (ignore) return;
        if (Array.isArray(rows) && rows.length) setStatuses(rows.map(mapRow));
        setServerOk(true);
      })
      .catch(() => {
        if (!ignore) setServerOk(false);
      });
    return () => {
      ignore = true;
    };
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

  async function addStatus(payload) {
    if (serverOk !== false) {
      try {
        const r = await createBrandStatus(payload);
        const row = { id: r?.data?.id || uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...payload };
        setStatuses((prev) => [row, ...prev]);
        setServerOk(true);
        return row;
      } catch {
        setServerOk(false);
      }
    }
    const row = { id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...payload };
    setStatuses((prev) => [row, ...prev]);
    return row;
  }

  async function updateStatus(id, patch) {
    if (serverOk !== false) {
      try {
        await patchBrandStatus(id, patch);
        setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
        setServerOk(true);
        return;
      } catch {
        setServerOk(false);
      }
    }
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
  }

  async function removeStatus(id) {
    if (serverOk !== false) {
      try {
        await deleteBrandStatus(id);
        setStatuses((prev) => prev.filter((s) => s.id !== id));
        setServerOk(true);
        return;
      } catch {
        setServerOk(false);
      }
    }
    setStatuses((prev) => prev.filter((s) => s.id !== id));
  }

  // Isi contoh finance: ke server bila terjangkau (409 = sudah ada, lewati),
  // gabung lokal bila offline.
  async function seedExamples() {
    if (serverOk !== false) {
      try {
        for (const brand of SEED_MONTHLY) {
          try {
            await createBrandStatus({ brand, type: 'MONTHLY' });
          } catch (e) {
            if (!isDupeErr(e)) throw e;
          }
        }
        for (const { brand, expiredAt } of SEED_FREE) {
          try {
            await createBrandStatus({ brand, type: 'GRATIS', expiredAt });
          } catch (e) {
            if (!isDupeErr(e)) throw e;
          }
        }
        const rows = await getBrandStatuses();
        if (Array.isArray(rows) && rows.length) setStatuses(rows.map(mapRow));
        setServerOk(true);
        return;
      } catch {
        setServerOk(false);
      }
    }
    setStatuses((prev) => {
      const have = new Set(prev.map((s) => `${s.type}::${String(s.brand).trim().toLowerCase()}`));
      const out = [...prev];
      SEED_MONTHLY.forEach((brand) => {
        if (!have.has(`MONTHLY::${brand.toLowerCase()}`)) {
          out.unshift({ id: uid(), brand, type: 'MONTHLY', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      });
      SEED_FREE.forEach(({ brand, expiredAt }) => {
        if (!have.has(`GRATIS::${brand.toLowerCase()}`)) {
          out.unshift({ id: uid(), brand, type: 'GRATIS', expiredAt, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      });
      return out;
    });
  }

  return {
    ready,
    serverOk,
    clients,
    statuses,
    stats,
    addClient,
    removeClient,
    addStatus,
    updateStatus,
    removeStatus,
    seedExamples,
  };
}
