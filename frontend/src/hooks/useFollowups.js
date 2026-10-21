// Hook Client Follow-Up: backend sumber kebenaran bila terjangkau
// (pola useClientBrands), localStorage fallback offline. TODO(backend) file
// lama (mode mock) diganti: fungsi public tetap sama, halaman & komponen
// tidak disentuh. Root cause fix pola useClientBrands: error HTTP (4xx)
// BUKAN offline — hanya gagal jaringan yang memakai jalur lokal; error
// server dilempar agar toast jujur.
import { useEffect, useMemo, useState } from 'react';
import {
  getFollowups,
  createFollowup,
  patchFollowup,
  deleteFollowup,
  addFollowupNote as addFollowupNoteApi,
} from '../lib/api.js';
import { getJSON, set as storageSet } from '../lib/storage.js';

const LS_KEY = 'sprite.followups.v1';

export const STATUSES = ['Open', 'Perlu Pengecekan', 'Menunggu Client', 'Selesai'];
export const PRIORITIES = ['Rendah', 'Sedang', 'Tinggi', 'Urgent'];

// Tanggal lokal browser, format YYYY-MM-DD (untuk penanda & urutan lokale).
export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Overdue = status bukan Selesai dan followupDate < hari ini (PRD §6).
// Server menghitung versinya sendiri (Asia/Jakarta) untuk filter/export.
export function isOverdue(r, today = todayStr()) {
  return Boolean(r) && r.status !== 'Selesai' && String(r.followupDate || '') < today;
}

export function isDueToday(r, today = todayStr()) {
  return Boolean(r) && r.status !== 'Selesai' && r.followupDate === today;
}

