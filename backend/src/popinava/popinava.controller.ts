import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Req,
  UseGuards, HttpException, HttpStatus, HttpCode,
} from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { esc } from '../db/sql';
import { Perm, PermGuard } from '../auth/perm.guard';
import { SessionGuard } from '../auth/session.guard';
import { logActivity, resolveWho } from '../logs/activity';

// Endpoint master outlet POPI NAVA (spec §9 fase backend): list/get/create/
// patch/delete/bulk di Postgres. Baca terbuka untuk sesi login (pola roles),
// tulis dijaga PermGuard @Perm('popinava'). Impor/ekspor file masih lokal di
// frontend (wizard client-side) — endpoint multipart menyusul saat frontend
// beralih. Setiap operasi tulis mencatat activity_logs kategori 'popinava'.

const COLS = [
  'uuid', 'brand_name', 'rvt_custcode', 'dept_code', 'dept_name', 'dept_channel_name',
  'dept_reference', 'iso_code', 'address', 'city', 'province', 'postcode', 'country',
  'area', 'region', 'email', 'notes', 'created_at',
];
const SORTABLE: Record<string, string> = { ...Object.fromEntries(COLS.map((c) => [c, c])), status: 'status', updated_at: 'updated_at' };
const FILTERS: Record<string, string> = {
  brand: 'brand_name', dept_name: 'dept_name', status: 'status', city: 'city', area: 'area', iso_code: 'iso_code',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTCODE_RE = /^RVT-[A-Z0-9]{2,5}$/;
const ISO_RE = /^ID-[A-Z]{2}$/;
const DEPT_NAMES = ['DISTRIBUTION', 'SHOP'];
const STATUSES = ['active', 'inactive'];

interface FieldError { field: string; code: string; message: string }

function fail(code: string, message: string, status: number, extra?: object): never {
  throw new HttpException({ code, message, ...extra }, status);
}

function clean(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' ');
}

// Validasi otoritatif server — port aturan error §8.1 dari validateRow
// frontend (peringatan postcode/address sengaja tidak memblokir, §8.2).
function validateOutlet(row: Record<string, any>): FieldError[] {
  const errors: FieldError[] = [];
  const err = (field: string, code: string, message: string) => errors.push({ field, code, message });

  if (!row.uuid) err('uuid', 'REQUIRED', 'uuid wajib diisi.');
  else if (!UUID_RE.test(row.uuid)) err('uuid', 'INVALID_FORMAT', 'uuid harus format UUID (8-4-4-4-12).');
  if (!row.brand_name) err('brand_name', 'REQUIRED', 'brand wajib diisi.');
  if (!row.rvt_custcode) err('rvt_custcode', 'REQUIRED', 'custcode wajib diisi.');
  else if (!CUSTCODE_RE.test(row.rvt_custcode)) err('rvt_custcode', 'INVALID_FORMAT', 'custcode harus pola RVT-XXX (contoh: RVT-HGL).');
  if (!row.dept_code) err('dept_code', 'REQUIRED', 'dept_code wajib diisi.');
  else if (!/^\d{8}$/.test(row.dept_code)) err('dept_code', 'INVALID_FORMAT', 'dept_code harus 8 digit angka.');
  if (!row.dept_name) err('dept_name', 'REQUIRED', 'dept_name wajib diisi.');
  else if (!DEPT_NAMES.includes(row.dept_name)) err('dept_name', 'INVALID_FORMAT', 'dept_name harus DISTRIBUTION atau SHOP.');
  if (!row.dept_channel_name) err('dept_channel_name', 'REQUIRED', 'nama channel wajib diisi.');
  else if (row.dept_channel_name.length > 120) err('dept_channel_name', 'TOO_LONG', 'nama channel maksimal 120 karakter.');
  if (!row.iso_code) err('iso_code', 'REQUIRED', 'iso_code wajib diisi.');
  else if (!ISO_RE.test(row.iso_code)) err('iso_code', 'INVALID_FORMAT', 'iso_code harus pola ID-XX (contoh: ID-JB).');
  if (!row.city) err('city', 'REQUIRED', 'kota wajib diisi.');
  if (!row.province) err('province', 'REQUIRED', 'provinsi wajib diisi.');
  if (!row.country) err('country', 'REQUIRED', 'negara wajib diisi.');
  else if (row.country !== 'INDONESIA') err('country', 'COUNTRY_INCONSISTENT', 'kolom negara tidak konsisten, harus INDONESIA.');
  if (row.status && !STATUSES.includes(row.status)) err('status', 'INVALID_FORMAT', 'status harus active atau inactive.');
  return errors;
}

