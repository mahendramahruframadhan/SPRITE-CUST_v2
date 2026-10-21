// Data layer Client Follow-Up (fase 1 frontend-only).
// Pola mirip useClientBrands: state + localStorage offline, tapi TANPA
// panggilan API — endpoint backend belum ada, jadi label mode "mock" tampil
// apa adanya (bukan sukses palsu). Fungsi bernama sama seperti endpoint
// final (POST/PATCH/DELETE/note) — saat backend jadi, isi file ini yang
// diganti, halaman & komponen tidak disentuh.
// TODO(backend): ganti persistensi localStorage jadi fetch /api/followups.
import { useEffect, useMemo, useState } from 'react';
import { getJSON, set as storageSet } from '../lib/storage.js';

const LS_KEY = 'sprite.followups.v1';

export const STATUSES = ['Open', 'Perlu Pengecekan', 'Menunggu Client', 'Selesai'];
export const PRIORITIES = ['Rendah', 'Sedang', 'Tinggi', 'Urgent'];

// Tanggal lokal hari ini, format YYYY-MM-DD (patokan penanda overdue).
export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Overdue = status bukan Selesai dan followupDate < hari ini (PRD §6).
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

function daysAhead(n) {
  return daysAgo(-n);
}

// Contoh seed: kasus nyata dari PRD + nama client Revota (SEED_CLIENT brand),
// tanggal relatif terhadap hari ini agar penanda overdue/hari-ini selalu hidup.
function buildSeed() {
  const now = new Date().toISOString();
  return [
    {
      id: 'seed-fu-1', client: 'Inspired', issueDate: daysAgo(12), module: 'Produksi',
      title: 'Show All Produksi tidak bisa dibuka', description: 'Perlu pengecekan ulang di sisi client.',
      priority: 'Tinggi', status: 'Perlu Pengecekan', followupDate: daysAgo(9), pic: '',
      notes: [{ id: 'seed-n-1', text: 'Dibuat dari contoh PRD.', createdAt: now }],
      resolvedAt: null, createdAt: now, updatedAt: now,
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
      priority: 'Urgent', status: 'Open', followupDate: daysAhead(2), pic: '',
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

export function useFollowups() {
  const [items, setItems] = useState(() => {
    const parsed = readLS();
    if (parsed === null) return buildSeed();
    return parsed.map(normalize);
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) storageSet(LS_KEY, items); // gagal diam: kuota/mode privat
  }, [items, ready]);

  async function createFollowup(payload) {
    const now = new Date().toISOString();
    const row = normalize({ ...payload, id: uid(), createdAt: now, updatedAt: now, notes: [] });
    setItems((prev) => [row, ...prev]);
    return row;
  }

  async function updateFollowup(id, patch) {
    setItems((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        let resolvedAt = r.resolvedAt;
        if (patch.status && patch.status !== r.status) {
          resolvedAt = patch.status === 'Selesai' ? new Date().toISOString() : null;
        }
        // Riwayat otomatis perubahan status (PRD §6) — terpisah dari catatan user.
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
      })
    );
  }

  async function removeFollowup(id) {
    setItems((prev) => prev.filter((r) => r.id !== id));
  }

  async function addNote(id, text) {
    const note = {
      id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      text: String(text || '').trim(),
      createdAt: new Date().toISOString(),
    };
    if (!note.text) return;
    setItems((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, notes: [note, ...r.notes], updatedAt: note.createdAt } : r
      )
    );
  }

  // Hubungkan kembali contoh hanya bila id seed-nya hilang (tanpa duplikat).
  async function seedExamples() {
    const have = new Set(items.map((r) => r.id));
    const extra = buildSeed().filter((s) => !have.has(s.id)).map(normalize);
    if (extra.length) setItems((prev) => [...extra, ...prev]);
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

  return { ready, items, summary, createFollowup, updateFollowup, removeFollowup, addNote, seedExamples };
}