// Selisih hari keterlambatan (tanggal string YYYY-MM-DD aman dibanding langsung).
export function overdueDays(r, today = todayStr()) {
  const a = Math.round(Math.abs(new Date(`${today}T00:00:00`) - new Date(`${r.followupDate}T00:00:00`)) / 864e5);
  return isOverdue(r, today) ? a : 0;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function buildSeed() {
  const now = new Date().toISOString();
  return [
    {
      id: 'seed-fu-1', client: 'Inspired', issueDate: daysAgo(12), module: 'Produksi',
      title: 'Show All Produksi tidak bisa dibuka', description: 'Perlu pengecekan ulang di sisi client.',
      priority: 'Tinggi', status: 'Perlu Pengecekan', followupDate: daysAgo(9), pic: '',
      notes: [], resolvedAt: null, createdAt: now, updatedAt: now,
    },
    {
      id: 'seed-fu-2', client: 'Inspired', issueDate: daysAgo(6), module: 'Stok',
      title: 'Stok akhir tidak sama dengan kartu stok', description: '',
      priority: 'Sedang', status: 'Menunggu Client', followupDate: todayStr(), pic: '',
      notes: [], resolvedAt: null, createdAt: now, updatedAt: now,
    },
    {
      id: 'seed-fu-3', client: 'Chambers', issueDate: daysAgo(3), module: 'Keuangan',
      title: 'Laporan PPN selisih dengan faktur', description: '',
      priority: 'Urgent', status: 'Open', followupDate: daysAgo(-2), pic: '',
      notes: [], resolvedAt: null, createdAt: now, updatedAt: now,
    },
    {
      id: 'seed-fu-4', client: 'Skaters', issueDate: daysAgo(19), module: 'Penjualan',
      title: 'Cetak invoice terpotong', description: '',
      priority: 'Rendah', status: 'Selesai', followupDate: daysAgo(15),
      pic: '', notes: [], resolvedAt: daysAgo(10), createdAt: now, updatedAt: now,
    },
  ];
}

const uid = () => `fu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function readLS() {
  const parsed = getJSON(LS_KEY, null);
  return Array.isArray(parsed) ? parsed : null;
}

function normalize(r) {
  return {
    id: r.id || uid(),
    client: r.client || '',
    issueDate: r.issueDate || '',
    module: r.module || '',
    title: r.title || '',
    description: r.description || '',
    priority: r.priority || 'Sedang',
    status: r.status || 'Open',
    followupDate: r.followupDate || '',
    pic: r.pic || '',
    notes: Array.isArray(r.notes) ? r.notes : [],
    resolvedAt: r.resolvedAt || null,
    createdAt: r.createdAt || new Date().toISOString(),
    updatedAt: r.updatedAt || new Date().toISOString(),
  };
}

// Baris snake_case backend → camelCase halaman (pola mapStatusRow useClientBrands).
function mapRow(r) {
  return normalize({
    id: r.id,
    client: r.client,
    issueDate: r.issueDate,
    module: r.module,
    title: r.title,
    description: r.description,
    priority: r.priority,
    status: r.status,
    followupDate: r.followupDate,
    pic: r.pic,
    resolvedAt: r.resolvedAt,
    notes: (r.notes || []).map((n) => ({ id: n.id, text: n.text, auto: !!n.auto, createdAt: n.createdAt })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
}

// Validasi form satu tempat (dipakai modal tambah/ubah): field wajib PRD §9
// + aturan followupDate >= issueDate. Balik pesan pertama, kosong = valid.
export function validateFollowup(f) {
  const req = [
    ['client', 'Client'], ['issueDate', 'Tanggal issue'], ['module', 'Modul'],
    ['priority', 'Prioritas'], ['title', 'Issue'], ['status', 'Status'],
    ['followupDate', 'Tanggal follow-up'],
  ];
  for (const [k, label] of req) {
    if (!String(f[k] || '').trim()) return `${label} wajib diisi.`;
  }
  if (String(f.followupDate) < String(f.issueDate)) {
    return 'Tanggal follow-up tidak boleh lebih awal dari tanggal issue.';
  }
  return '';
}

// Gagal jaringan (fetch melempar tanpa status) vs error HTTP server.
const isOfflineErr = (e) => !e || (e.status === undefined && e.code === undefined);

export function useFollowups() {
  const [items, setItems] = useState(() => {
    const parsed = readLS();
    if (parsed === null) return buildSeed().map(normalize);
    return parsed.map(normalize);
  });
  const [ready, setReady] = useState(false);
  // null = belum tahu, true = backend terjangkau, false = mode offline lokal.
  const [serverOk, setServerOk] = useState(null);

  useEffect(() => {
    setReady(true);
  }, []);

  async function refetch() {
    const rows = await getFollowups();
    if (Array.isArray(rows) && rows.length) setItems(rows.map(mapRow));
  }

  async function syncWithServer() {
    const local = readLS() || [];
    const seeded = local.length > 0 && local.every((r) => String(r.id || '').startsWith('seed-'));
    if (seeded) {
      // Mode pertama: contoh di-push ke server sekali (409 duplikat dilewati),
      // lalu kondisi lanjut membaca sumber kebenaran server.
      for (const s of buildSeed().map(normalize)) {
        try {
          await createFollowup({ ...s, resolvedAt: undefined });
        } catch (e) {
          if (e?.status !== 409 && !isOfflineErr(e)) throw e;
        }
      }
    }
    await refetch();
  }

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

  async function retryConnection() {
    try {
      await syncWithServer();
      setServerOk(true);
      return true;
    } catch (e) {
      setServerOk(isOfflineErr(e) ? false : true);
      return !isOfflineErr(e);
    }
  }

  useEffect(() => {
    if (ready) storageSet(LS_KEY, items); // gagal diam: kuota/mode privat
  }, [items, ready]);

  async function createFollowupLocal(payload) {
    if (serverOk !== false) {
      try {
        const r = await createFollowup(payload);
        const now = new Date().toISOString();
        const row = normalize({ ...payload, id: r?.data?.id || uid(), createdAt: now, updatedAt: now, notes: [] });
        await refetch().catch(() => setItems((prev) => [row, ...prev]));
        setServerOk(true);
        return row;
      } catch (e) {
        if (!isOfflineErr(e)) throw e;
        setServerOk(false);
      }
    }
    const now = new Date().toISOString();
    const row = normalize({ ...payload, id: uid(), createdAt: now, updatedAt: now, notes: [] });
    setItems((prev) => [row, ...prev]);
    return row;
  }

  // Patch lokal bersama: perubahan status → riwayat catatan otomatis (PRD §6)
  // + resolved_at terisi/dikosongkan. Server punya logika sama; refetch
  // menyamakan bila server terjangkau.
  function applyLocalPatch(prev, id, patch) {
    return prev.map((r) => {
      if (r.id !== id) return r;
      let resolvedAt = r.resolvedAt;
      if (patch.status && patch.status !== r.status) {
        resolvedAt = patch.status === 'Selesai' ? new Date().toISOString() : null;
      }
      const autoNote =
        patch.status && patch.status !== r.status
          ? {
              id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              text: `Status diubah: ${r.status} → ${patch.status}`,
              createdAt: new Date().toISOString(),
              auto: true,
            }
          : null;
      const notes = autoNote ? [autoNote, ...r.notes] : r.notes;
      return { ...r, ...patch, resolvedAt, notes, updatedAt: new Date().toISOString() };
    });
  }

  async function updateFollowupLocal(id, patch) {
    if (serverOk !== false) {
      try {
        await patchFollowup(id, patch);
        setItems((prev) => applyLocalPatch(prev, id, patch));
        setServerOk(true);
        return;
      } catch (e) {
        if (isOfflineErr(e)) {
          setServerOk(false);
        } else if (e?.status === 404) {
          setItems((prev) => applyLocalPatch(prev, id, patch));
          return;
        } else {
          throw e;
        }
      }
    }
    setItems((prev) => applyLocalPatch(prev, id, patch));
  }

  async function removeFollowupLocal(id) {
    if (serverOk !== false) {
      try {
        await deleteFollowup(id);
        setItems((prev) => prev.filter((r) => r.id !== id));
        setServerOk(true);
        return;
      } catch (e) {
        if (isOfflineErr(e)) {
          setServerOk(false);
        } else if (e?.status === 404) {
          setItems((prev) => prev.filter((r) => r.id !== id));
          return;
        } else {
          throw e;
        }
      }
    }
    setItems((prev) => prev.filter((r) => r.id !== id));
  }

  async function addNoteLocal(id, text) {
    const noteText = String(text || '').trim();
    if (!noteText) return;
    if (serverOk !== false) {
      try {
        await addFollowupNoteApi(id, noteText);
        // Catatan + who berasal dari server — refetch agar timeline akurat.
        await refetch().catch(() => {});
        setServerOk(true);
        return;
      } catch (e) {
        if (isOfflineErr(e)) {
          setServerOk(false);
        } else if (e?.status !== 404) {
          throw e;
        }
      }
    }
    const note = { id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, text: noteText, createdAt: new Date().toISOString() };
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, notes: [note, ...r.notes], updatedAt: note.createdAt } : r))
    );
  }

  // Isi contoh: ke server bila terjangkau (409 = sudah ada, lewati),
  // gabung lokal bila offline.
  async function seedExamples() {
    if (serverOk !== false) {
      try {
        for (const s of buildSeed().map(normalize)) {
          try {
            await createFollowup({ ...s, resolvedAt: undefined });
          } catch (e) {
            if (e?.status !== 409 && !isOfflineErr(e)) throw e;
          }
        }
        await refetch();
        setServerOk(true);
        return;
      } catch (e) {
        if (!isOfflineErr(e)) throw e;
        setServerOk(false);
      }
    }
    setItems((prev) => {
      const have = new Set(prev.map((r) => `${r.client}::${r.title}`));
      const extra = buildSeed()
        .map(normalize)
        .filter((s) => !have.has(`${s.client}::${s.title}`));
      return [...extra, ...prev];
    });
  }

  const summary = useMemo(() => {
    const today = todayStr();
    return {
      total: items.length,
      overdue: items.filter((r) => isOverdue(r, today)).length,
      dueToday: items.filter((r) => isDueToday(r, today)).length,
      done: items.filter((r) => r.status === 'Selesai').length,
    };
  }, [items]);

  return {
    ready,
    serverOk,
    items,
    summary,
    createFollowup: createFollowupLocal,
    updateFollowup: updateFollowupLocal,
    removeFollowup: removeFollowupLocal,
    addNote: addNoteLocal,
    seedExamples,
    retryConnection,
  };
}
