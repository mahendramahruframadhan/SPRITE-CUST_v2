import { Injectable } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';

const VALID_TAG = 'VALID - SIAP INVOICE';
const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const norm = (s: any) => String(s || '').replace(/[\s-]/g, '').toUpperCase();
const isOnCall = (s: any) => norm(s) === 'ONCALL';
const isMonthly = (s: any) => norm(s) === 'MONTHLY';
const inPool = (r: any) => (isOnCall(r.billing_status) || isMonthly(r.billing_status)) && r.audit_action === VALID_TAG;

function ppnOf(r: any): number {
  if (!isOnCall(r.billing_status)) return 0;
  const charges = Number(r.charges) || 0;
  if (r.ppn_mode === 'percent') {
    const p = Number(r.ppn_percent) || 0;
    if (charges <= 0 || p <= 0) return 0;
    return Math.round((charges * p) / 100);
  }
  if (r.ppn_mode === 'rupiah') return Math.max(0, Number(r.ppn_amount) || 0);
  return 0;
}

function monthKeyOf(dateIssue: any): string | null {
  const m = String(dateIssue || '').match(/^(\d{4})(\d{2})\d{2}$/);
  if (!m || m[2] < '01' || m[2] > '12') return null;
  return `${m[1]}-${m[2]}`;
}

function monthLabel(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  return `${ID_MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// Tanggal WIB hari ini 'YYYY-MM-DD' (offset +7, tanpa DST).
function todayWIB(now = Date.now()): string {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// 'YYYYMMDD' -> umur hari kalender thd today 'YYYY-MM-DD', null bila tak valid.
function ageDaysOf(dateIssue: any, today: string): number | null {
  const m = String(dateIssue || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  const t = new Date(`${today}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const tLocal = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((tLocal.getTime() - local.getTime()) / 86400000);
}

const AGING_BUCKETS = [
  { key: '0-30', label: '0–30 hari', min: 0, max: 30, status: 'Baik' },
  { key: '31-60', label: '31–60 hari', min: 31, max: 60, status: 'Normal' },
  { key: '61-90', label: '61–90 hari', min: 61, max: 90, status: 'Perhatian' },
  { key: '91-180', label: '91–180 hari', min: 91, max: 180, status: 'Risiko' },
  { key: '>180', label: '>180 hari', min: 181, max: Infinity, status: 'Risiko' },
];

const mapRow = (r: any) => ({
  no: r.no,
  dateIssue: r.date_issue,
  startDate: r.start_date,
  finishDate: r.finish_date,
  client: r.client,
  picName: r.pic_name,
  module: r.module,
  subModule: r.sub_module,
  location: r.location,
  issue: r.issue,
  assignTo: r.assign_to,
  status: r.status,
  supportCategory: r.support_category,
  billingStatus: r.billing_status,
  billingCategory: r.billing_category,
  refPriceList: r.ref_price_list,
  channelTicket: r.channel_ticket,
  supportType: r.support_type,
  charges: Number(r.charges) || 0,
  completionNotes: r.completion_notes,
  groupKpi: r.group_kpi,
  groupKpiDesc: r.group_kpi_desc,
  month: r.month,
  weeknum: r.weeknum,
  recordUuid: r.record_uuid,
  auditStatus: r.audit_action || 'BELUM DIVALIDASI',
  invoiceStatus: r.invoice_status || 'MENUNGGU INVOICE',
});

@Injectable()
export class AnalyticsService {
  private db: any = getDb();

  private async poolRows(from: string, to: string, opts: { brand?: string; module?: string } = {}) {
    const f = String(from || '').replace(/-/g, '');
    const t = String(to || '').replace(/-/g, '');
    const res: any = await this.db.pq(
      `SELECT r.*, COALESCE(a.action,'') AS audit_action, COALESCE(i.status,'MENUNGGU INVOICE') AS invoice_status, t.ppn_mode, t.ppn_percent, t.ppn_amount, t.pph FROM assistance_records r LEFT JOIN audit_status a ON a.record_uuid = r.record_uuid LEFT JOIN invoice_status i ON i.record_uuid = r.record_uuid LEFT JOIN case_tax t ON t.record_uuid = r.record_uuid WHERE r.date_issue >= $1 AND r.date_issue <= $2`,
      [f, t],
    );
    const rows = (res.rows || res || []) as any[];
    const brand = String(opts.brand || '');
    const module = String(opts.module || '');
    return rows
      .filter(inPool)
      .filter((r) => (!brand || r.client === brand) && (!module || r.module === module))
      .map((r) => {
        const charges = Number(r.charges) || 0;
        const ppn = ppnOf(r);
        return { ...r, charges, ppn, subtotal: charges + ppn, pph: Number(r.pph ?? 0) === 1 };
      });
  }

