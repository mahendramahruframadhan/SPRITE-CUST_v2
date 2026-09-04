import { Injectable } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { SheetsService } from '../sheets/sheets.service';
import * as crypto from 'crypto';

@Injectable()
export class CasesService {
  private db: any = getDb();
  constructor(private sheets: SheetsService) {}

  async findAll(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Number(q.limit) || 50);
    const offset = (page - 1) * limit;
    const keyword = (q.q || q.keyword || '').trim();
    const module = q.module || '';
    const status = q.status || '';
    const billingStatus = q.billingStatus || '';
    const assignTo = q.assignTo || q.pic || '';
    const from = (q.from || q.dateFrom || '').replace(/-/g, '');
    const to = (q.to || q.dateTo || '').replace(/-/g, '');

    const esc = (v: string) => String(v).replace(/'/g, "''");
    const wheres: string[] = [];
    if (module) wheres.push(`module = '${esc(module)}'`);
    if (status) wheres.push(`status = '${esc(status)}'`);
    if (billingStatus) wheres.push(`billing_status = '${esc(billingStatus)}'`);
    if (assignTo) wheres.push(`assign_to = '${esc(assignTo)}'`);
    if (from) wheres.push(`date_issue >= '${esc(from)}'`);
    if (to) wheres.push(`date_issue <= '${esc(to)}'`);
    if (keyword) wheres.push(`(lower(client || ' ' || issue || ' ' || coalesce(pic_name,'')) LIKE '%${esc(keyword.toLowerCase())}%')`);
    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    // ponytail: raw SQL paginated — faster than ORM for 60k rows, no abstraction overhead
    const rowsRes: any = await this.db.execute(`SELECT * FROM assistance_records ${whereSql} ORDER BY date_issue DESC LIMIT ${limit} OFFSET ${offset}` as any);
    const rows = rowsRes.rows || rowsRes;
    const countRes: any = await this.db.execute(`SELECT COUNT(*) as c FROM assistance_records ${whereSql}` as any);
    const total = Number((countRes.rows || countRes)[0]?.c || 0);

    // map snake to camel for frontend compatibility (cases.js keys)
    const mapRow = (r: any) => ({
      no: r.no, dateIssue: r.date_issue, startDate: r.start_date, finishDate: r.finish_date,
      client: r.client, picName: r.pic_name, module: r.module, subModule: r.sub_module,
      location: r.location, issue: r.issue, assignTo: r.assign_to, status: r.status,
      supportCategory: r.support_category, billingStatus: r.billing_status, billingCategory: r.billing_category,
      refPriceList: r.ref_price_list, channelTicket: r.channel_ticket, supportType: r.support_type,
      charges: r.charges, completionNotes: r.completion_notes, groupKpi: r.group_kpi, groupKpiDesc: r.group_kpi_desc,
      month: r.month, weeknum: r.weeknum, recordUuid: r.record_uuid,
    });

    return { data: (rows as any[]).map(mapRow), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(recordUuid: string) {
    const res: any = await this.db.execute(`SELECT * FROM assistance_records WHERE record_uuid = '${recordUuid.replace(/'/g,"''")}'` as any);
    const row = (res.rows || res)[0];
    if (!row) return null;
    const auditRes: any = await this.db.execute(`SELECT action FROM audit_status WHERE record_uuid='${recordUuid.replace(/'/g,"''")}'` as any);
    const invRes: any = await this.db.execute(`SELECT status FROM invoice_status WHERE record_uuid='${recordUuid.replace(/'/g,"''")}'` as any);
    const m = (r:any)=>({
      no: r.no, dateIssue: r.date_issue, startDate: r.start_date, finishDate: r.finish_date,
      client: r.client, picName: r.pic_name, module: r.module, subModule: r.sub_module,
      location: r.location, issue: r.issue, assignTo: r.assign_to, status: r.status,
      supportCategory: r.support_category, billingStatus: r.billing_status, billingCategory: r.billing_category,
      refPriceList: r.ref_price_list, channelTicket: r.channel_ticket, supportType: r.support_type,
      charges: r.charges, completionNotes: r.completion_notes, groupKpi: r.group_kpi, groupKpiDesc: r.group_kpi_desc,
      month: r.month, weeknum: r.weeknum, recordUuid: r.record_uuid,
    });
    return { ...m(row), auditStatus: (auditRes.rows||auditRes)[0]?.action || 'BELUM DIVALIDASI', invoiceStatus: (invRes.rows||invRes)[0]?.status || 'MENUNGGU INVOICE' };
  }

  async create(body: any) {
    const recordUuid = body.recordUuid || crypto.randomUUID();
    const row = {
      recordUuid, no: body.no || 'AUTO',
      dateIssue: String(body.dateIssue || '').replace(/-/g, ''),
      startDate: String(body.startDate || '').replace(/-/g, ''),
      finishDate: String(body.finishDate || '').replace(/-/g, ''),
      client: body.client, picName: body.picName || '', module: body.module || '', subModule: body.subModule || '',
      location: body.location || '', issue: body.issue, assignTo: body.assignTo || '', status: body.status || 'OPEN',
      supportCategory: body.supportCategory || '', billingStatus: body.billingStatus || '', billingCategory: body.billingCategory || '',
      refPriceList: body.refPriceList || '', channelTicket: body.channelTicket || '', supportType: body.supportType || '',
      charges: Number(body.charges)||0, completionNotes: body.completionNotes || '', groupKpi: body.groupKpi || '', groupKpiDesc: body.groupKpiDesc || '', month: body.month || '', weeknum: body.weeknum || '',
    };
    if (!row.client || !row.issue || !row.dateIssue) throw new Error('client, issue, dateIssue required');
    await this.sheets.appendCase(row);
    await this.db.execute(`INSERT INTO assistance_records (record_uuid,no,date_issue,start_date,finish_date,client,pic_name,module,sub_module,location,issue,assign_to,status,support_category,billing_status,billing_category,ref_price_list,channel_ticket,support_type,charges,completion_notes,group_kpi,group_kpi_desc,month,weeknum,updated_at) VALUES ('${row.recordUuid}','${row.no}','${row.dateIssue}','${row.startDate}','${row.finishDate}','${row.client.replace(/'/g,"''")}','${row.picName.replace(/'/g,"''")}','${row.module}','${row.subModule}','${row.location.replace(/'/g,"''")}','${row.issue.replace(/'/g,"''")}','${row.assignTo}','${row.status}','${row.supportCategory}','${row.billingStatus}','${row.billingCategory}','${row.refPriceList}','${row.channelTicket}','${row.supportType}',${row.charges},'${row.completionNotes.replace(/'/g,"''")}','${row.groupKpi}','${row.groupKpiDesc}','${row.month}','${row.weeknum}','${new Date().toISOString()}') ON CONFLICT (record_uuid) DO UPDATE SET client=EXCLUDED.client, issue=EXCLUDED.issue, updated_at=EXCLUDED.updated_at` as any);
    return row;
  }

  async stats() {
    const totalRes: any = await this.db.execute(`SELECT COUNT(*) as c FROM assistance_records` as any);
    const byStatusRes: any = await this.db.execute(`SELECT billing_status as bs, COUNT(*) as c FROM assistance_records GROUP BY billing_status` as any);
    const byModuleRes: any = await this.db.execute(`SELECT module as m, COUNT(*) as c FROM assistance_records GROUP BY module ORDER BY c DESC LIMIT 6` as any);
    const norm = (r:any)=> r.rows||r;
    return { total: Number(norm(totalRes)[0]?.c||0), byStatus: norm(byStatusRes), byModule: norm(byModuleRes) };
  }
}
