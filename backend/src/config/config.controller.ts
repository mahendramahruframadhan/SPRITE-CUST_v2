import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { maskKey } from '../ai/ai.controller';
import * as fs from 'fs';
import * as path from 'path';

const cleanKey = (k: any) => String(k || 'sheetConfig').replace(/[^a-zA-Z0-9_]/g, '') || 'sheetConfig';

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
    const val = JSON.stringify(incoming).replace(/'/g,"''");
    await this.db.execute(`INSERT INTO app_config (key,value,updated_at) VALUES ('${k}','${val}','${new Date().toISOString()}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at` as any);
    return { ok:true, key: k };
  }
}
