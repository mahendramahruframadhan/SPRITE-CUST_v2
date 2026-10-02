import { Controller, Get, Post, Put, Query, Body, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { getDb } from '../db/drizzle.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { SessionGuard } from '../auth/session.guard';
import { logActivity, resolveWho } from '../logs/activity';

// Jadwal audit mingguan POPI NAVA per bulan (tab Jadwal Audit, frontend
// AuditSchedule.jsx). Satu baris per bulan: weeks disimpan sebagai JSON teks
// {W1..W5: [item {id,type,...}]}. M-3: GET dan tulis sama-sama dijaga
// PermGuard @Perm('popinava') — frontend hanya memakainya dari /popinava
// (canWrite = can('popinava')), tanpa matriks izin baru. Tandai "sudah
// audit" (POST mark) mengubah flag audited di weeks sekaligus mencatat
// audit_history (siapa, jam & tanggal) untuk riwayat.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const WEEK_KEYS = ['W1', 'W2', 'W3', 'W4', 'W5'];
const MAX_TOTAL_ITEMS = 20000;

function fail(code: string, message: string, status: number): never {
  throw new HttpException({ code, message }, status);
}

function emptyWeeks(): Record<string, any[]> {
  return { W1: [], W2: [], W3: [], W4: [], W5: [] };
}

// Normalisasi otoritatif server: hanya W1..W5 yang disimpan, tiap minggu
// wajib array berisi objek, total item dibatasi (anti-abuse; UI tanpa batas
// slot per keputusan owner).
function normalizeWeeks(raw: unknown): Record<string, any[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('VALIDATION_FAILED', 'weeks harus objek {W1..W5}.', HttpStatus.BAD_REQUEST);
  }
  const src = raw as Record<string, unknown>;
  const weeks = emptyWeeks();
  let total = 0;
  for (const key of WEEK_KEYS) {
    const value = src[key];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) {
      fail('VALIDATION_FAILED', `weeks.${key} harus array.`, HttpStatus.BAD_REQUEST);
    }
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        fail('VALIDATION_FAILED', `weeks.${key} hanya boleh berisi objek item.`, HttpStatus.BAD_REQUEST);
      }
      total += 1;
    }
    weeks[key] = value;
  }
  if (total > MAX_TOTAL_ITEMS) {
    fail('VALIDATION_FAILED', `Total item jadwal maksimal ${MAX_TOTAL_ITEMS}.`, HttpStatus.BAD_REQUEST);
  }
  return weeks;
}

function parseMonth(raw: unknown): string {
  const month = String(raw ?? '').trim();
  if (!MONTH_RE.test(month)) {
    fail('VALIDATION_FAILED', 'month harus format YYYY-MM.', HttpStatus.BAD_REQUEST);
  }
  return month;
}

@UseGuards(SessionGuard)
@Controller('audit-schedule')
export class AuditScheduleController {
  private db = getDb();

  @Get()
  @UseGuards(PermGuard)
  @Perm('popinava')
  async get(@Query('month') month: string) {
    const m = parseMonth(month);
    const r = await this.db.pq(`SELECT weeks, updated_by, updated_at FROM audit_schedule WHERE month=$1`, [m]);
    const row = (r.rows || r)[0];
    let stored: unknown = null;
    if (row?.weeks) {
      try {
        stored = JSON.parse(row.weeks);
      } catch {
        stored = null; // korup → perlakukan kosong
      }
    }
    return {
      month: m,
      weeks: stored ? normalizeWeeks(stored) : emptyWeeks(),
      updatedBy: row?.updated_by || null,
      updatedAt: row?.updated_at || null,
    };
  }

