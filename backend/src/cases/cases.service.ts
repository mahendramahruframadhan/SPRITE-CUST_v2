import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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

    // Imp#1: setiap nilai filter + pagination dikirim sebagai parameter ($n).
    const wheres: string[] = [];
    const params: any[] = [];
    const ph = () => `$${params.length}`;
    if (module) { params.push(module); wheres.push(`module = ${ph()}`); }
    if (status) { params.push(status); wheres.push(`status = ${ph()}`); }
    if (billingStatus) { params.push(billingStatus); wheres.push(`billing_status = ${ph()}`); }
    if (assignTo) { params.push(assignTo); wheres.push(`assign_to = ${ph()}`); }
    if (from) { params.push(from); wheres.push(`date_issue >= ${ph()}`); }
    if (to) { params.push(to); wheres.push(`date_issue <= ${ph()}`); }
    if (keyword) {
      params.push(`%${keyword.toLowerCase()}%`);
      wheres.push(`(lower(client || ' ' || issue || ' ' || coalesce(pic_name,'')) LIKE ${ph()})`);
    }
    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    // ponytail: raw SQL paginated — faster than ORM for 60k rows, no abstraction overhead
    params.push(limit, offset);
    const rowsRes: any = await this.db.pq(`SELECT * FROM assistance_records ${whereSql} ORDER BY date_issue DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const rows = rowsRes.rows || rowsRes;
    const countRes: any = await this.db.pq(`SELECT COUNT(*) as c FROM assistance_records ${whereSql}`, params.slice(0, -2));
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
    const res: any = await this.db.pq(`SELECT * FROM assistance_records WHERE record_uuid = $1`, [recordUuid]);
    const row = (res.rows || res)[0];
    if (!row) return null;
    const auditRes: any = await this.db.pq(`SELECT action FROM audit_status WHERE record_uuid=$1`, [recordUuid]);
    const invRes: any = await this.db.pq(`SELECT status FROM invoice_status WHERE record_uuid=$1`, [recordUuid]);
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
    const appended = await this.sheets.appendCase(row);
    if (!appended) {
      throw new HttpException({ code: 'SHEETS_WRITE_FAILED', message: 'Kasus gagal disimpan ke Google Sheets.' }, HttpStatus.BAD_GATEWAY);
    }
    await this.db.pq(
      `INSERT INTO assistance_records (record_uuid,no,date_issue,start_date,finish_date,client,pic_name,module,sub_module,location,issue,assign_to,status,support_category,billing_status,billing_category,ref_price_list,channel_ticket,support_type,charges,completion_notes,group_kpi,group_kpi_desc,month,weeknum,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) ON CONFLICT (record_uuid) DO UPDATE SET client=EXCLUDED.client, issue=EXCLUDED.issue, updated_at=EXCLUDED.updated_at`,
      [
        row.recordUuid, row.no, row.dateIssue, row.startDate, row.finishDate, row.client, row.picName,
        row.module, row.subModule, row.location, row.issue, row.assignTo, row.status, row.supportCategory,
        row.billingStatus, row.billingCategory, row.refPriceList, row.channelTicket, row.supportType,
        Number(row.charges) || 0, row.completionNotes, row.groupKpi, row.groupKpiDesc, row.month, row.weeknum,
        new Date().toISOString(),
      ],
    );
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
