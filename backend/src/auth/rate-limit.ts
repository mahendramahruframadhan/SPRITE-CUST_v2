import { HttpException, HttpStatus } from '@nestjs/common';

// Throttle in-memory generik (pola yang sama dengan throttleFirstAdmin di
// setup.controller.ts, diekstrak agar dipakai ulang).
//
// Batasan yang disadari: per-proses (reset saat restart) dan tanpa
// user-agent fingerprint — cukup untuk menaikkan biaya brute-force puluhan
// kali lipat, bukan pengganti WAF. Max 10 percobaan sign-in per email+IP per
// 5 menit; sign-up 10 per menit per IP (konsisten dengan first-admin).
const buckets = new Map<string, number[]>();

export const SIGNIN_MAX_HITS = 10;
export const SIGNIN_WINDOW_MS = 5 * 60 * 1000;
export const SIGNUP_MAX_HITS = 10;
export const SIGNUP_WINDOW_MS = 60 * 1000;

export function consumeRateLimit(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= maxHits) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
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
