import { Controller, Get, Put, Patch, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { maskKey } from '../ai/ai.controller';
import * as fs from 'fs';
import * as path from 'path';

const cleanKey = (k: any) => String(k || 'sheetConfig').replace(/[^a-zA-Z0-9_]/g, '') || 'sheetConfig';

// Master status Billing/Finance yang dikelola dari halaman Pengaturan.
// Disimpan di app_config agar disharing semua browser (localStorage hanya cache).
const DEFAULT_STATUS_OPTIONS: Record<string, string[]> = {
  auditActions: ['BELUM DIVALIDASI', 'VALID - SIAP INVOICE', 'PERLU DICEK ULANG'],
  invoiceActions: ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'PAID'],
};

const cleanStatusList = (arr: any, fallback: string[]) => {
  if (!Array.isArray(arr)) return [...fallback];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 50) break;
  }
  return out.length ? out : [...fallback];
};

@Controller('config')
export class ConfigController {
  private db: any = getDb();
  @Get()
  async get(@Query('key') key?: string) {
    const k = cleanKey(key);
    try {
      const res: any = await this.db.execute(`SELECT value FROM app_config WHERE key='${k}'` as any);
      const row = (res.rows || res)[0];
      if (row?.value) {
        const cfg = JSON.parse(row.value);
        // ponytail: key AI tak pernah utuh ke browser (hemat endpoint khusus)
        if (k === 'aiConfig' && cfg.apiKey) cfg.apiKey = maskKey(cfg.apiKey);
        if (k === 'aiConnections' && Array.isArray(cfg.connections)) {
          for (const c of cfg.connections) {
            if (c && c.apiKey) {
              c.hasKey = true;
              c.apiKey = maskKey(c.apiKey);
            }
          }
        }
        return { source: 'db', key: k, config: cfg };
      }
    } catch {}
    if (k !== 'sheetConfig') return { source: 'empty', key: k, config: {} };
    try {
      const p = path.resolve(__dirname, '..','..','..','frontend','src','data','sheetConfig.js');
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p,'utf8');
        const jsonStr = raw.split('export const DEFAULT_CONFIG = ')[1].trim().replace(/;$/,'');
        return { source:'frontend', config: JSON.parse(jsonStr) };
      }
    } catch (e:any){ return { error: String(e.message) }; }
    return { source:'empty', config:{} };
  }
  @Put()
  @UseGuards(PermGuard)
  @Perm('cfg')
  async put(@Body() body:any){
    const k = cleanKey(body.key);
    const incoming = body.config || body;
    // key kosong/mask = tidak diubah (jangan timpa key asli dengan ••••)
    if (k === 'aiConfig' && (!incoming.apiKey || String(incoming.apiKey).startsWith('••••'))) {
      try {
        const r: any = await this.db.execute(`SELECT value FROM app_config WHERE key='aiConfig'` as any);
        const old = JSON.parse((r.rows || r)[0]?.value || '{}');
        if (old.apiKey) incoming.apiKey = old.apiKey;
      } catch {}
    }
    // daftar koneksi: preservasi key per item (by id) bila kosong/mask
    if (k === 'aiConnections' && Array.isArray(incoming.connections)) {
      try {
        const r: any = await this.db.execute(`SELECT value FROM app_config WHERE key='aiConnections'` as any);
        const oldList = JSON.parse((r.rows || r)[0]?.value || '{}')?.connections || [];
        const oldById: any = {};
        for (const o of oldList) if (o && o.id) oldById[o.id] = o;
        for (const c of incoming.connections) {
          if (c && c.id && oldById[c.id]?.apiKey && (!c.apiKey || String(c.apiKey).startsWith('••••'))) {
            c.apiKey = oldById[c.id].apiKey;
          }
        }
      } catch {}
    }
    const val = JSON.stringify(incoming).replace(/'/g,"''");
    await this.db.execute(`INSERT INTO app_config (key,value,updated_at) VALUES ('${k}','${val}','${new Date().toISOString()}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at` as any);
    return { ok:true, key: k };
  }

  // Daftar master status (CRUD dari halaman Pengaturan). GET terbuka;
  // PUT dijaga modul 'billing' (dimiliki role Admin CS & Finance).
  @Get('status-options')
  async statusOptions() {
    const read = async (k: string, fallback: string[]) => {
      try {
        const r: any = await this.db.execute(`SELECT value FROM app_config WHERE key='${k}'` as any);
        const raw = (r.rows || r)[0]?.value;
        if (!raw) return { list: [...fallback], fromDb: false };
        return { list: cleanStatusList(JSON.parse(raw), fallback), fromDb: true };
      } catch {
        return { list: [...fallback], fromDb: false };
      }
    };
    const audit = await read('auditActions', DEFAULT_STATUS_OPTIONS.auditActions);
    const invoice = await read('invoiceActions', DEFAULT_STATUS_OPTIONS.invoiceActions);
    return {
      source: audit.fromDb && invoice.fromDb ? 'db' : 'default',
      auditActions: audit.list,
      invoiceActions: invoice.list,
    };
  }

  @Put('status-options')
  @UseGuards(PermGuard)
  @Perm('billing')
  async saveStatusOptions(@Body() body: any) {    const out: any = { ok: true };
    for (const k of ['auditActions', 'invoiceActions'] as const) {
      if (body?.[k] === undefined) continue;
      const list = cleanStatusList(body[k], DEFAULT_STATUS_OPTIONS[k]);
      const val = JSON.stringify(list).replace(/'/g, "''");
      await this.db.execute(`INSERT INTO app_config (key,value,updated_at) VALUES ('${k}','${val}','${new Date().toISOString()}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at` as any);
      out[k] = list;
    }
    return out;
  }

  // Rename satu status master + migrasi SEMUA baris kasus yang memakainya.
  // Dipakai modal "Master Status Invoice" (Finance) agar CRUD lengkap: tambah, ubah nama, hapus.
  // PUT dijaga modul 'billing' (dimiliki role Admin CS & Finance).
  @Patch('status-options/rename')
  @UseGuards(PermGuard)
  @Perm('billing')
  async renameStatusOption(@Body() body: any) {
    const scope = body?.scope === 'auditActions' ? 'auditActions' : 'invoiceActions';
    const norm = (v: any) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();
    const from = norm(body?.from);
    const to = norm(body?.to);
    if (!from) throw new BadRequestException('Status asal wajib diisi.');
    if (!to) throw new BadRequestException('Nama baru tidak boleh kosong.');
    if (to === from) throw new BadRequestException('Nama baru sama dengan nama lama.');

    const fallback = DEFAULT_STATUS_OPTIONS[scope];
    let list: string[];
    try {
      const r: any = await this.db.execute(`SELECT value FROM app_config WHERE key='${scope}'` as any);
      const raw = (r.rows || r)[0]?.value;
      list = raw ? cleanStatusList(JSON.parse(raw), fallback) : [...fallback];
    } catch {
      list = [...fallback];
    }
    if (!list.includes(from)) throw new BadRequestException(`Status "${from}" tidak ditemukan.`);
    if (list.some((a) => a.toLowerCase() === to.toLowerCase())) {
      throw new BadRequestException(`Status "${to}" sudah ada.`);
    }

    const next = list.map((a) => (a === from ? to : a));
    const val = JSON.stringify(next).replace(/'/g, "''");
    const now = new Date().toISOString();
    await this.db.execute(`INSERT INTO app_config (key,value,updated_at) VALUES ('${scope}','${val}','${now}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at` as any);

    // Migrasi status per-kasus agar tidak yatim (orphan).
    const esc = (s: string) => s.replace(/'/g, "''");
    const target = scope === 'auditActions'
      ? { table: 'audit_status', col: 'action' }
      : { table: 'invoice_status', col: 'status' };
    let migrated = 0;
    try {
      const cnt: any = await this.db.execute(`SELECT COUNT(*) as c FROM ${target.table} WHERE ${target.col}='${esc(from)}'` as any);
      migrated = +((cnt.rows || cnt)[0]?.c || 0);
      if (migrated > 0) {
        await this.db.execute(`UPDATE ${target.table} SET ${target.col}='${esc(to)}', updated_at='${now}' WHERE ${target.col}='${esc(from)}'` as any);
      }
    } catch {
      migrated = 0;
    }
    return { ok: true, scope, from, to, [scope]: next, migrated };
  }
}
