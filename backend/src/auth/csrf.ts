import { buildCorsOptions } from '../config/cors';
import { SESSION_COOKIE } from './session';

// Kompensasi CSRF untuk cookie httpOnly + credentials:true (M3).
// Skenario serangan: browser korban otomatis melampirkan cookie pada POST
// cross-site (khususnya saat sameSite=none di production) — header kustom
// tak bisa dipalsukan cross-origin tanpa preflight, tapi simple-POST bisa.
// Aturan: request MUTASI yang membawa cookie sesi TANPA header x-auth-token
// wajib menyertakan Origin/Referer yang persis ada di daftar origin CORS;
// selain itu 403 CSRF_MISMATCH. Dikecualikan (lolos): non-mutasi, pemanggil
// header eksplisit (skrip/test), dan request tanpa cookie (gagal di guard
// 401 — bukan urusan lapisan ini).
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function hasSessionCookie(req: any): boolean {
  const raw = String(req?.headers?.cookie || '');
  return raw.split(';').some((part) => part.slice(0, part.indexOf('=')).trim() === SESSION_COOKIE);
}

export function isCsrfAllowed(req: any, origins: string[] = buildCorsOptions().origin): boolean {
  const method = String(req?.method || 'GET').toUpperCase();
  if (!MUTATING.has(method)) return true;
  if (String(req?.headers?.['x-auth-token'] || '').trim() !== '') return true;
  if (!hasSessionCookie(req)) return true;
  const origin = String(req?.headers?.origin || '').trim();
  if (origin && origins.includes(origin)) return true;
  const referer = String(req?.headers?.referer || req?.headers?.referrer || '').trim();
  if (referer) {
    try {
      if (origins.includes(new URL(referer).origin)) return true;
    } catch {
      return false;
    }
  }
  return false;
}

// Middleware Express global (dipasang di main.ts sebelum routes).
export function csrfGuard(req: any, res: any, next: any) {
  if (isCsrfAllowed(req)) return next();
  return res.status(403).json({
    ok: false,
    code: 'CSRF_MISMATCH',
    message: 'Origin request tidak dikenal untuk sesi cookie.',
    statusCode: 403,
  });
}
