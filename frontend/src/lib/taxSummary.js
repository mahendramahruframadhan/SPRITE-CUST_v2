// Perhitungan pajak halaman Finance, model PER TRANSAKSI (baris ON-CALL):
// PPN (persen/rupiah) menambah charges baris; PPH hanya status on/off,
// tanpa potongan. Subtotal Akhir = Total Charges + total PPN (tanpa PPH).
// Murni tanpa React agar bisa diuji unit terpisah (lihat test/taxSummary.test.mjs).
const toNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nonNeg = (v) => Math.max(0, toNum(v));

const NON_AKTIF = { enabled: false, mode: null, percent: 0, amount: 0 };

export function amountFromPercent(total, percent) {
  const t = toNum(total);
  const p = toNum(percent);
  if (t <= 0 || p <= 0) return 0;
  return Math.round((t * p) / 100);
}

// PPH bukan pengurang lagi: parameter pph lama diabaikan dengan sengaja
// agar pemakaian lama tidak diam-diam membelokkan angka subtotal.
export function computeSubtotal({ total, ppn }) {
  return toNum(total) + toNum(ppn);
}

export function resolveTaxAmount(entry, total) {
  if (!entry || entry.enabled !== true) return 0;
  if (entry.mode === 'percent') return amountFromPercent(total, entry.percent);
  return toNum(entry.amount);
}

function sanitizeEntry(e) {
  if (!e || typeof e !== 'object') return { ...NON_AKTIF };
  const enabled = e.enabled === true;
  return {
    enabled,
    mode: enabled ? (e.mode === 'percent' ? 'percent' : 'rupiah') : null,
    percent: nonNeg(e.percent),
    amount: nonNeg(e.amount),
  };
}

function parseMaybeJson(raw) {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Satu baris transaksi: PPN berupa entri valid atau null (non-aktif =
// null, bukan entri mati), PPH murni boolean status.
export function sanitizeRowTax(raw) {
  const o = parseMaybeJson(raw);
  if (!o || typeof o !== 'object') return { ppn: null, pph: false };
  const e = sanitizeEntry(o.ppn);
  return { ppn: e.enabled ? e : null, pph: o.pph === true };
}

// Peta localStorage: { [recordUuid]: sanitizeRowTax }, per kunci divalidasi.
export function sanitizeTaxMap(raw) {
  const o = parseMaybeJson(raw);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  for (const k of Object.keys(o)) out[k] = sanitizeRowTax(o[k]);
  return out;
}

// Σ PPN pada himpunan baris: persen di-basis-kan ke charges baris itu sendiri.
export function sumPpn(rows, taxMap) {
  return (rows || []).reduce(
    (a, r) => a + resolveTaxAmount(taxMap?.[r.recordUuid]?.ppn, +r.charges || 0),
    0
  );
}

// Jumlah baris ber-status PPH aktif (penanda saja, bukan angka rupiah).
export function pphActiveCount(rows, taxMap) {
  return (rows || []).filter((r) => taxMap?.[r.recordUuid]?.pph === true).length;
}

// Normalisasi satu baris bentuk server ({ppn:{mode,percent,amount}|null}
// tanpa flag enabled: keberadaan objek berarti aktif) ke bentuk TaxEntry lokal.
export function normalizeServerRow(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const p = o.ppn && typeof o.ppn === 'object' ? o.ppn : null;
  const ppn = p && (p.mode === 'percent' || p.mode === 'rupiah')
    ? { enabled: true, mode: p.mode, percent: nonNeg(p.percent), amount: nonNeg(p.amount) }
    : null;
  return { ppn, pph: o.pph === true };
}

// Gabung map server (kebenaran) dengan outbox lokal: per baris, entri
// outbox menimpa entri server seutuhnya (last-write-wins per baris).
export function mergeTaxMaps(server, outbox) {
  const s = server && typeof server === 'object' ? server : {};
  const o = outbox && typeof outbox === 'object' ? outbox : {};
  return { ...s, ...o };
}

// Hasil PATCH satu baris terhadap outbox: sukses berarti entri terkonfirmasi
// server sehingga key dihapus (evict-on-ack); gagal berarti key dipertahankan.
export function applySaveResult(outbox, uuid, ok) {
  const o = outbox && typeof outbox === 'object' ? { ...outbox } : {};
  if (ok) delete o[uuid];
  return o;
}

// Baris yang layak dikontrol pajak: ON-CALL saja (bandingkan tanpa
// spasi/tanda baca, huruf bebas).
export function isTaxableRow(billingStatus) {
  if (typeof billingStatus !== 'string') return false;
  return billingStatus.replace(/[\s-]/g, '').toUpperCase() === 'ONCALL';
}

export function validateRpInput(str) {
  return typeof str === 'string' && /^\d+$/.test(str);
}

export function validatePercentInput(str) {
  return typeof str === 'string' && /^\d+(\.\d+)?$/.test(str);
}
