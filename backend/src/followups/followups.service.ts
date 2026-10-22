import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getDb } from '../db/drizzle.service';
import { logActivity } from '../logs/activity';
import { bestEffort, findUserIdByName, insertNotifications } from '../notifications/notifications.service';
import {
  checkFollowupInput,
  checkFollowupPatch,
  checkNoteInput,
  todayJakarta,
  PRIORITIES,
  STATUSES,
  ContractError,
} from './followups.validation';
import { buildFollowupsCsv } from './followups.export';

// CRUD Client Follow-Up (POSTGRES): issue client + tanggal follow-up.
// Pola repo: controller tipis + service Injectable, parameter binding db.pq()
// (Imp#1), tulis dijaga PermGuard 'followups' di controller, baca wajib sesi.
// Aturan PRD: overdue dihitung server (Asia/Jakarta), perubahan status
// selalu terekam sebagai catatan riwayat otomatis, resolved_at ikut status.

const fail = (code: string, message: string, status = HttpStatus.BAD_REQUEST) => {
  throw new HttpException({ code, message }, status);
};

const rethrowContract = (e: unknown): never => {
  if (e instanceof ContractError) fail(e.code, e.message, e.status);
  throw e;
};

 function rowsOf(r: any): any[] {
  return r?.rows ?? (Array.isArray(r) ? r : []);
}

// Trigger notifikasi PIC follow-up (best-effort — gagal tidak pernah menahan
// operasi utama). PIC teks bebas di-match ke user.name (trim + case-insensitive),
// yang menang bila sama = user yang dibuat lebih dulu. Self-assign tidak kirim.
function notifyPicAssigned(db: any, who: string, p: { client: string; title: string; followupDate: string; pic: string }): Promise<void> {
  return bestEffort('notif-followup', async () => {
    const uid = await findUserIdByName(db, p.pic);
    if (!uid || uid === who) return;
    await insertNotifications(db, [
      { userId: uid, type: 'followup_assigned', title: `${p.client} — ${p.title}`, body: `Anda ditunjuk sebagai PIC (follow-up ${p.followupDate})`, link: '/followups' },
    ]);
  });
}

function rowToApi(r: any, notes: any[] = []): any {
  return {
    id: r.id,
    client: r.client_name,
    issueDate: r.issue_date,
    module: r.module,
    title: r.title,
    description: r.description || '',
    priority: r.priority,
    status: r.status,
    followupDate: r.followup_date,
    pic: r.pic || '',
    resolvedAt: r.resolved_at || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    notes,
  };
}

@Injectable()
export class FollowupsService {
  private db: any = getDb();

