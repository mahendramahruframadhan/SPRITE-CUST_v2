import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getDb } from '../db/drizzle.service';
import { SheetsService } from '../sheets/sheets.service';
import * as crypto from 'crypto';

@Injectable()
export class SyncService {
  private logger = new Logger(SyncService.name);
  private db: any = getDb();
  constructor(private sheets: SheetsService) {}

  @Cron('*/5 * * * *')
  async cronSync() {
    if (this.sheets.isMock()) return;
    await this.run('cron');
  }

  async run(source = 'manual') {
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    await this.db.execute(`INSERT INTO sync_logs (id,started_at,status,source) VALUES ('${id}','${startedAt}','running','${source}')` as any);
    try {
      const rows = await this.sheets.readDataTab();
      let n = 0;
      for (const r of rows) {
        await this.db.execute(`INSERT INTO assistance_records (record_uuid,no,date_issue,start_date,finish_date,client,pic_name,module,sub_module,location,issue,assign_to,status,support_category,billing_status,billing_category,ref_price_list,channel_ticket,support_type,charges,completion_notes,group_kpi,group_kpi_desc,month,weeknum,updated_at) VALUES ('${r.recordUuid}','${r.no}','${r.dateIssue}','${r.startDate}','${r.finishDate}','${r.client.replace(/'/g,"''")}','${(r.picName||'').replace(/'/g,"''")}','${r.module}','${r.subModule}','${(r.location||'').replace(/'/g,"''")}','${(r.issue||'').replace(/'/g,"''")}','${r.assignTo}','${r.status}','${r.supportCategory}','${r.billingStatus}','${r.billingCategory}','${r.refPriceList}','${r.channelTicket}','${r.supportType}',${Number(r.charges)||0},'${(r.completionNotes||'').replace(/'/g,"''")}','${r.groupKpi}','${r.groupKpiDesc}','${r.month}','${r.weeknum}','${startedAt}') ON CONFLICT (record_uuid) DO UPDATE SET client=EXCLUDED.client, issue=EXCLUDED.issue, updated_at=EXCLUDED.updated_at` as any);
        n++;
      }
      await this.db.execute(`UPDATE sync_logs SET finished_at='${new Date().toISOString()}', status='success', rows_processed=${n} WHERE id='${id}'` as any);
      return { ok: true, rows: n };
    } catch (e: any) {
      await this.db.execute(`UPDATE sync_logs SET finished_at='${new Date().toISOString()}', status='failed', error_message='${String(e.message||e).replace(/'/g,"''")}' WHERE id='${id}'` as any);
      throw e;
    }
  }

  async logs() {
    const res: any = await this.db.execute(`SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 20` as any);
    return res.rows || res;
  }
}