function validationFail(errors: FieldError[]): never {
  fail('VALIDATION_FAILED', errors.map((e) => e.message).join(' '), HttpStatus.BAD_REQUEST, { errors });
}

function pickSource(body: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of COLS) if (body[c] !== undefined) out[c] = clean(body[c]);
  if (body.status !== undefined) out.status = clean(body.status);
  return out;
}

async function rowByUuid(db: any, uuid: string): Promise<any | null> {
  const r: any = await db.pq(`SELECT * FROM popinava_outlets WHERE uuid=$1 LIMIT 1`, [uuid]);
  const row = (r.rows || r)[0];
  return row || null;
}

@UseGuards(SessionGuard)
@Controller('popinava')
export class PopinavaController {
  private db: any = getDb();

  @Get()
  async list(@Query() q: any) {
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const pageSize = Math.min(5000, Math.max(1, parseInt(q.pageSize, 10) || 50));
    const where: string[] = [];
    const params: any[] = [];
    const ph = () => `$${params.length}`;
    const search = clean(q.search).toLowerCase().replace(/[%_]/g, '');
    if (search) {
      params.push(`%${search}%`);
      const s = ph();
      where.push(
        `(LOWER(uuid) LIKE ${s} OR LOWER(dept_channel_name) LIKE ${s} OR LOWER(address) LIKE ${s} OR LOWER(city) LIKE ${s})`,
      );
    }
    for (const [key, col] of Object.entries(FILTERS)) {
      const v = clean(q[key]);
      if (v) { params.push(v); where.push(`${col}=${ph()}`); }
    }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const countR: any = await this.db.pq(`SELECT COUNT(*) as c FROM popinava_outlets${whereSql}`, params);
    const total = Number((countR.rows || countR)[0]?.c || 0);

    const [sortField, sortDir] = clean(q.sort || 'brand_name:asc').split(':');
    const col = SORTABLE[sortField] || 'brand_name';
    const dir = String(sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const rowsR: any = await this.db.pq(
      `SELECT * FROM popinava_outlets${whereSql} ORDER BY ${col} ${dir} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const facet = async (col2: string) => {
      const r: any = await this.db.execute(
        `SELECT DISTINCT ${col2} as v FROM popinava_outlets WHERE ${col2} IS NOT NULL AND ${col2}<>'' ORDER BY ${col2}` as any,
      );
      return (r.rows || r).map((x: any) => x.v);
    };
    return {
      items: rowsR.rows || rowsR,
      total,
      page,
      pageSize,
      facets: {
        brands: await facet('brand_name'),
        cities: await facet('city'),
        areas: await facet('area'),
        statuses: await facet('status'),
      },
    };
  }

  @Get(':uuid')
  async getById(@Param('uuid') uuid: string) {
    const row = await rowByUuid(this.db, uuid);
    if (!row) fail('NOT_FOUND', 'Outlet tidak ditemukan.', HttpStatus.NOT_FOUND);
    return row;
  }

  @Post()
  @UseGuards(PermGuard)
  @Perm('popinava')
  async create(@Body() body: any, @Req() req: any) {
    const src = pickSource(body || {});
    const errors = validateOutlet(src);
    if (errors.length) validationFail(errors);
    if (await rowByUuid(this.db, src.uuid)) fail('DUPLICATE_UUID', `Outlet dengan uuid ${src.uuid} sudah ada.`, HttpStatus.CONFLICT);
    if (!src.created_at) src.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (!src.status) src.status = 'active';
    const cols = COLS.map((c, i) => `$${i + 1}`);
    const placeholders = [...cols, `$${COLS.length + 1}`].join(',');
    await this.db.pq(
      `INSERT INTO popinava_outlets (uuid,brand_name,rvt_custcode,dept_code,dept_name,dept_channel_name,dept_reference,iso_code,address,city,province,postcode,country,area,region,email,notes,created_at,status) VALUES (${placeholders})`,
      [...COLS.map((c) => src[c] ?? ''), src.status],
    );
    const who = await resolveWho(this.db, req);
    await logActivity(this.db, {
      who,
      action: 'Tambah outlet',
      category: 'popinava',
      detail: `${src.brand_name} · ${src.dept_channel_name} · ${src.city}`.slice(0, 500),
      recordUuid: src.uuid,
    });
    return await rowByUuid(this.db, src.uuid);
  }

  @Patch(':uuid')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async update(@Param('uuid') uuid: string, @Body() body: any, @Req() req: any) {
    const existing = await rowByUuid(this.db, uuid);
    if (!existing) fail('NOT_FOUND', 'Outlet tidak ditemukan.', HttpStatus.NOT_FOUND);
    const provided = pickSource(body || {});
    const merged = { ...existing, ...provided, uuid };
    const errors = validateOutlet(merged);
    if (errors.length) validationFail(errors);
    const keys = Object.keys(provided).filter((k) => k !== 'uuid');
    if (!keys.length) return existing;
    const updParams: any[] = [];
    const sets = keys.map((k) => { updParams.push(provided[k]); return `${k}=$${updParams.length}`; });
    updParams.push(new Date().toISOString(), uuid);
    await this.db.pq(
      `UPDATE popinava_outlets SET ${sets.join(',')}, updated_at=$${updParams.length - 1} WHERE uuid=$${updParams.length}`,
      updParams,
    );
    const who = await resolveWho(this.db, req);
    await logActivity(this.db, {
      who,
      action: 'Ubah outlet',
      category: 'popinava',
      detail: `${merged.brand_name} · ${keys.join(', ')}`.slice(0, 500),
      recordUuid: uuid,
    });
    return await rowByUuid(this.db, uuid);
  }

  @Delete(':uuid')
  @HttpCode(204)
  @UseGuards(PermGuard)
  @Perm('popinava')
  async remove(@Param('uuid') uuid: string, @Req() req: any) {
    const existing = await rowByUuid(this.db, uuid);
    if (!existing) fail('NOT_FOUND', 'Outlet tidak ditemukan.', HttpStatus.NOT_FOUND);
    await this.db.pq(`DELETE FROM popinava_outlets WHERE uuid=$1`, [uuid]);
    const who = await resolveWho(this.db, req);
    await logActivity(this.db, {
      who,
      action: 'Hapus outlet',
      category: 'popinava',
      detail: `${existing.brand_name} · ${existing.dept_channel_name}`.slice(0, 500),
      recordUuid: uuid,
    });
  }

  @Post('bulk')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async bulk(@Body() body: any, @Req() req: any) {
    const action = clean(body?.action);
    const uuids = Array.isArray(body?.uuids) ? body.uuids.map((u: unknown) => clean(u)).filter(Boolean) : [];
    if (action !== 'delete' && action !== 'set-status') {
      fail('VALIDATION_FAILED', "action harus 'delete' atau 'set-status'.", HttpStatus.BAD_REQUEST);
    }
    if (!uuids.length) fail('VALIDATION_FAILED', 'uuids tidak boleh kosong.', HttpStatus.BAD_REQUEST);
    if (uuids.length > 1000) fail('VALIDATION_FAILED', 'Maksimal 1000 uuid per aksi massal.', HttpStatus.BAD_REQUEST);
    let status = '';
    if (action === 'set-status') {
      status = clean(body?.status);
      if (!STATUSES.includes(status)) fail('VALIDATION_FAILED', 'status harus active atau inactive.', HttpStatus.BAD_REQUEST);
    }
    const inSql = uuids.map((_: string, i: number) => `$${i + 1}`).join(',');
    let affected = 0;
    if (action === 'delete') {
      const r: any = await this.db.pq(`DELETE FROM popinava_outlets WHERE uuid IN (${inSql}) RETURNING uuid`, uuids);
      affected = (r.rows || r).length;
    } else {
      const r: any = await this.db.pq(
        `UPDATE popinava_outlets SET status=$1, updated_at=$2 WHERE uuid IN (${uuids.map((_: string, i: number) => `$${i + 3}`).join(',')}) RETURNING uuid`,
        [status, new Date().toISOString(), ...uuids],
      );
      affected = (r.rows || r).length;
    }
    const who = await resolveWho(this.db, req);
    await logActivity(this.db, {
      who,
      action: 'Ubah massal outlet',
      category: 'popinava',
      detail: `${action} ${affected} baris${status ? ` → ${status}` : ''}`.slice(0, 500),
    });
    return { affected };
  }
}