  // Filter sesuai PRD: client, module, status, priority, from/to
  // (rentang follow-up), overdue=true. Urutan default: overdue dulu,
  // lalu follow-up terdekat.
  async list(q: any): Promise<any[]> {
    const where: string[] = [];
    const params: any[] = [];
    const add = (cond: string, val: any) => {
      params.push(val);
      where.push(cond.replace('?', `$${params.length}`));
    };
    if (q.client) add('client_name = ?', String(q.client));
    if (q.module) add('module = ?', String(q.module));
    if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(String(q.from))) {
      add('followup_date >= ?', String(q.from));
    }
    if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) {
      add('followup_date <= ?', String(q.to));
    }
    if (q.overdue === 'true') {
      add(`status <> 'Selesai' AND followup_date < ?`, todayJakarta());
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderIdx = params.length + 1;
    const r: any = await this.db.pq(
      `SELECT * FROM followups ${whereSql} ORDER BY (status <> 'Selesai' AND followup_date < $${orderIdx}) DESC, followup_date ASC, created_at DESC`,
      [...params, todayJakarta()],
    );
    const rows = rowsOf(r);
    if (!rows.length) return [];
    const notesR: any = await this.db.pq(
      `SELECT * FROM followup_notes WHERE followup_id IN (${rows.map((_, i) => `$${i + 1}`).join(',')}) ORDER BY created_at DESC`,
      rows.map((x: any) => x.id),
    );
    const byFid: Record<string, any[]> = {};
    for (const n of rowsOf(notesR)) {
      byFid[n.followup_id] = byFid[n.followup_id] || [];
      byFid[n.followup_id].push({
        id: n.id,
        text: n.note,
        auto: !!Number(n.is_auto),
        createdAt: n.created_at,
      });
    }
    return rows.map((r: any) => rowToApi(r, byFid[r.id] || []));
  }

  async summary(): Promise<any> {
    const today = todayJakarta();
    // COUNT(CASE ...) bukan FILTER (WHERE ...) — pg-mem saat ini belum
    // mendukung FILTER aggregate, CASE berlaku di kedua engine.
    const r: any = await this.db.pq(
      `SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN status <> 'Selesai' AND followup_date < $1 THEN 1 END) AS overdue,
        COUNT(CASE WHEN status <> 'Selesai' AND followup_date = $1 THEN 1 END) AS due_today,
        COUNT(CASE WHEN status = 'Selesai' THEN 1 END) AS done
       FROM followups`,
      [today],
    );
    const row = rowsOf(r)[0] || {};
    return { total: Number(row.total || 0), overdue: Number(row.overdue || 0), dueToday: Number(row.due_today || 0), done: Number(row.done || 0) };
  }

  async get(id: string): Promise<any> {
    const cur = rowsOf(await this.db.pq(`SELECT * FROM followups WHERE id=$1 LIMIT 1`, [id]))[0];
    if (!cur) fail('NOT_FOUND', 'Issue follow-up tidak ditemukan.', HttpStatus.NOT_FOUND);
    const notesR: any = await this.db.pq(`SELECT * FROM followup_notes WHERE followup_id=$1 ORDER BY created_at DESC`, [id]);
    return rowToApi(cur, rowsOf(notesR).map((n: any) => ({ id: n.id, text: n.note, auto: !!Number(n.is_auto), createdAt: n.created_at })));
  }

  async create(b: any, who: string): Promise<any> {
    let p: any;
    try {
      p = checkFollowupInput(b);
    } catch (e) {
      rethrowContract(e);
    }
    const now = new Date().toISOString();
    const id = `fu_${randomUUID().slice(0, 8)}`;
    // resolved_at kustody awal: status Selesai saat dibuat langsung diisi.
    const resolvedAt = p!.status === 'Selesai' ? now : null;
    await this.db.pq(
      `INSERT INTO followups (id,client_name,issue_date,module,title,description,priority,status,followup_date,pic,resolved_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [id, p!.client, p!.issueDate, p!.module, p!.title, p!.description, p!.priority, p!.status, p!.followupDate, p!.pic, resolvedAt, now],
    );
    if (p!.pic) {
      await notifyPicAssigned(this.db, String(who || ''), p!);
    }
    await logActivity(this.db, {
      who,
      action: `menambah issue follow-up (${p!.client}: ${p!.title})`,
      category: 'Penambahan',
      detail: `follow-up ${p!.followupDate}`,
    });
    return { id };
  }

  async update(id: string, b: any, who: string): Promise<any> {
    const cur = rowsOf(await this.db.pq(`SELECT * FROM followups WHERE id=$1 LIMIT 1`, [id]))[0];
    if (!cur) fail('NOT_FOUND', 'Issue follow-up tidak ditemukan.', HttpStatus.NOT_FOUND);
    let p: any;
    try {
      p = checkFollowupPatch(b, cur);
    } catch (e) {
      rethrowContract(e);
    }
    const now = new Date().toISOString();
    const statusChanged = p!.status !== cur.status;
    const resolvedAt = p!.status === 'Selesai' ? (cur.resolved_at || now) : null;
    const picChanged = String(p!.pic || '').trim() !== String(cur.pic || '').trim();
    await this.db.pq(
      `UPDATE followups SET client_name=$1,issue_date=$2,module=$3,title=$4,description=$5,priority=$6,status=$7,followup_date=$8,pic=$9,resolved_at=$10,updated_at=$11 WHERE id=$12`,
      [p!.client, p!.issueDate, p!.module, p!.title, p!.description, p!.priority, p!.status, p!.followupDate, p!.pic, resolvedAt, now, id],
    );
    if (picChanged && p!.pic) {
      await notifyPicAssigned(this.db, String(who || ''), p!);
    }
    if (statusChanged) {
      // Riwayat otomatis perubahan status (PRD §6), via pq berparameter agar
      // aman terhadap nilai status dari mana pun.
      await this.addNoteRow(id, `Status diubah: ${cur.status} → ${p!.status}`, true, who || '');
      await logActivity(this.db, {
        who,
        action: `mengubah status issue follow-up "${cur.title}" (${p!.client}): ${cur.status} → ${p!.status}`,
        category: 'Perubahan',
        recordUuid: id,
      });
    } else {
      await logActivity(this.db, { who, action: `memperbarui issue follow-up "${p!.title}" (${p!.client})`, category: 'Perubahan', recordUuid: id });
    }
    return { id };
  }

  async remove(id: string, who: string): Promise<any> {
    const cur = rowsOf(await this.db.pq(`SELECT * FROM followups WHERE id=$1 LIMIT 1`, [id]))[0];
    if (!cur) fail('NOT_FOUND', 'Issue follow-up tidak ditemukan.', HttpStatus.NOT_FOUND);
    // I2 (audit): satu statement atomik — catatan riwayat dibersihkan
    // FK followup_notes.followup_id ON DELETE CASCADE (init.ts/schema.pg),
    // tidak lagi dua DELETE manual yang bisa gagal setengah jalan
    // (issue tersisa tanpa riwayat catatannya).
    await this.db.pq(`DELETE FROM followups WHERE id=$1`, [id]);
    await logActivity(this.db, { who, action: `menghapus issue follow-up "${cur.title}" (${cur.client_name})`, category: 'Perubahan', recordUuid: id });
    return { id };
  }

  // I3 (audit): hapus semua issue sekaligus untuk tombol Reset Data — satu
  // permintaan, atomic, catatan ikut cascade. Nilai balik = jumlah baris.
  async removeAll(who: string): Promise<any> {
    const r: any = await this.db.pq(`DELETE FROM followups RETURNING id`);
    const count = Number(r?.rowCount ?? rowsOf(r).length ?? 0);
    await logActivity(this.db, {
      who,
      action: count > 0 ? `menghapus semua issue follow-up (${count} baris)` : 'melakukan reset tanpa issue (0 baris)',
      category: 'Perubahan',
    });
    return { count };
  }

  private async addNoteRow(followupId: string, note: string, isAuto: boolean, who: string): Promise<void> {
    const nid = `n_${randomUUID().slice(0, 10)}`;
    await this.db.pq(
      `INSERT INTO followup_notes (id,followup_id,note,is_auto,who,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [nid, followupId, note, isAuto ? 1 : 0, who || null, new Date().toISOString()],
    );
  }

  async addNote(id: string, b: any, who: string): Promise<any> {
    const cur = rowsOf(await this.db.pq(`SELECT id FROM followups WHERE id=$1 LIMIT 1`, [id]))[0];
    if (!cur) fail('NOT_FOUND', 'Issue follow-up tidak ditemukan.', HttpStatus.NOT_FOUND);
    let text: string;
    try {
      text = checkNoteInput(b);
    } catch (e) {
      rethrowContract(e);
    }
    await this.addNoteRow(id, text!, false, who || '');
    await logActivity(this.db, { who, action: `menambah catatan pada issue follow-up`, category: 'Catatan', detail: text!.slice(0, 200), recordUuid: id });
    return { id };
  }

  // Ekspor CSV baris terfilter — pola sama dengan billing export (satu
  // urutan kolom PRD §8, escaping + anti formula injection).
  async exportCsv(q: any): Promise<string> {
    const rows = await this.list(q);
    return buildFollowupsCsv(rows, todayJakarta());
  }
}
