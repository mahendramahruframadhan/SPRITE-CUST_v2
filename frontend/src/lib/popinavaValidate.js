// Aturan wajib (§8.1), peringatan (§8.2), dan normalisasi (§8.3) master
// outlet POPI NAVA, murni tanpa dependensi supaya dipakai form drawer,
// preview impor, commit lokal, dan unit test node --test.
// TODO(backend): backend membuat salinan aturan ini di popinava.validation.ts
// dan tetap otoritatif; aturan di sini hanya untuk feedback awal user.
// Alasan (R-31): semua pesan bahasa Indonesia tanpa tanda hubung panjang,
// angka fakta (53/44 baris) diambil dari hasil ukur sheet, bukan tebak-tebakan.

export const DEPT_NAMES = ['DISTRIBUTION', 'SHOP'];
export const STATUSES = ['active', 'inactive'];

// Urutan kolom = urutan sheet sumber + brand_name; dipakai ekspor 18 kolom (§11).
export const SOURCE_FIELDS = [
  'uuid',
  'brand_name',
  'rvt_custcode',
  'dept_code',
  'dept_name',
  'dept_channel_name',
  'dept_reference',
  'iso_code',
  'address',
  'city',
  'province',
  'postcode',
  'country',
  'area',
  'region',
  'email',
  'notes',
  'created_at',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTCODE_RE = /^RVT-[A-Z0-9]{2,5}$/;
const ISO_RE = /^ID-[A-Z]{2}$/;

// Placeholder postcode yang terukur di sheet sumber (43 baris bermasalah).
const BAD_POSTCODES = new Set(['', '0', '12345', '4000', '40000', '40197']);

function cleanText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().replace(/\s+/g, ' ');
}

// Excel menghasilkan 40114 atau 40114.0 → string tanpa desimal (§8.3.3).
export function normalizePostcode(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v); // 40114.0 di JS jadi "40114"
  const s = String(v).trim();
  return /^\d+\.0$/.test(s) ? s.slice(0, -2) : s;
}

function normalizeDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 19).replace('T', ' ');
  }
  return cleanText(v);
}

/**
 * Normalisasi §8.3 pada satu baris mentah (kunci snake_case).
 * Mengembalikan { row, notes }: notes = daftar koreksi untuk preview.
 */
export function prepareRow(raw) {
  const notes = [];
  const row = {};
  for (const f of SOURCE_FIELDS) {
    const v = raw?.[f];
    if (f === 'postcode') row[f] = normalizePostcode(v);
    else if (f === 'created_at') row[f] = normalizeDate(v);
    else row[f] = cleanText(v);
  }

  // §8.3.1 koreksi shift kolom: 53 dari 88 baris sumber bergeser kanan.
  if (row.country !== 'INDONESIA' && row.region === 'INDONESIA') {
    const from = `${row.country}|${row.area}|${row.region}`;
    const nextCountry = row.region;
    const nextArea = row.country;
    const nextRegion = row.area;
    row.country = nextCountry;
    row.area = nextArea;
    row.region = nextRegion;
    notes.push({
      field: 'country/area/region',
      from,
      to: `${row.country}|${row.area}|${row.region}`,
    });
  }

  // §8.3.2 placeholder '-' pada kolom referensi → kosong.
  for (const f of ['dept_reference', 'email', 'notes']) {
    if (row[f] === '-') {
      notes.push({ field: f, from: '-', to: '(kosong)' });
      row[f] = '';
    }
  }
  if (row.address === '-') {
    notes.push({ field: 'address', from: '-', to: '(kosong)' });
    row.address = '';
  }
  return { row, notes };
}

/**
 * Validasi satu baris hasil prepareRow (§8.1 error + §8.2 peringatan).
 * Contoh pesan preview: { field: 'dept_code', code: 'INVALID_FORMAT', message: '...' }
 */
