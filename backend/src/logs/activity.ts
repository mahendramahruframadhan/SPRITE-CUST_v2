import * as crypto from 'crypto';
import { resolveSessionUser } from '../auth/session';

export interface ActivityInput {
  who?: string;
  action: string;
  category?: string;
  detail?: string;
  recordUuid?: string;
}

// Tulis satu baris activity_logs. Tak pernah melempar — logging tidak boleh
// menggagalkan alur utama (audit/invoice/tambah kasus/sync).
export async function logActivity(db: any, input: ActivityInput): Promise<void> {
  try {
    if (!input || !String(input.action || '').trim()) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const who = String(input.who || 'Admin').slice(0, 120);
    const action = String(input.action).slice(0, 500);
    const category = input.category ? String(input.category).slice(0, 40) : null;
    const detail = input.detail ? String(input.detail).slice(0, 500) : null;
    const recordUuid = input.recordUuid ? String(input.recordUuid).slice(0, 60) : null;
    await db.pq(
      `INSERT INTO activity_logs (id,who,action,category,detail,record_uuid,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, who, action, category, detail, recordUuid, now],
    );
  } catch {
    // abaikan — tabel/kolom belum termigrasi di DB lama
  }
}

// Nama pelaku: HANYA dari token sesi yang sudah diverifikasi server.
// Header client-supplied (x-user-email dsb) TIDAK PERNAH dipakai untuk
// identitas — bisa dipalsukan siapa pun. Tanpa sesi valid → 'system'
// (fallback aman, bukan akun admin/privileged mana pun).
export async function resolveWho(db: any, req: any, fallback?: string): Promise<string> {
  try {
    if (fallback && String(fallback).trim()) return String(fallback).slice(0, 120);
    const u = await resolveSessionUser(db, req);
    if (u?.name) return String(u.name).slice(0, 120);
    if (u?.email) return String(u.email).slice(0, 120);
    return 'system';
  } catch {
    return 'system';
  }
}

// Info ringkas kasus untuk teks log: "#NO (CLIENT)".
export async function caseLabel(db: any, uuid: string): Promise<string> {
  try {
    const r: any = await db.pq(
      `SELECT no, client FROM assistance_records WHERE record_uuid=$1 LIMIT 1`,
      [uuid],
    );
    const row = (r.rows || r)[0];
    if (!row) return `kasus ${String(uuid).slice(0, 8)}`;
    return `kasus #${row.no} (${row.client})`;
  } catch {
    return `kasus ${String(uuid).slice(0, 8)}`;
  }
}