  async getOverview(from: string, to: string, opts: { brand?: string; module?: string; today?: string } = {}) {
    const pool = await this.poolRows(from, to, opts);
    const charges = pool.reduce((a, r) => a + r.charges, 0);
    const ppn = pool.reduce((a, r) => a + r.ppn, 0);
    const subtotal = charges + ppn;
    const invOf = (r: any) => r.invoice_status || 'MENUNGGU INVOICE';

    const summarize = (rows: any[]) => ({
      count: rows.length,
      charges: rows.reduce((a, r) => a + r.charges, 0),
      ppn: rows.reduce((a, r) => a + r.ppn, 0),
      subtotal: rows.reduce((a, r) => a + r.subtotal, 0),
    });

    const byInvoice: Record<string, any> = {};
    for (const r of pool) {
      const k = invOf(r);
      (byInvoice[k] = byInvoice[k] || []).push(r);
    }
    const byInvoiceSum: Record<string, any> = {};
    for (const k of Object.keys(byInvoice)) byInvoiceSum[k] = summarize(byInvoice[k]);

    const byBrand = (() => {
      const m = new Map<string, any[]>();
      for (const r of pool) {
        const k = r.client || '-';
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
      }
      return [...m.entries()]
        .map(([brand, rows]) => ({ brand, ...summarize(rows) }))
        .sort((a, b) => b.subtotal - a.subtotal);
    })();
    const byModule = (() => {
      const m = new Map<string, any[]>();
      for (const r of pool) {
        const k = r.module || '-';
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
      }
      return [...m.entries()]
        .map(([module, rows]) => ({ module, ...summarize(rows) }))
        .sort((a, b) => b.subtotal - a.subtotal);
    })();
    const trendMap = new Map<string, any[]>();
    for (const r of pool) {
      const k = monthKeyOf(r.date_issue);
      if (!k) continue;
      if (!trendMap.has(k)) trendMap.set(k, []);
      trendMap.get(k)!.push(r);
    }
    const trend = [...trendMap.keys()]
      .sort()
      .map((key) => ({ key, label: monthLabel(key), ...summarize(trendMap.get(key)!) }));

    const paid = summarize(pool.filter((r) => invOf(r) === 'PAID'));
    const outstanding = summarize(pool.filter((r) => invOf(r) !== 'PAID'));
    const byBilling = {
      'ON-CALL': summarize(pool.filter((r) => isOnCall(r.billing_status))),
      MONTHLY: summarize(pool.filter((r) => isMonthly(r.billing_status))),
    };

    const today = String(opts.today || todayWIB());
    const outstandingRows = pool.filter((r) => invOf(r) !== 'PAID');
    const buckets = AGING_BUCKETS.map((b) => ({ ...b, count: 0, subtotal: 0, percentage: 0 }));
    let invalid = 0;
    for (const r of outstandingRows) {
      const age = ageDaysOf(r.date_issue, today);
      if (age === null) {
        invalid += 1;
        continue;
      }
      const b = buckets.find((x) => Math.max(0, age) >= x.min && Math.max(0, age) <= x.max);
      if (!b) {
        invalid += 1;
        continue;
      }
      b.count += 1;
      b.subtotal += r.subtotal;
    }
    const agingTotal = { count: buckets.reduce((a, b) => a + b.count, 0), subtotal: buckets.reduce((a, b) => a + b.subtotal, 0) };
    for (const b of buckets) b.percentage = agingTotal.subtotal > 0 ? Math.round((b.subtotal / agingTotal.subtotal) * 100) : 0;
    const aging = { buckets, total: agingTotal, invalid };

    const top = [...outstandingRows]
      .sort((a, b) => b.subtotal - a.subtotal)
      .slice(0, 10)
      .map((r) => ({ ...mapRow(r), ppn: r.ppn, subtotal: r.subtotal, pph: r.pph, ageDays: ageDaysOf(r.date_issue, today) }));

    return {
      kpis: { count: pool.length, charges, ppn, subtotal, pphCount: pool.filter((r) => r.pph).length, paid, outstanding },
      trend,
      byInvoice: byInvoiceSum,
      byBrand,
      byModule,
      byBilling,
      aging,
      top,
    };
  }

  async getDrilldown(opts: { dim: string; key: string; from: string; to: string; q?: string; page?: number; limit?: number; brand?: string; module?: string }) {
    const { dim, key } = opts;
    const pool = await this.poolRows(opts.from, opts.to, { brand: opts.brand, module: opts.module });
    const scoped = dim ? pool.filter((r) => (dim === 'brand' ? r.client || '-' : r.module || '-') === key) : pool;
    const needle = String(opts.q || '').trim().toLowerCase();
    const searched = needle
      ? scoped.filter((r) => `${r.no || ''} ${r.client || ''} ${r.issue || ''} ${r.pic_name || ''} ${r.module || ''}`.toLowerCase().includes(needle))
      : scoped;
    searched.sort((a, b) => String(b.date_issue || '').localeCompare(String(a.date_issue || '')));
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));
    const page = Math.max(1, Number(opts.page) || 1);
    const total = searched.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const data = searched.slice((safePage - 1) * limit, safePage * limit).map((r) => ({ ...mapRow(r), ppn: r.ppn, subtotal: r.subtotal, pph: r.pph }));
    return { data, total, page: safePage, limit, totalPages, subtotal: searched.reduce((a, r) => a + r.subtotal, 0) };
  }
}