export function validateRow(row) {
  const errors = [];
  const warnings = [];
  const err = (field, code, message) => errors.push({ field, code, message });
  const warn = (field, code, message) => warnings.push({ field, code, message });

  if (!row.uuid) err('uuid', 'REQUIRED', 'uuid wajib diisi.');
  else if (!UUID_RE.test(row.uuid)) err('uuid', 'INVALID_FORMAT', 'uuid harus format UUID (8-4-4-4-12).');

  if (!row.brand_name) err('brand_name', 'REQUIRED', 'brand wajib diisi.');

  if (!row.rvt_custcode) err('rvt_custcode', 'REQUIRED', 'custcode wajib diisi.');
  else if (!CUSTCODE_RE.test(row.rvt_custcode)) {
    err('rvt_custcode', 'INVALID_FORMAT', 'custcode harus pola RVT-XXX (contoh: RVT-HGL).');
  }

  if (!row.dept_code) err('dept_code', 'REQUIRED', 'dept_code wajib diisi.');
  else if (!/^\d{8}$/.test(row.dept_code)) err('dept_code', 'INVALID_FORMAT', 'dept_code harus 8 digit angka.');

  if (!row.dept_name) err('dept_name', 'REQUIRED', 'dept_name wajib diisi.');
  else if (!DEPT_NAMES.includes(row.dept_name)) {
    err('dept_name', 'INVALID_FORMAT', 'dept_name harus DISTRIBUTION atau SHOP.');
  }

  if (!row.dept_channel_name) err('dept_channel_name', 'REQUIRED', 'nama channel wajib diisi.');
  else if (row.dept_channel_name.length > 120) {
    err('dept_channel_name', 'TOO_LONG', 'nama channel maksimal 120 karakter.');
  }

  if (!row.iso_code) err('iso_code', 'REQUIRED', 'iso_code wajib diisi.');
  else if (!ISO_RE.test(row.iso_code)) err('iso_code', 'INVALID_FORMAT', 'iso_code harus pola ID-XX (contoh: ID-JB).');

  if (!row.city) err('city', 'REQUIRED', 'kota wajib diisi.');
  if (!row.province) err('province', 'REQUIRED', 'provinsi wajib diisi.');

  // §8.3.1 setelah koreksi wajib INDONESIA; bila tidak → error konsistensi.
  if (!row.country) err('country', 'REQUIRED', 'negara wajib diisi.');
  else if (row.country !== 'INDONESIA') {
    err('country', 'COUNTRY_INCONSISTENT', 'kolom negara tidak konsisten, harus INDONESIA.');
  }

  // §8.2 peringatan: baris tetap boleh masuk.
  if (BAD_POSTCODES.has(row.postcode) || !/^\d{5}$/.test(row.postcode)) {
    warn('postcode', 'POSTCODE_SUSPECT', 'postcode bukan 5 digit angka yang wajar.');
  }
  if (!row.address) warn('address', 'ADDRESS_EMPTY', 'alamat kosong.');
  // Catatan: '-' pada dept_reference/email/notes bukan peringatan baris,
  // hanya normalisasi §8.3.2, supaya jumlah baris peringatan = 44 sesuai
  // acceptance (43 postcode + 2 address, satu baris kena keduanya).
  if (!row.created_at) warn('created_at', 'DATE_UNREADABLE', 'tanggal dibuat kosong.');
  else if (Number.isNaN(Date.parse(row.created_at.replace(' ', 'T')))) {
    warn('created_at', 'DATE_UNREADABLE', 'tanggal dibuat tidak terbaca sebagai tanggal.');
  }
  return { errors, warnings };
}

/**
 * Validasi lintas-baris untuk seluruh file preview (§8.1 unik + §8.2).
 * entries: [{ row, data, notes }]: row = nomor baris fisik di file (1-based).
 * Mengembalikan bentuk respons preview spec §9 + `details` per baris untuk
 * tab Valid/Peringatan/Error di wizard (§10.3).
 */
export function validatePreview(entries) {
  const errors = [];
  const normalized = [];
  const details = [];
  const uuidSeen = new Map();
  const pairSeen = new Map();
  let valid = 0;
  let withWarnings = 0;

  for (const e of entries) {
    for (const n of e.notes || []) normalized.push({ row: e.row, ...n });
    const { errors: rowErrors, warnings } = validateRow(e.data);
    const uuid = e.data.uuid || '';
    const pair = `${e.data.rvt_custcode}::${e.data.dept_code}`;

    if (uuid) {
      if (uuidSeen.has(uuid)) {
        rowErrors.push({
          field: 'uuid',
          code: 'DUPLICATE_UUID',
          message: `uuid sama dengan baris ${uuidSeen.get(uuid)}.`,
        });
      } else {
        uuidSeen.set(uuid, e.row);
      }
    }
    if (e.data.rvt_custcode && e.data.dept_code) {
      if (pairSeen.has(pair)) {
        rowErrors.push({
          field: 'rvt_custcode',
          code: 'DUPLICATE_PAIR',
          message: `pasangan custcode + dept_code sama dengan baris ${pairSeen.get(pair)}.`,
        });
      } else {
        pairSeen.set(pair, e.row);
      }
    }

    for (const er of rowErrors) errors.push({ row: e.row, uuid, ...er });
    details.push({
      row: e.row,
      uuid,
      brand_name: e.data.brand_name,
      rvt_custcode: e.data.rvt_custcode,
      dept_channel_name: e.data.dept_channel_name,
      city: e.data.city,
      errors: rowErrors,
      warnings,
    });
    if (rowErrors.length === 0) {
      valid += 1;
      if (warnings.length > 0) withWarnings += 1;
    }
  }

  return {
    totalRows: entries.length,
    valid,
    withWarnings,
    errors,
    normalized,
    details,
  };
}

// Fasilitas filter dropdown (§10.1) diambil dari data, bukan daftar statis.
export function buildFacets(records) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id'));
  return {
    brands: uniq(records.map((r) => r.brandName)),
    cities: uniq(records.map((r) => r.city)),
    areas: uniq(records.map((r) => r.area)),
    statuses: STATUSES.filter((s) => records.some((r) => r.status === s)),
  };
}
