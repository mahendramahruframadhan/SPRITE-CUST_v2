// Pemetaan baris snake_case (file/API) ↔ record camelCase (state halaman).
// Satu tempat untuk kedua arah agar form, impor, ekspor, dan hook tidak
// mengulang daftar kolom (source of truth: SOURCE_FIELDS di validate lib).
import { SOURCE_FIELDS } from './popinavaValidate.js';

const SOURCE_TO_CAMEL = {
  uuid: 'uuid',
  brand_name: 'brandName',
  rvt_custcode: 'rvtCustcode',
  dept_code: 'deptCode',
  dept_name: 'deptName',
  dept_channel_name: 'deptChannelName',
  dept_reference: 'deptReference',
  iso_code: 'isoCode',
  address: 'address',
  city: 'city',
  province: 'province',
  postcode: 'postcode',
  country: 'country',
  area: 'area',
  region: 'region',
  email: 'email',
  notes: 'notes',
  created_at: 'sourceCreatedAt',
};

// snake (siap validasi) → record state. System field diisi pemanggil.
export function snakeToRecord(row, { status = 'active', createdAt = '', updatedAt = '' } = {}) {
  const rec = {};
  for (const f of SOURCE_FIELDS) rec[SOURCE_TO_CAMEL[f]] = row[f] ?? '';
  rec.status = status;
  rec.createdAt = createdAt;
  rec.updatedAt = updatedAt;
  return rec;
}

// record state → snake untuk body API (tanpa system field aplikasi, §9).
export function recordToSource(rec) {
  const out = { status: rec.status || 'active' };
  for (const f of SOURCE_FIELDS) out[f] = rec[SOURCE_TO_CAMEL[f]] ?? '';
  return out;
}

// Baris API (snake + system field) → record state.
export function serverToRecord(r) {
  return snakeToRecord(r, {
    status: r.status || 'active',
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  });
}

/**
 * Probe server sukses → server menang, TANPA menelan kerja lokal:
 * - baris yang ada di server → pakai versi server (tanpa duplikat),
 * - seed pristine (fallback offline) → dibuang, mode server tidak memaksa seed,
 * - baris offline yang belum pernah tersinkron (dibuat/diedit user) → dipertahankan.
 * Perbandingan seed mengabaikan createdAt/updatedAt karena buildSeed()
 * memakai nowIso() baru tiap dipanggil (timestamp beda = bukan editan user).
 * Dipakai usePopinava di dua titik probe (awal + Coba lagi).
 */
export function mergeServerRows(localRows, serverRows, seedRows) {
  const serverUuids = new Set(serverRows.map((r) => r.uuid));
  const seedByUuid = new Map(seedRows.map((r) => [r.uuid, r]));
  const stable = (r) => {
    const { createdAt, updatedAt, ...rest } = r;
    return JSON.stringify(rest);
  };
  const localOnly = localRows.filter((r) => {
    if (serverUuids.has(r.uuid)) return false;
    const seed = seedByUuid.get(r.uuid);
    return !seed || stable(r) !== stable(seed);
  });
  return [...serverRows, ...localOnly];
}
