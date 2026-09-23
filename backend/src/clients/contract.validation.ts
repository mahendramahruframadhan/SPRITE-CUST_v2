// Validasi murni kontrak client/brand — TANPA dependensi Nest/DB sehingga bisa
// diuji dengan node:test bawaan (tanpa install apa pun).
// Syarat type-stripping Node: hanya sintaks erasable (tanpa enum/namespace).
export const STATUS_TYPES = ['MONTHLY', 'BARU', 'GRATIS'];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ContractError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.status = status;
  }
}

export function normalizeBrand(v: unknown): string {
  return String(v ?? '').trim();
}

export interface StatusInput {
  brand?: unknown;
  type?: unknown;
  expiredAt?: unknown;
}

export interface ParsedStatus {
  brand: string;
  type: string;
  expiredAt: string;
}

// Root cause note: cek duplikat per tipe dilakukan case-insensitive di service
// (via lower()) + unique index DB sebagai defense-in-depth.
export function checkStatusInput(input: StatusInput): ParsedStatus {
  const brand = normalizeBrand(input?.brand).slice(0, 120);
  if (!brand) throw new ContractError('BRAND_REQUIRED', 'Nama brand wajib diisi.');
  const type = String(input?.type || 'MONTHLY').toUpperCase();
  if (!STATUS_TYPES.includes(type)) {
    throw new ContractError('TYPE_INVALID', 'Tipe harus MONTHLY, BARU, atau GRATIS.');
  }
  const expiredAt = normalizeBrand(input?.expiredAt).slice(0, 10);
  if (expiredAt && !DATE_RE.test(expiredAt)) {
    throw new ContractError('DATE_INVALID', 'Format tanggal harus yyyy-MM-dd.');
  }
  if (type === 'GRATIS' && !expiredAt) {
    throw new ContractError('EXPIRED_REQUIRED', 'Tanggal expired wajib untuk Free Maintenance.');
  }
  return { brand, type, expiredAt };
}

export function checkClientInput(input: { brand?: unknown }): string {
  const brand = normalizeBrand(input?.brand).slice(0, 120);
  if (!brand) throw new ContractError('BRAND_REQUIRED', 'Nama brand wajib diisi.');
  return brand;
}
