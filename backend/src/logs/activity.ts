import * as crypto from 'crypto';
import { resolveSessionUser } from '../auth/session';
import { esc } from '../db/sql';

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
    const category = input.category ? `'${esc(String(input.category).slice(0, 40))}'` : 'NULL';
    const detail = input.detail ? `'${esc(String(input.detail).slice(0, 500))}'` : 'NULL';
    const recordUuid = input.recordUuid ? `'${esc(String(input.recordUuid).slice(0, 60))}'` : 'NULL';
    await db.execute(
      `INSERT INTO activity_logs (id,who,action,category,detail,record_uuid,created_at) VALUES ('${id}','${esc(who)}','${esc(action)}',${category},${detail},${recordUuid},'${now}')` as any,
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
    const r: any = await db.execute(
      `SELECT no, client FROM assistance_records WHERE record_uuid='${esc(uuid)}' LIMIT 1` as any,
    );
    const row = (r.rows || r)[0];
    if (!row) return `kasus ${String(uuid).slice(0, 8)}`;
    return `kasus #${row.no} (${row.client})`;
  } catch {
    return `kasus ${String(uuid).slice(0, 8)}`;
  }
}
