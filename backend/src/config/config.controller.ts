import { Controller, Get, Put, Body } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('config')
export class ConfigController {
  private db: any = getDb();
  @Get()
  async get() {
    try {
      const res: any = await this.db.execute(`SELECT value FROM app_config WHERE key='sheetConfig'` as any);
      const row = (res.rows||res)[0];
      if (row?.value) return { source:'db', config: JSON.parse(row.value) };
    } catch {}
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
  async put(@Body() body:any){
    const val = JSON.stringify(body.config||body).replace(/'/g,"''");
    await this.db.execute(`INSERT INTO app_config (key,value,updated_at) VALUES ('sheetConfig','${val}','${new Date().toISOString()}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at` as any);
    return { ok:true };
  }
}
