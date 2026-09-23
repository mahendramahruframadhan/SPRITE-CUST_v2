// Hook halaman Client & Brand: backend sumber kebenaran bila terjangkau,
// localStorage fallback offline (halaman tetap bisa dipakai tanpa backend).
// Root cause fix (temuan 1-3): error HTTP (400/404/409) BUKAN offline — hanya
// gagal jaringan (tanpa status) yang memakai jalur lokal; error server
// dilempar ke halaman agar toast jujur, bukan sukses palsu.
// Context7 react: lazy init + efek async berpenjaga + useMemo turunan.
import { useEffect, useMemo, useState } from 'react';
import {
  createBrandStatus,
  deleteBrandStatus,
  getBrandStatuses,
  patchBrandStatus,
  createClient,
  deleteClient,
  getClients,
} from '../lib/api.js';
import { expiryState, normalizeBrand } from '../utils/contract.js';

const CLIENT_KEY = 'sprite.clients.v1';
const STATUS_KEY = 'sprite.brandStatus.v1';

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readLS(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLS(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Kuota penuh / mode privat: state memori tetap jalan.
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

// Baris snake_case backend ke camelCase halaman.
function mapStatusRow(r) {
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

function mapClientRow(r) {
  return {
    id: r.id,
    brand: r.brand,
    company: r.company || '',
    pic: r.pic || '',
    contact: r.contact || '',
    joinedAt: r.joined_at || '',
    source: r.source || '',
    note: r.note || '',
    createdAt: r.created_at,
  };
}

// Id serverdiawali bs_/cl_/seed-bs-; sisanya baris lokal (offline/seed awal).
const isServerStatusId = (id) => /^(bs_|seed-bs-)/.test(String(id || ''));
const isServerClientId = (id) => String(id || '').startsWith('cl_');
const isSeedId = (id) => String(id || '').startsWith('seed-');

// Gagal jaringan (fetch melempar tanpa status) vs error HTTP server.
function isOfflineErr(e) {
  return !e || (e.status === undefined && e.code === undefined);
}

function isDupeErr(e) {
  return e?.status === 409 || e?.code === 'BRAND_EXISTS';
}

export function useClientBrands() {
  const [clients, setClients] = useState(() => readLS(CLIENT_KEY));
  const [statuses, setStatuses] = useState(() => {
    const raw = (() => {
      try {
        return localStorage.getItem(STATUS_KEY);
      } catch {
        return '[]';
      }
    })();
    if (raw === null) return buildSeedStatuses();
    try {
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

  // Sinkron penuh dengan server: adopsi data server (bila non-kosong),
  // dorong naik baris lokal buatan user, lalu baca ulang.
  async function syncWithServer() {
    const rows = await getBrandStatuses();
    if (Array.isArray(rows) && rows.length) setStatuses(rows.map(mapStatusRow));
    try {
      const crows = await getClients();
      if (Array.isArray(crows) && crows.length) setClients(crows.map(mapClientRow));
    } catch {
      // Koleksi client opsional: status kontrak yang utama.
    }
    const local = readLS(STATUS_KEY).filter(
      (s) => s && !isServerStatusId(s.id) && !isSeedId(s.id)
    );
    let pushed = 0;
    for (const u of local) {
      try {
        await createBrandStatus({
          brand: u.brand,
          type: u.type,
          startAt: u.startAt,
          expiredAt: u.expiredAt,
          monthlyFee: u.monthlyFee,
          pic: u.pic,
          note: u.note,
        });
        pushed++;
      } catch (e) {
        if (isOfflineErr(e)) throw e;
        // 409/400 per baris: lewati satu baris, lanjutkan sisanya.
      }
    }
    const clocal = readLS(CLIENT_KEY).filter((c) => c && !isServerClientId(c.id));
    for (const u of clocal) {
      try {
        await createClient(u);
        pushed++;
      } catch (e) {
        if (isOfflineErr(e)) throw e;
      }
    }
    if (pushed) {
      const rows2 = await getBrandStatuses();
      if (Array.isArray(rows2) && rows2.length) setStatuses(rows2.map(mapStatusRow));
      try {
        const crows2 = await getClients();
        if (Array.isArray(crows2) && crows2.length) setClients(crows2.map(mapClientRow));
      } catch {
        // Koleksi ikut dibaca ulang bila ada; gagal baca client tidak fatal.
      }
    }
  }

  // Sinkron awal saat mount.
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        await syncWithServer();
        if (!ignore) setServerOk(true);
      } catch (e) {
        if (!ignore) setServerOk(isOfflineErr(e) ? false : true);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Coba-lagi manual (tombol saat offline). Resolve true bila tersambung.
  async function retryConnection() {
    try {
      await syncWithServer();
      setServerOk(true);
      return true;
    } catch (e) {
      setServerOk(isOfflineErr(e) ? false : true);
      return isOfflineErr(e) ? false : true;
    }
  }

  useEffect(() => {
    if (ready) writeLS(CLIENT_KEY, clients);
  }, [clients, ready]);

  useEffect(() => {
    if (ready) writeLS(STATUS_KEY, statuses);
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

  async function addClient(payload) {
    const body = { brand: normalizeBrand(payload.brand), company: payload.company || '', pic: payload.pic || '', contact: payload.contact || '' };
    if (serverOk !== false) {
      try {
        const r = await createClient(body);
        const row = { id: r?.data?.id || uid(), createdAt: new Date().toISOString(), ...body };
        setClients((prev) => [row, ...prev]);
        setServerOk(true);
        return row;
      } catch (e) {
        if (!isOfflineErr(e)) throw e;
        setServerOk(false);
      }
    }
    const row = { id: uid(), createdAt: new Date().toISOString(), ...body };
    setClients((prev) => [row, ...prev]);
    return row;
  }

  async function removeClient(id) {
    if (serverOk !== false) {
      try {
        await deleteClient(id);
        setClients((prev) => prev.filter((c) => c.id !== id));
        setServerOk(true);
        return;
      } catch (e) {
        if (isOfflineErr(e)) {
          setServerOk(false);
        } else if (e?.status === 404) {
          // Baris hanya ada lokal: hapus lokal, server tetap dianggap OK.
          setClients((prev) => prev.filter((c) => c.id !== id));
          return;
        } else {
          throw e;
        }
      }
    }
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
      } catch (e) {
        if (!isOfflineErr(e)) throw e;
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
      } catch (e) {
        if (isOfflineErr(e)) {
          setServerOk(false);
        } else if (e?.status === 404) {
          setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
          return;
        } else {
          throw e;
        }
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
      } catch (e) {
        if (isOfflineErr(e)) {
          setServerOk(false);
        } else if (e?.status === 404) {
          setStatuses((prev) => prev.filter((s) => s.id !== id));
          return;
        } else {
          throw e;
        }
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
        if (Array.isArray(rows) && rows.length) setStatuses(rows.map(mapStatusRow));
        setServerOk(true);
        return;
      } catch (e) {
        if (!isOfflineErr(e)) throw e;
        setServerOk(false);
      }
    }
    setStatuses((prev) => {
      const have = new Set(prev.map((s) => `${s.type}::${normalizeBrand(s.brand).toLowerCase()}`));
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
    retryConnection,
  };
}