  @Put()
  @UseGuards(PermGuard)
  @Perm('popinava')
  async put(@Body() body: any, @Req() req: any) {
    const month = parseMonth(body?.month);
    if (body?.weeks === undefined || body?.weeks === null) {
      fail('VALIDATION_FAILED', 'weeks wajib diisi.', HttpStatus.BAD_REQUEST);
    }
    const weeks = normalizeWeeks(body.weeks);
    const now = new Date().toISOString();
    const who = await resolveWho(this.db, req);
    await this.db.pq(
      `INSERT INTO audit_schedule (month, weeks, updated_by, updated_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (month) DO UPDATE SET weeks=$2, updated_by=$3, updated_at=$4`,
      [month, JSON.stringify(weeks), who, now],
    );
    const items = WEEK_KEYS.reduce((n, k) => n + weeks[k].length, 0);
    await logActivity(this.db, {
      who,
      action: 'Simpan jadwal audit',
      category: 'popinava',
      detail: `Bulan ${month} · ${items} item`,
    });
    return { ok: true, month, weeks, updatedBy: who, updatedAt: now };
  }

  // Tandai / batalkan "sudah audit" untuk satu item. Flag audited ditulis
  // di weeks (sumber kebenaran), lalu aksi dicatat di audit_history:
  // pelaku (dari sesi), action mark/undo, dan created_at (jam & tanggal).
  @Post('mark')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async mark(@Body() body: any, @Req() req: any) {
    const month = parseMonth(body?.month);
    const weekKey = String(body?.weekKey || '');
    if (!WEEK_KEYS.includes(weekKey)) {
      fail('VALIDATION_FAILED', 'weekKey harus W1..W5.', HttpStatus.BAD_REQUEST);
    }
    const itemId = String(body?.itemId || '').trim();
    if (!itemId) {
      fail('VALIDATION_FAILED', 'itemId wajib diisi.', HttpStatus.BAD_REQUEST);
    }
    const audited = Boolean(body?.audited);

    const r = await this.db.pq(`SELECT weeks FROM audit_schedule WHERE month=$1`, [month]);
    const row = (r.rows || r)[0];
    let stored: unknown = null;
    if (row?.weeks) {
      try {
        stored = JSON.parse(row.weeks);
      } catch {
        stored = null;
      }
    }
    const weeks = stored ? normalizeWeeks(stored) : emptyWeeks();
    const item = (weeks[weekKey] || []).find((x: any) => x?.id === itemId);
    if (!item) {
      fail('ITEM_NOT_FOUND', 'Item tidak ditemukan di minggu tersebut.', HttpStatus.BAD_REQUEST);
    }
    item.audited = audited;

    const now = new Date().toISOString();
    const who = await resolveWho(this.db, req);
    await this.db.pq(
      `INSERT INTO audit_schedule (month, weeks, updated_by, updated_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (month) DO UPDATE SET weeks=$2, updated_by=$3, updated_at=$4`,
      [month, JSON.stringify(weeks), who, now],
    );

    const label = item.type === 'brand' ? item.brand : item.name;
    const action = audited ? 'mark' : 'undo';
    const hid = crypto.randomUUID();
    await this.db.pq(
      `INSERT INTO audit_history (id, month, week_key, item_id, item_type, item_label, action, who, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [hid, month, weekKey, itemId, item.type || null, label, action, who, now],
    );
    await logActivity(this.db, {
      who,
      action: audited ? 'Tandai audit' : 'Batalkan tanda audit',
      category: 'popinava',
      detail: `${label} · ${month} ${weekKey}`,
    });
    return {
      ok: true,
      month,
      weeks,
      history: [
        {
          id: hid,
          month,
          week_key: weekKey,
          item_id: itemId,
          item_type: item.type || null,
          item_label: label,
          action,
          who,
          created_at: now,
        },
      ],
    };
  }

  // Riwayat tandai audit per bulan (terbaru di atas), bisa per item.
  @Get('history')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async history(@Query('month') month: string, @Query('item_id') itemId?: string) {
    const m = parseMonth(month);
    const base = `SELECT id, month, week_key, item_id, item_type, item_label, action, who, created_at
      FROM audit_history WHERE month=$1`;
    const r = itemId
      ? await this.db.pq(`${base} AND item_id=$2 ORDER BY created_at DESC, id DESC`, [m, String(itemId)])
      : await this.db.pq(`${base} ORDER BY created_at DESC, id DESC`, [m]);
    return { month: m, history: r.rows || r };
  }
}
