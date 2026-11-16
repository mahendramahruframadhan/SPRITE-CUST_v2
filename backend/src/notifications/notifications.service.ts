import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getDb } from '../db/drizzle.service';

// Notifikasi antar-user: satu baris = satu notif untuk satu penerima.
// Alur baca/tulis milik sendiri dijaga lewat user_id dari sesi (controller),
// kirim ke user lain dibatasi izin modul 'notifications'. Kegunaan trigger
// (PIC follow-up, mark audit, validasi invoice) mengambil fungsi bebas di
// bawah — dipanggil pemicu lewat best-effort, gagal tidak pernah menahan
// operasi utamanya.
export type NotifRow = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string | null;
  groupId?: string;
};

const fail = (code: string, message: string, status = HttpStatus.BAD_REQUEST): never => {
  throw new HttpException({ code, message }, status);
};

const rowToApi = (r: any) => ({
  id: r.id,
  userId: r.user_id,
  type: r.type,
  title: r.title,
  body: r.body || '',
  link: r.link || '',
  groupId: r.group_id || null,
  readAt: r.read_at ? String(r.read_at) : null,
  createdAt: r.created_at ? String(r.created_at) : null,
});

// Cari user aktif by nama (trim + case-insensitive) — deterministic:
// yang dibuat lebih dulu menang bila ada dua nama sama. NULL bila tidak ketemu.
// Normalisasi di JS (bukan lower/trim SQL) — pg-mem belum punya fungsi native
// itu, dan jumlah user kecil sehingga select semuanya aman.
export async function findUserIdByName(db: any, name: string): Promise<string | null> {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  const r = await db.pq(`SELECT id, name, created_at FROM "user" WHERE COALESCE(active,1)=1 ORDER BY created_at`);
  for (const row of r.rows || r) {
    if (String(row.name || '').trim().toLowerCase() === target) return row.id;
  }
  return null;
}

// Batch insert — rows final dari caller (user sudah divalidasi & aktif).
// Satu statement per baris: pg-mem salah menggeser parameter pada
// VALUES multi-tupel; jumlah baris dibatasi caller (≤50) sehingga loop murah.
export async function insertNotifications(db: any, rows: NotifRow[]): Promise<void> {
  for (const r of rows || []) {
    await db.pq(
      `INSERT INTO notifications (id, user_id, type, title, body, link, group_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), r.userId, r.type, r.title, r.body || null, r.link || null, r.groupId || null, new Date().toISOString()],
    );
  }
}

// Trigger/notification call-site: error dijelaskan di log, tidak pernah ditolak
// pekerja utama. label membantu identifikasi sumber khususnya di log.
export async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn('[notifications]', label, e);
  }
}

@Injectable()
export class NotificationsService {
  private db = getDb();
  private readonly LIMIT = 50;

  async list(userId: string): Promise<any> {
    const r = await this.db.pq(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT ${this.LIMIT}`,
      [userId],
    );
    const notifications = (r.rows || r).map(rowToApi);
    const unreadCount = await this.getUnreadCount(userId);
    return { notifications, unreadCount };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const r = await this.db.pq(`SELECT COUNT(*) AS c FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [userId]);
    return Number((r.rows || r)[0]?.c || 0);
  }

  async send(userIds: string[], type: string, title: string, body?: string, link?: string, groupId?: string): Promise<any> {
    const ids = [...new Set(Array.isArray(userIds) ? userIds.map(String).filter(Boolean) : [])];
    if (!ids.length || ids.length > 50) {
      fail('VALIDATION_ERROR', 'userIds wajib 1..50 penerima unik.');
    }
    const t = String(type || '').trim();
    if (!t) fail('VALIDATION_ERROR', 'type wajib diisi.');
    const ttl = String(title || '').trim();
    if (!ttl) fail('VALIDATION_ERROR', 'title wajib diisi.');
    // Link wajib path internal /… ≤200 — frontend mengrahkan receiver ke sini
    // (navigate), bukan navigasi eksternal. Nilai luar → null (diam), bukan error.
    let lk: string | null = typeof link === 'string' && link ? link : null;
    if (lk && !/^\//.test(lk)) lk = null;
    if (lk && lk.length > 200) fail('VALIDATION_ERROR', 'Link maksimal 200 karakter.');
    // pg-mem belum mendukung = ANY($1) untuk array — ambil semua user lalu cek
    // di Map (jumlah user kecil; konsisten dengan findUserIdByName).
    const found = await this.db.pq(`SELECT id, COALESCE(active,1) AS active FROM "user"`);
    const known = new Map((found.rows || found).map((u: any) => [u.id, Number(u.active) === 1]));
    for (const id of ids) {
      const active = known.get(id);
      if (active === undefined || !active) {
        fail('USER_NOT_FOUND', `Penerima tidak dikenal atau tidak aktif: ${id}`);
      }
    }
    await insertNotifications(this.db, ids.map((userId) => ({ userId, type: t, title: ttl, body, link: lk, groupId })));
    return { ok: true, delivered: ids.length };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const r = await this.db.pq(
      // Tanpa read_at IS NULL: baca-ulang idempoten (sudah terbaca → tetap ok),
      // scope milik sendiri tetap dijaga user_id (milik lain → tetap 404).
      `UPDATE notifications SET read_at=$1 WHERE id=$2 AND user_id=$3 RETURNING id`,
      [new Date().toISOString(), id, userId],
    );
    if (!(r.rows || r).length) fail('NOT_FOUND', 'Notifikasi tidak ditemukan.', HttpStatus.NOT_FOUND);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db.pq(`UPDATE notifications SET read_at=$1 WHERE user_id=$2 AND read_at IS NULL`, [new Date().toISOString(), userId]);
  }

  async remove(userId: string, id: string): Promise<void> {
    const r = await this.db.pq(`DELETE FROM notifications WHERE id=$1 AND user_id=$2 RETURNING id`, [id, userId]);
    if (!(r.rows || r).length) fail('NOT_FOUND', 'Notifikasi tidak ditemukan.', HttpStatus.NOT_FOUND);
  }
}
