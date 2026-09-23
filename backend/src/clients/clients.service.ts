import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getDb } from '../db/drizzle.service';
import { logActivity } from '../logs/activity';
import { checkClientInput, checkStatusInput, ContractError } from './contract.validation';

// CRUD koleksi client/brand + status kontrak (MONTHLY/BARU/GRATIS).
// Context7 nestjs: controller tipis + service Injectable; validasi input di
// service (bukan cuma client). Gaya repo: raw SQL + esc() seperti pdf/cases.
// Tulis dijaga PermGuard modul 'clients'; baca (GET) sengaja terbuka.
const esc = (v: any) => String(v ?? '').replace(/'/g, "''");

const fail = (code: string, message: string, status = HttpStatus.BAD_REQUEST) => {
  throw new HttpException({ code, message }, status);
};

function rowsOf(res: any): any[] {
  return res?.rows ?? (Array.isArray(res) ? res : []);
}

function cleanStr(v: any, max = 200): string {
  return String(v ?? '').trim().slice(0, max);
}

// ContractError (murni, teruji) → HttpException dengan kode yang sama agar
// frontend bisa membedakan 409 duplikat dari gagal jaringan.
function rethrowContract(e: unknown): never {
  if (e instanceof ContractError) fail(e.code, e.message, e.status);
  throw e;
}

@Injectable()
export class ClientsService {
  private db: any = getDb();

  // ---- clients ----
  async listClients() {
    const r: any = await this.db.execute(`SELECT * FROM clients ORDER BY created_at DESC` as any);
    return rowsOf(r);
  }

  async createClient(b: any, who: string) {
    let brand: string;
    try {
      brand = checkClientInput(b);
    } catch (e) {
      rethrowContract(e);
    }
    const now = new Date().toISOString();
    const id = `cl_${randomUUID().slice(0, 8)}`;
    await this.db.execute(
      `INSERT INTO clients (id,brand,company,pic,contact,joined_at,source,note,created_at,updated_at) VALUES ('${id}','${esc(brand!)}','${esc(cleanStr(b.company))}','${esc(cleanStr(b.pic))}','${esc(cleanStr(b.contact))}','${esc(cleanStr(b.joinedAt, 10))}','${esc(cleanStr(b.source))}','${esc(cleanStr(b.note, 500))}','${now}','${now}')` as any,
    );
    await logActivity(this.db, { who, action: `menambah client baru (${brand!})`, category: 'Penambahan', detail: cleanStr(b.company, 200) });
    return { id, brand };
  }

  async updateClient(id: string, b: any, who: string) {
    const cur = rowsOf(await this.db.execute(`SELECT * FROM clients WHERE id='${esc(id)}' LIMIT 1` as any))[0];
    if (!cur) fail('NOT_FOUND', 'Client tidak ditemukan.', HttpStatus.NOT_FOUND);
    let brand: string;
    try {
      brand = checkClientInput({ brand: b.brand ?? cur.brand });
    } catch (e) {
      rethrowContract(e);
    }
    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE clients SET brand='${esc(brand!)}',company='${esc(cleanStr(b.company ?? cur.company))}',pic='${esc(cleanStr(b.pic ?? cur.pic))}',contact='${esc(cleanStr(b.contact ?? cur.contact))}',joined_at='${esc(cleanStr(b.joinedAt ?? cur.joined_at, 10))}',source='${esc(cleanStr(b.source ?? cur.source))}',note='${esc(cleanStr(b.note ?? cur.note, 500))}',updated_at='${now}' WHERE id='${esc(id)}'` as any,
    );
    await logActivity(this.db, { who, action: `memperbarui client (${brand!})`, category: 'Perubahan' });
    return { id, brand };
  }

  async removeClient(id: string, who: string) {
    const cur = rowsOf(await this.db.execute(`SELECT * FROM clients WHERE id='${esc(id)}' LIMIT 1` as any))[0];
    if (!cur) fail('NOT_FOUND', 'Client tidak ditemukan.', HttpStatus.NOT_FOUND);
    await this.db.execute(`DELETE FROM clients WHERE id='${esc(id)}'` as any);
    await logActivity(this.db, { who, action: `menghapus client (${cur.brand})`, category: 'Perubahan' });
    return { id };
  }

  // ---- brand-statuses ----
  async listStatuses() {
    const r: any = await this.db.execute(`SELECT * FROM brand_statuses ORDER BY created_at DESC` as any);
    return rowsOf(r);
  }

  private async assertNoDupe(brand: string, type: string, exceptId?: string) {
    const r: any = await this.db.execute(
      `SELECT id FROM brand_statuses WHERE lower(brand)=lower('${esc(brand)}') AND type='${esc(type)}'${exceptId ? ` AND id<>'${esc(exceptId)}'` : ''} LIMIT 1` as any,
    );
    if (rowsOf(r).length) fail('BRAND_EXISTS', `${brand} sudah ada di daftar ${type === 'GRATIS' ? 'Free' : type}.`, HttpStatus.CONFLICT);
  }

  async createStatus(b: any, who: string) {
    let parsed: { brand: string; type: string; expiredAt: string };
    try {
      parsed = checkStatusInput(b);
    } catch (e) {
      rethrowContract(e);
    }
    const { brand, type, expiredAt } = parsed!;
    await this.assertNoDupe(brand, type);
    const now = new Date().toISOString();
    const id = `bs_${randomUUID().slice(0, 8)}`;
    const fee = Number(b.monthlyFee) || 0;
    await this.db.execute(
      `INSERT INTO brand_statuses (id,brand,type,start_at,expired_at,monthly_fee,pic,note,created_at,updated_at) VALUES ('${id}','${esc(brand)}','${esc(type)}','${esc(cleanStr(b.startAt, 10))}','${esc(expiredAt)}',${fee},'${esc(cleanStr(b.pic))}','${esc(cleanStr(b.note, 500))}','${now}','${now}')` as any,
    );
    await logActivity(this.db, { who, action: `menambah status brand ${brand} (${type})`, category: 'Penambahan', detail: expiredAt ? `expired ${expiredAt}` : '' });
    return { id, brand, type, expiredAt };
  }

  async updateStatus(id: string, b: any, who: string) {
    const cur = rowsOf(await this.db.execute(`SELECT * FROM brand_statuses WHERE id='${esc(id)}' LIMIT 1` as any))[0];
    if (!cur) fail('NOT_FOUND', 'Status brand tidak ditemukan.', HttpStatus.NOT_FOUND);
    let parsed: { brand: string; type: string; expiredAt: string };
    try {
      parsed = checkStatusInput({ brand: b.brand ?? cur.brand, type: b.type ?? cur.type, expiredAt: b.expiredAt ?? cur.expired_at });
    } catch (e) {
      rethrowContract(e);
    }
    const { brand, type, expiredAt } = parsed!;
    await this.assertNoDupe(brand, type, id);
    const now = new Date().toISOString();
    const fee = b.monthlyFee !== undefined ? Number(b.monthlyFee) || 0 : Number(cur.monthly_fee) || 0;
    await this.db.execute(
      `UPDATE brand_statuses SET brand='${esc(brand)}',type='${esc(type)}',start_at='${esc(cleanStr(b.startAt ?? cur.start_at, 10))}',expired_at='${esc(expiredAt)}',monthly_fee=${fee},pic='${esc(cleanStr(b.pic ?? cur.pic))}',note='${esc(cleanStr(b.note ?? cur.note, 500))}',updated_at='${now}' WHERE id='${esc(id)}'` as any,
    );
    await logActivity(this.db, { who, action: `memperbarui status brand ${brand} (${type})`, category: 'Perubahan' });
    return { id, brand, type, expiredAt };
  }

  async removeStatus(id: string, who: string) {
    const cur = rowsOf(await this.db.execute(`SELECT * FROM brand_statuses WHERE id='${esc(id)}' LIMIT 1` as any))[0];
    if (!cur) fail('NOT_FOUND', 'Status brand tidak ditemukan.', HttpStatus.NOT_FOUND);
    await this.db.execute(`DELETE FROM brand_statuses WHERE id='${esc(id)}'` as any);
    await logActivity(this.db, { who, action: `menghapus status brand ${cur.brand} (${cur.type})`, category: 'Perubahan' });
    return { id };
  }
}
