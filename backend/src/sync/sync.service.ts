import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getDb } from '../db/drizzle.service';
import { SheetsService } from '../sheets/sheets.service';
import { logActivity } from '../logs/activity';
import * as crypto from 'crypto';

// Field yang ikut di-hash untuk deteksi perubahan baris
const HASH_FIELDS = ['no','dateIssue','startDate','finishDate','client','picName','module','subModule','location','issue','assignTo','status','supportCategory','billingStatus','billingCategory','refPriceList','channelTicket','supportType','charges','completionNotes','groupKpi','groupKpiDesc','month','weeknum'];

// Hash cepat tanpa dependensi (FNV-1a ganda) — cukup untuk deteksi ubahan sync
function hashRow(r: any): string {
  const s = HASH_FIELDS.map((k) => String(r[k] ?? '')).join('|');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x9e37;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619);
    h2 = Math.imul(h2 ^ ch, 31);
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

@Injectable()
export class SyncService {
  private logger = new Logger(SyncService.name);
  private db: any = getDb();
  // Kunci anti tumpang-tindih: cron 5-menitan vs tombol manual bisa jalan bareng
  private running = false;
  constructor(private sheets: SheetsService) {}

  @Cron('*/5 * * * *')
  async cronSync() {
    if (this.sheets.isMock()) return;
    await this.run('cron');
  }

  async run(source = 'manual') {
    if (this.running) {
      return { ok: false, error: 'Sinkron sedang berjalan — coba lagi sebentar', rows: 0 };
    }
    this.running = true;
    const startedMs = Date.now();
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    await this.db.execute(`INSERT INTO sync_logs (id,started_at,status,source) VALUES ('${id}','${startedAt}','running','${source}')` as any);
    try {
      const { rows, tab, readRows, skippedRows } = await this.sheets.readDataTab();
      // Hash sync sebelumnya (app_config) — baris yang hash-nya sama dilewati (tidak di-upsert)
      let prevHashes: Record<string, string> = {};
      try {
        const hr: any = await this.db.execute(`SELECT value FROM app_config WHERE key='syncHashes'` as any);
        const raw = (hr.rows || hr)[0]?.value;
        if (raw) prevHashes = JSON.parse(raw).hashes || {};
      } catch {}
      let n = 0;
      let unchanged = 0;
      const nextHashes: Record<string, string> = {};
      const cols = ['client','pic_name','module','sub_module','location','issue','assign_to','status','support_category','billing_status','billing_category','ref_price_list','channel_ticket','support_type','charges','completion_notes','group_kpi','group_kpi_desc','month','weeknum'] as const;
      for (const r of rows) {
        const h = hashRow(r);
        nextHashes[r.recordUuid] = h;
        if (prevHashes[r.recordUuid] === h) {
          unchanged++;
          continue; // sama persis → lewati, hemat waktu
        }
        const sets = cols.map((k) => `${k}=EXCLUDED.${k}`).join(',');
        await this.db.execute(`INSERT INTO assistance_records (record_uuid,no,date_issue,start_date,finish_date,client,pic_name,module,sub_module,location,issue,assign_to,status,support_category,billing_status,billing_category,ref_price_list,channel_ticket,support_type,charges,completion_notes,group_kpi,group_kpi_desc,month,weeknum,updated_at) VALUES ('${r.recordUuid}','${r.no}','${r.dateIssue}','${r.startDate}','${r.finishDate}','${r.client.replace(/'/g,"''")}','${(r.picName||'').replace(/'/g,"''")}','${r.module}','${r.subModule}','${(r.location||'').replace(/'/g,"''")}','${(r.issue||'').replace(/'/g,"''")}','${r.assignTo}','${r.status}','${r.supportCategory}','${r.billingStatus}','${r.billingCategory}','${r.refPriceList}','${r.channelTicket}','${r.supportType}',${Number(r.charges)||0},'${(r.completionNotes||'').replace(/'/g,"''")}','${r.groupKpi}','${r.groupKpiDesc}','${r.month}','${r.weeknum}','${startedAt}') ON CONFLICT (record_uuid) DO UPDATE SET no=EXCLUDED.no,date_issue=EXCLUDED.date_issue,start_date=EXCLUDED.start_date,finish_date=EXCLUDED.finish_date,${sets},updated_at=EXCLUDED.updated_at` as any);
        n++;
      }
      try {
        const hv = JSON.stringify({ updatedAt: startedAt, hashes: nextHashes }).replace(/'/g, "''");
        await this.db.execute(`INSERT INTO app_config (key,value,updated_at) VALUES ('syncHashes','${hv}','${startedAt}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at` as any);
      } catch (e) {
        this.logger.warn('Simpan syncHashes gagal: ' + (e as any)?.message);
      }
      const finishedAt = new Date().toISOString();
      await this.db.execute(`UPDATE sync_logs SET finished_at='${finishedAt}', status='success', rows_processed=${n} WHERE id='${id}'` as any);
      await logActivity(this.db, { who: 'Sistem', action: 'sinkronisasi Google Sheets selesai', category: 'Sinkron', detail: `${n} baris baru/berubah, ${unchanged} sama (${readRows} dibaca, sumber: ${source}${tab ? `, tab ${tab}` : ''})` });
      return { ok: true, rows: n, readRows, skippedRows, unchanged, tab, startedAt, finishedAt, durationMs: Date.now() - startedMs };
    } catch (e: any) {
      await this.db.execute(`UPDATE sync_logs SET finished_at='${new Date().toISOString()}', status='failed', error_message='${String(e.message||e).replace(/'/g,"''")}' WHERE id='${id}'` as any);
      throw e;
    } finally {
      this.running = false;
    }
  }

  async logs() {
    const res: any = await this.db.execute(`SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 20` as any);
    return res.rows || res;
  }
}
