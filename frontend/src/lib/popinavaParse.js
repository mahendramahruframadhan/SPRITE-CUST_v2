// Parser file impor POPI NAVA: .xlsx (SheetJS) dan .csv (parser sendiri,
// tanpa dep tambahan) → daftar baris mentah siap prepareRow/validatePreview.
// Berbasis nama kolom case-insensitive + deteksi baris header di posisi mana
// pun (risiko #1 di spec §16), bukan indeks kolom tetap.
// TODO(backend): backend memakai exceljs untuk hal yang sama; hasil parse
// client di sini hanya untuk preview lokal, server tetap parse ulang file.
// SheetJS di-import dinamis supaya chunk halaman tidak ikut memuatnya
// (hanya file .xlsx yang butuh; CSV jalan tanpa beban itu).

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // §9: maks 5 MB
const SUPPORTED_EXT = ['xlsx', 'xls', 'csv'];

// Header sheet sumber (baris 5) + alias longgar untuk CSV buatan tangan.
const HEADER_ALIASES = {
  uuid: 'uuid',
  brand: 'brand_name',
  brand_name: 'brand_name',
  rvt_custcode: 'rvt_custcode',
  custcode: 'rvt_custcode',
  dept_code: 'dept_code',
  dept_name: 'dept_name',
  dept_channel_name: 'dept_channel_name',
  channel: 'dept_channel_name',
  dept_reference: 'dept_reference',
  iso_code: 'iso_code',
  iso: 'iso_code',
  address: 'address',
  city: 'city',
  province: 'province',
  postcode: 'postcode',
  country: 'country',
  area: 'area',
  region: 'region',
  email: 'email',
  notes: 'notes',
  created_at: 'created_at',
};

function normHeader(v) {
  return String(v ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// Parser CSV ringkas (RFC 4180: kutip ganda, koma, \r\n).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function cellText(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  return String(v);
}

// Cari baris header: baris pertama yang memuat ≥3 nama kolom dikenal
// (cukup longgar untuk CSV minimal, tetap menolak baris judul).
function findHeader(matrix) {
  for (let r = 0; r < matrix.length; r++) {
    const colMap = new Map();
    (matrix[r] || []).forEach((cell, c) => {
      const field = HEADER_ALIASES[normHeader(cell)];
      if (field && !colMap.has(field)) colMap.set(field, c);
    });
    if (colMap.size >= 3) return { headerRow: r, colMap };
  }
  return null;
}

function cellAt(row, colMap, field) {
  const c = colMap.get(field);
  return c === undefined ? '' : cellText(row[c]);
}

/**
 * Matriks baris file → entries siap prepareRow.
 * entries: [{ row (nomor baris fisik, 1-based), data (kunci SOURCE_FIELDS) }]
 * Blok label brand (hanya kolom A terisi, pola sheet sumber) diikat ke
 * baris data berikutnya sampai label berikutnya muncul.
 */
export function matrixToRecords(matrix) {
  const found = findHeader(matrix);
  if (!found) {
    const e = new Error('Header kolom tidak ditemukan di file.');
    e.code = 'UNSUPPORTED_FILE';
    throw e;
  }
  const { headerRow, colMap } = found;
  const hasBrandCol = colMap.has('brand_name');
  const entries = [];
  let brandLabel = '';

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const raw = matrix[r] || [];
    const first = cellText(raw[0]);
    const hasAny = raw.some((c) => cellText(c) !== '');
    if (!hasAny) continue;

    // Baris label brand: hanya kolom A terisi, sisanya kosong (pola sheet).
    const restEmpty = raw.slice(1).every((c) => cellText(c) === '');
    if (first !== '' && restEmpty) {
      brandLabel = first;
      continue;
    }

    const data = {};
    for (const f of Object.values(HEADER_ALIASES)) {
      if (f in data) continue;
      data[f] = cellAt(raw, colMap, f);
    }
    if (hasBrandCol && data.brand_name) brandLabel = data.brand_name;
    data.brand_name = brandLabel;
    entries.push({ row: r + 1, data });
  }

  if (entries.length === 0) {
    const e = new Error('File tidak berisi baris data outlet.');
    e.code = 'UNSUPPORTED_FILE';
    throw e;
  }
  return { headerRow: headerRow + 1, entries };
}

async function readXlsxMatrix(arrayBuffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  // Utamakan sheet POPI NAVA; tanpa sheet itu pakai sheet pertama.
  const name = wb.SheetNames.includes('POPI NAVA') ? 'POPI NAVA' : wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
}

function extOf(fileName) {
  const m = /\.([a-z0-9]+)$/i.exec(String(fileName || ''));
  return m ? m[1].toLowerCase() : '';
}

/**
 * File (Browser File / Node File) → { fileName, headerRow, entries }.
 * Melempar { code, message } untuk ukuran/tipe/format yang ditolak (§13).
 */
export async function parseImportFile(file) {
  const fileName = file?.name || '';
  const ext = extOf(fileName);
  if (!SUPPORTED_EXT.includes(ext)) {
    const e = new Error('Format file harus .xlsx atau .csv.');
    e.code = 'UNSUPPORTED_FILE';
    throw e;
  }
  if (typeof file?.size === 'number' && file.size > MAX_FILE_BYTES) {
    const e = new Error('Ukuran file melebihi 5 MB.');
    e.code = 'FILE_TOO_LARGE';
    throw e;
  }

  let matrix;
  if (ext === 'csv') {
    matrix = parseCsv(await file.text());
  } else {
    matrix = await readXlsxMatrix(await file.arrayBuffer());
  }
  return { fileName, ...matrixToRecords(matrix) };
}
