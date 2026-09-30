import * as crypto from 'crypto';
import { rowsOf } from '../db/sql';

// Sesi token server-side (tabel `session`, sudah ada di DDL initDb).
// Alur: sign-in memverifikasi password → createSession menyimpan token acak +
// expiry 7 hari → frontend mengirimnya via header x-auth-token di SETIAP
// request → PermGuard memvalidasi TOKEN (bukan email) sebelum cek role.
// Tanpa token valid → 403. Header x-user-email tidak lagi dipercaya untuk
// otorisasi (tetap dikirim frontend untuk kompatibilitas display).
export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

// Parameter binding: token/user id dari luar dikirim terpisah ($n), bukan
// disisipkan ke string SQL (Imp#1).
// Satu user = satu sesi aktif (login baru mengusir sesi lama).
export async function createSession(db: any, userId: string): Promise<string> {
  await db.pq(`DELETE FROM session WHERE user_id = $1`, [userId]);
  const token = crypto.randomBytes(32).toString('hex');
  const id = `s_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const exp = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.pq(
    `INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, exp, token, now, now, userId],
  );
  return token;
}

export async function destroySession(db: any, token: string): Promise<void> {
  const t = String(token || '').trim();
  if (!t) return;
  await db.pq(`DELETE FROM session WHERE token = $1`, [t]);
}

// User dari token sesi; null bila token hilang / tidak dikenal / kedaluwarsa
// (baris kedaluwarsa ikut dibersihkan) / akun dinonaktifkan.
export async function resolveSessionUser(db: any, req: any): Promise<any | null> {
  try {
    const token = String(req?.headers?.['x-auth-token'] || '').trim();
    if (!token || token.length > 256) return null;
    const r: any = await db.pq(
      `SELECT u.id, u.name, u.email, u.role, u.active, s.expires_at AS session_expires FROM session s JOIN "user" u ON u.id = s.user_id WHERE s.token = $1 LIMIT 1`,
      [token],
    );
    const row = rowsOf(r)[0];
    if (!row) return null;
    if (new Date(row.session_expires || row.sessionexpires || 0).getTime() < Date.now()) {
      await db.pq(`DELETE FROM session WHERE token = $1`, [token]);
      return null;
    }
    if (!Number(row.active ?? 1)) return null;
    return row;
  } catch {
    return null;
  }
}
