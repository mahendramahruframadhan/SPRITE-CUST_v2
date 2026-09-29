// Hook halaman POPI NAVA: state daftar outlet + filter/sort/pagination,
// CRUD, bulk, dan alur impor (preview → commit). Backend /popinava belum
// ada (fase frontend): probe GET menentukan mode: 404 jalan lokal tanpa
// banner, gagal jaringan/5xx tampil banner error + Coba lagi (spec §10.4).
// Pola mengikuti useClientBrands: server bila terjangkau, localStorage
// sebagai fallback, pesan jujur "mode lokal" tanpa sukses palsu.
// Context7 react: lazy init state + efek berpenjaga + useMemo turunan.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { POPINAVA_SEED } from '../data/popinavaSeed.js';
import {
  buildFacets,
  prepareRow,
  validatePreview,
  validateRow,
} from '../lib/popinavaValidate.js';
import { parseImportFile } from '../lib/popinavaParse.js';
import { recordToSource, serverToRecord, snakeToRecord } from '../lib/popinavaRecord.js';
import { getJSON, set as storageSet } from '../lib/storage.js';
import * as api from '../lib/api.js';

const STORAGE_KEY = 'sprite.popinava.v1';
const BULK_MAX = 1000; // §9: aksi massal maks 1000 uuid

const SEARCH_FIELDS = ['uuid', 'brandName', 'deptChannelName', 'address', 'city'];
const SORT_FIELDS = ['brandName', 'rvtCustcode', 'deptCode', 'deptName', 'city', 'status', 'sourceCreatedAt'];

export const DEFAULT_FILTERS = {
  search: '',
  brand: '',
  deptName: '',
  status: '',
  city: '',
  area: '',
};

const nowIso = () => new Date().toISOString();

// Gagal jaringan (fetch melempar tanpa status) vs 404 endpoint tak terpasang
// di server yang dijangkau vs error HTTP lain. 404 → lokal.
function isNetworkErr(e) {
  return !e || e.status === undefined;
}
function isLocalModeErr(e) {
  return isNetworkErr(e) || e?.status === 404;
}

// Seed: baris mentah sheet → dinormalkan (§8.3) sekali lalu jadi record.
function buildSeed() {
  const t = nowIso();
  return POPINAVA_SEED.map((raw) => {
    const { row } = prepareRow(raw);
    return snakeToRecord(row, { status: 'active', createdAt: t, updatedAt: t });
  });
}

function loadRows() {
  const parsed = getJSON(STORAGE_KEY, null);
  if (parsed === null || parsed === undefined) return buildSeed();
  return Array.isArray(parsed) ? parsed : buildSeed();
}

function dupeError(rows, row, exceptUuid) {
  const uuid = String(row.uuid || '').toLowerCase();
  if (uuid && rows.some((r) => r.uuid.toLowerCase() === uuid && r.uuid !== exceptUuid)) {
    const e = new Error(`uuid ${row.uuid} sudah dipakai outlet lain.`);
    e.code = 'UNIQUE_VIOLATION';
    return e;
  }
  const hit = rows.find(
    (r) =>
      r.uuid !== exceptUuid &&
      r.rvtCustcode === row.rvt_custcode &&
      r.deptCode === row.dept_code
  );
  if (hit) {
    const e = new Error(`pasangan custcode ${row.rvt_custcode} + ${row.dept_code} sudah ada di outlet ${hit.deptChannelName}.`);
    e.code = 'UNIQUE_VIOLATION';
    return e;
  }
  return null;
}

function validateOrFail(rows, row, exceptUuid) {
  const { errors } = validateRow(row);
  if (errors.length) {
    const e = new Error(errors.map((x) => x.message).join(' '));
    e.code = 'VALIDATION_FAILED';
    e.fields = errors;
    throw e;
  }
  const dup = dupeError(rows, row, exceptUuid);
  if (dup) throw dup;
}

