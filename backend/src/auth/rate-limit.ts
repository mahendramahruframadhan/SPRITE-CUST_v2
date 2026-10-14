import { HttpException, HttpStatus } from '@nestjs/common';

// Throttle in-memory generik (pola yang sama dengan throttleFirstAdmin di
// setup.controller.ts, diekstrak agar dipakai SEMUA endpoint: auth, setup,
// dan kuota AI — satu store, satu kebijakan sapu).
//
// F3: setiap pemanggilan menyapu bucket yang hit terakhirnya sudah lewat
// window-nya sendiri, sehingga memori tidak pernah menumpuk walau kunci unik
// terus bertambah (IP/email tujuan berbeda tiap percobaan). Tanpa sapuan ini
// Map tumbuh tanpa batas selama proses hidup.
//
// Batasan yang disadari: per-proses (reset saat restart) dan tanpa
// user-agent fingerprint — cukup untuk menaikkan biaya brute-force puluhan
// kali lipat, bukan pengganti WAF. Max 10 percobaan sign-in per email+IP per
// 5 menit; sign-up 10 per menit per IP (konsisten dengan first-admin).
type Bucket = { hits: number[]; windowMs: number };
const buckets = new Map<string, Bucket>();

export const SIGNIN_MAX_HITS = 10;
export const SIGNIN_WINDOW_MS = 5 * 60 * 1000;
export const SIGNUP_MAX_HITS = 10;
export const SIGNUP_WINDOW_MS = 60 * 1000;

export function consumeRateLimit(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  // Sapu entri kedaluwarsa (pakai window miliknya sendiri) sebelum menulis.
  for (const [k, b] of buckets) {
    const last = b.hits[b.hits.length - 1];
    if (last === undefined || now - last >= b.windowMs) buckets.delete(k);
  }
  const hits = (buckets.get(key)?.hits || []).filter((t) => now - t < windowMs);
  if (hits.length >= maxHits) {
    buckets.set(key, { hits, windowMs });
    return false;
  }
  hits.push(now);
  buckets.set(key, { hits, windowMs });
  return true;
}

// Introspeksi untuk pengujian sweep (F3) — jumlah bucket hidup & keberadaan
// kunci tertentu.
export function bucketCount(): number {
  return buckets.size;
}

export function hasBucket(key: string): boolean {
  return buckets.has(key);
}

// Melempar 429 bila kuota habis. Dipakai di awal handler auth.
export function throttleAuth(
  key: string,
  maxHits: number,
  windowMs: number,
  code: 'AUTH_RATE_LIMITED' | 'SIGNUP_RATE_LIMITED',
): void {
  if (!consumeRateLimit(key, maxHits, windowMs)) {
    throw new HttpException(
      { code, message: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