export function usePopinava() {
  const [rows, setRows] = useState(loadRows);
  const [ready, setReady] = useState(false);
  // null = belum tahu, true = backend terjangkau, false = mode lokal.
  const [serverOk, setServerOk] = useState(null);
  const [probeError, setProbeError] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ field: 'brandName', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setReady(true);
  }, []);

  // Probe endpoint list. 404 → mode lokal senyap; error lain → banner.
  const retryProbe = useCallback(async () => {
    setProbeError(null);
    try {
      const res = await api.getPopinava('?page=1&pageSize=5000');
      if (res && Array.isArray(res.items)) {
        setServerOk(true);
        if (res.total > 0 && res.items.length) setRows(res.items.map(serverToRecord));
        return true;
      }
      setServerOk(false);
      return false;
    } catch (e) {
      setServerOk(false);
      if (!isLocalModeErr(e)) setProbeError(e);
      return false;
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    api
      .getPopinava('?page=1&pageSize=5000')
      .then((res) => {
        if (ignore) return;
        if (res && Array.isArray(res.items)) {
          setServerOk(true);
          if (res.total > 0 && res.items.length) setRows(res.items.map(serverToRecord));
        } else {
          setServerOk(false);
        }
      })
      .catch((e) => {
        if (ignore) return;
        setServerOk(false);
        if (!isLocalModeErr(e)) setProbeError(e);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Persistensi lokal (fallback offline) setelah mount.
  useEffect(() => {
    if (ready) storageSet(STORAGE_KEY, rows);
  }, [rows, ready]);

  const facets = useMemo(() => buildFacets(rows), [rows]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === 'active').length;
    return {
      brands: facets.brands.length,
      active,
      inactive: rows.length - active,
      total: rows.length,
    };
  }, [rows, facets]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q && !SEARCH_FIELDS.some((f) => String(r[f] || '').toLowerCase().includes(q))) return false;
      if (filters.brand && r.brandName !== filters.brand) return false;
      if (filters.deptName && r.deptName !== filters.deptName) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.city && r.city !== filters.city) return false;
      if (filters.area && r.area !== filters.area) return false;
      return true;
    });
    const dir = sort.dir === 'desc' ? -1 : 1;
    const key = SORT_FIELDS.includes(sort.field) ? sort.field : 'brandName';
    out = out.slice().sort((a, b) => {
      const av = String(a[key] ?? '');
      const bv = String(b[key] ?? '');
      return av.localeCompare(bv, 'id') * dir;
    });
    return out;
  }, [rows, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, pageSize]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const toggleSort = useCallback((field) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' }
    );
  }, []);

  // CRUD: coba server dulu (bila belum tahu/terjangkau), fallback lokal.
  const create = useCallback(
    async (payload) => {
      const { row } = prepareRow(payload);
      row.uuid = row.uuid || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-local`);
      validateOrFail(rows, row, null);
      const now = nowIso();
      const record = snakeToRecord(row, { status: payload.status || 'active', createdAt: now, updatedAt: now });
      if (serverOk !== false) {
        try {
          const r = await api.postPopinava(recordToSource(record));
          setServerOk(true);
          const srv = r?.data || r;
          setRows((prev) => [srv?.uuid ? serverToRecord(srv) : record, ...prev.filter((x) => x.uuid !== record.uuid)]);
          return record;
        } catch (e) {
          if (!isLocalModeErr(e)) throw e;
          setServerOk(false);
        }
      }
      setRows((prev) => [record, ...prev]);
      return record;
    },
    [rows, serverOk]
  );

  const update = useCallback(
    async (uuid, patch) => {
      const existing = rows.find((r) => r.uuid === uuid);
      if (!existing) {
        const e = new Error('Outlet tidak ditemukan.');
        e.status = 404;
        throw e;
      }
      const { row } = prepareRow({ ...recordToSource(existing), ...patch });
      validateOrFail(rows, row, uuid);
      const now = nowIso();
      const record = snakeToRecord(row, {
        status: patch.status || existing.status,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
      if (serverOk !== false) {
        try {
          const r = await api.patchPopinava(uuid, recordToSource(record));
          setServerOk(true);
          const srv = r?.data || r;
          setRows((prev) => prev.map((x) => (x.uuid === uuid ? (srv?.uuid ? serverToRecord(srv) : record) : x)));
          return record;
        } catch (e) {
          if (!isLocalModeErr(e)) throw e;
          setServerOk(false);
        }
      }
      setRows((prev) => prev.map((x) => (x.uuid === uuid ? record : x)));
      return record;
    },
    [rows, serverOk]
  );

  const remove = useCallback(
    async (uuid) => {
      if (serverOk !== false) {
        try {
          await api.deletePopinava(uuid);
          setServerOk(true);
        } catch (e) {
          if (!isLocalModeErr(e)) throw e;
          setServerOk(false);
        }
      }
      setRows((prev) => prev.filter((r) => r.uuid !== uuid));
    },
    [serverOk]
  );

  // Bulk §9: maks 1000 uuid, aksi delete | set-status.
  const bulk = useCallback(
    async ({ action, uuids, status }) => {
      if (!Array.isArray(uuids) || uuids.length === 0) {
        const e = new Error('Pilih minimal satu baris.');
        e.code = 'VALIDATION_FAILED';
        throw e;
      }
      if (uuids.length > BULK_MAX) {
        const e = new Error(`Maksimal ${BULK_MAX} baris per aksi massal.`);
        e.code = 'VALIDATION_FAILED';
        throw e;
      }
      if (action === 'set-status' && status && !['active', 'inactive'].includes(status)) {
        const e = new Error('Status harus active atau inactive.');
        e.code = 'VALIDATION_FAILED';
        throw e;
      }
      if (serverOk !== false) {
        try {
          await api.postPopinavaBulk({ action, uuids, ...(status ? { status } : {}) });
          setServerOk(true);
        } catch (e) {
          if (!isLocalModeErr(e)) throw e;
          setServerOk(false);
        }
      }
      const set = new Set(uuids);
      if (action === 'delete') {
        setRows((prev) => prev.filter((r) => !set.has(r.uuid)));
      } else {
        const now = nowIso();
        setRows((prev) =>
          prev.map((r) => (set.has(r.uuid) ? { ...r, status, updatedAt: now } : r))
        );
      }
      return { affected: uuids.length };
    },
    [serverOk]
  );

  // Impor: parse + validasi lokal → preview (§8/§9). Commit ulang validasi
  // (all-or-nothing: satu error pun membatalkan, §9) lalu tulis lokal.
  const previewImport = useCallback(async (file) => {
    const parsed = await parseImportFile(file);
    const entries = parsed.entries.map((e) => {
      const { row, notes } = prepareRow(e.data);
      return { row: e.row, data: row, notes };
    });
    const report = validatePreview(entries);
    return { fileName: parsed.fileName, headerRow: parsed.headerRow, ...report, entries };
  }, []);

  const commitImport = useCallback(
    (entries, mode) => {
      const report = validatePreview(entries);
      if (report.errors.length > 0) {
        // Ditolak semua (all-or-nothing, §9), wizard memblokir tombol dulu.
        return { created: 0, updated: 0, skipped: 0, failed: 0, blocked: true, errors: report.errors };
      }
      const now = nowIso();
      const byUuid = new Map(rows.map((r) => [r.uuid, r]));
      const createdRows = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const e of entries) {
        const record = snakeToRecord(e.data, { status: 'active', createdAt: now, updatedAt: now });
        const existing = byUuid.get(record.uuid);
        if (existing) {
          if (mode === 'skip-existing') {
            skipped += 1;
            continue;
          }
          byUuid.set(record.uuid, {
            ...existing,
            ...record,
            status: existing.status,
            createdAt: existing.createdAt,
            updatedAt: now,
          });
          updated += 1;
        } else {
          byUuid.set(record.uuid, record);
          createdRows.push(record);
          created += 1;
        }
      }
      // Urutan: baris existing tetap, baris baru di depan (konsisten create).
      const next = [...createdRows, ...rows.map((r) => byUuid.get(r.uuid)).filter((r) => r && !createdRows.includes(r))];
      setRows(next);
      return { created, updated, skipped, failed: 0, blocked: false, errors: [] };
    },
    [rows]
  );

  return {
    ready,
    serverOk,
    probeError,
    retryProbe,
    rows,
    stats,
    facets,
    filters,
    setFilter,
    resetFilters,
    sort,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    total: filtered.length,
    pageRows,
    // Baris terfilter semua halaman (untuk ekspor mengikuti filter, §11).
    exportable: filtered,
    create,
    update,
    remove,
    bulk,
    previewImport,
    commitImport,
  };
}
