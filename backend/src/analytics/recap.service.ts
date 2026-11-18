import { Injectable } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import {
  AnalyticsService,
  VALID_TAG,
  billingOf,
  isDone,
  isOnCall,
  ppnOf,
  userOf,
} from './analytics.service';

// Rekap ringkas 11 tab /report. Read-only: satu query rentang kasus + query
// tabel pendukung, lalu agregasi di memori. Tidak menulis apa pun.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const num = (v: any) => Number(v) || 0;
const str = (v: any) => String(v ?? '').trim();
const upper = (v: any) => str(v).toUpperCase();
const money = (v: any) => Math.round(num(v));

function rowsOf(res: any): any[] {
  return res?.rows ?? (Array.isArray(res) ? res : []);
}

function todayWIB(now = Date.now()): string {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function monthKeyOf(from: string, to: string): string {
  const valid = /^(\d{4})-(\d{2})/.exec(String(to || ''));
  if (valid && valid[1] !== '2999') return `${valid[1]}-${valid[2]}`;
  return todayWIB().slice(0, 7);
}

function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

function parseDate(v: any): { y: number; m: number; d: number } | null {
  const s = String(v || '');
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

function dayDiff(fromDate: any, toDate: any): number | null {
  const a = parseDate(fromDate);
  const b = parseDate(toDate);
  if (!a || !b) return null;
  const t1 = Date.UTC(a.y, a.m - 1, a.d);
  const t2 = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((t2 - t1) / 86400000);
}

function topKey(map: Map<string, number>): string {
  let best = '-';
  let bestN = -1;
  for (const [key, n] of map) {
    if (!key || key === '-') continue;
    if (n > bestN) {
      best = key;
      bestN = n;
    }
  }
  return best;
}

function contractStatus(daysLeft: number | null): string {
  if (daysLeft === null) return 'Tanpa tanggal';
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= 30) return 'Segera habis';
  return 'Aktif';
}

function normalizeWeeks(raw: any): Record<string, any[]> {
  const out: Record<string, any[]> = { W1: [], W2: [], W3: [], W4: [], W5: [] };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(out)) {
    if (Array.isArray(raw[key])) out[key] = raw[key];
  }
  return out;
}

@Injectable()
export class RecapService {
  private db: any = getDb();

  constructor(private analytics: AnalyticsService) {}

  async getRecap(from: string, to: string, opts: { brand?: string; module?: string } = {}) {
    const rows = await this.analytics.getRangeRows(from, to);
    const brand = String(opts.brand || '');
    const module = String(opts.module || '');
    const caseRows = rows
      .filter((r) => (!brand || r.client === brand) && (!module || r.module === module))
      .map((r) => this.enrich(r));

    const today = todayWIB();
    const popMonth = monthKeyOf(from, to);
    const [brands, billing, audit, modules] = [
      await this.brandsTab(caseRows, today),
      this.billingTab(caseRows),
      this.auditTab(caseRows),
      this.modulesTab(caseRows),
    ];
    const [popinava, contracts, activity, sla, quality] = await Promise.all([
      this.popinavaTab(popMonth),
      this.contractsTab(caseRows, today),
      this.activityTab(from, to),
      this.slaTab(caseRows, today),
      this.qualityTab(caseRows),
    ]);

    return {
      period: { from, to, label: from || to ? `${from || 'Awal'} s.d. ${to || 'Akhir'}` : 'Semua tanggal' },
      generatedAt: new Date().toISOString(),
      basis: {
        cases: 'date_issue',
        popinava: popMonth,
        contracts: 'today',
        activity: 'created_at',
        quality: 'period+snapshot',
      },
      tabs: {
        workload: this.workloadTab(caseRows),
        brands,
        billing,
        finance: this.financeTab(caseRows),
        audit,
        popinava,
        modules,
        sla,
        contracts,
        activity,
        quality,
      },
    };
  }

  private enrich(r: any) {
    const billing = billingOf(r.billing_status);
    const charges = num(r.charges);
    const ppn = isOnCall(r.billing_status) ? ppnOf(r) : 0;
    return {
      raw: r,
      billing,
      done: isDone(r.status),
      validated: r.audit_action === VALID_TAG,
      charges,
      ppn,
      subtotal: billing === 'ON-CALL' ? charges + ppn : 0,
      user: userOf(r.assign_to),
      brand: str(r.client) || '-',
      module: str(r.module) || '-',
      invoice: str(r.invoice_status) || 'MENUNGGU INVOICE',
    };
  }

  private workloadTab(rows: any[]) {
    const users = new Map<string, any>();
    let onCall = 0;
    let open = 0;
    let validated = 0;
    for (const r of rows) {
      if (r.billing === 'ON-CALL') onCall += 1;
      if (!r.done) open += 1;
      if (r.validated) validated += 1;
      let u = users.get(r.user);
      if (!u) {
        u = {
          user: r.user,
          count: 0,
          onCall: 0,
          monthly: 0,
          free: 0,
          lainnya: 0,
          done: 0,
          open: 0,
          validated: 0,
          onCallSubtotal: 0,
          brands: new Set<string>(),
          modules: new Set<string>(),
        };
        users.set(r.user, u);
      }
      u.count += 1;
      if (r.billing === 'ON-CALL') u.onCall += 1;
      if (r.billing === 'MONTHLY') u.monthly += 1;
      if (r.billing === 'FREE') u.free += 1;
      if (r.billing === 'LAINNYA') u.lainnya += 1;
      if (r.done) u.done += 1;
      if (r.validated) u.validated += 1;
      if (r.billing === 'ON-CALL') u.onCallSubtotal += r.subtotal;
      u.brands.add(r.brand);
      u.modules.add(r.module);
    }
    const list = [...users.values()]
      .map((u) => ({
        user: u.user,
        count: u.count,
        onCall: u.onCall,
        monthly: u.monthly,
        free: u.free,
        lainnya: u.lainnya,
        done: u.done,
        open: u.count - u.done,
        validated: u.validated,
        onCallSubtotal: money(u.onCallSubtotal),
        brandCount: u.brands.size,
        moduleCount: u.modules.size,
      }))
      .sort((a, b) => b.count - a.count || a.user.localeCompare(b.user));
    return {
      kpis: {
        total: rows.length,
        activeUsers: list.filter((u) => u.user !== 'TANPA USER').length,
        onCall,
        open,
        validated,
      },
      rows: list.slice(0, 8),
    };
  }

  private async contractRows() {
    const res = await this.db.pq(
      `SELECT brand,type,start_at,expired_at,monthly_fee,pic,updated_at FROM brand_statuses ORDER BY COALESCE(updated_at,'') ASC`,
    );
    const map = new Map<string, any>();
    for (const row of rowsOf(res)) {
      const key = upper(row.brand);
      if (!key) continue;
      map.set(key, row); // urut lama → baru, baris terbaru menang
    }
    return map;
  }

  private async brandsTab(rows: any[], today: string) {
    const contracts = await this.contractRows();
    const map = new Map<string, any>();
    for (const r of rows) {
      let b = map.get(upper(r.brand));
      if (!b) {
        b = { brand: r.brand, count: 0, onCall: 0, validated: 0, onCallSubtotal: 0 };
        map.set(upper(r.brand), b);
      }
      b.count += 1;
      if (r.billing === 'ON-CALL') b.onCall += 1;
      if (r.validated) b.validated += 1;
      if (r.billing === 'ON-CALL' && r.validated) b.onCallSubtotal += r.subtotal;
    }

    let withContract = 0;
    let noContract = 0;
    let monthly = 0;
    let free = 0;
    let expiring30 = 0;
    for (const c of contracts.values()) {
      const type = upper(c.type);
      if (type === 'MONTHLY') monthly += 1;
      if (type === 'GRATIS') free += 1;
      const days = dayDiff(today, c.expired_at);
      if (days !== null && days >= 0 && days <= 30) expiring30 += 1;
    }
    for (const key of map.keys()) {
      if (contracts.has(key)) withContract += 1;
      else noContract += 1;
    }

    const list = [...map.values()]
      .map((b) => {
        const c = contracts.get(upper(b.brand));
        const daysLeft = c ? dayDiff(today, c.expired_at) : null;
        return {
          brand: b.brand,
          count: b.count,
          onCall: b.onCall,
          validated: b.validated,
          onCallSubtotal: money(b.onCallSubtotal),
          contractType: c ? upper(c.type) : '-',
          expiredAt: c?.expired_at || '',
          daysLeft,
          contractStatus: c ? contractStatus(daysLeft) : 'Tanpa kontrak',
        };
      })
      .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));

    return {
      kpis: {
        brands: map.size,
        withContract,
        noContract,
        monthly,
        free,
        expiring30,
      },
      rows: list.slice(0, 8),
    };
  }

  private billingTab(rows: any[]) {
    const pool = rows.filter((r) => r.billing === 'ON-CALL' && r.validated);
    const charges = pool.reduce((a, r) => a + r.charges, 0);
    const ppn = pool.reduce((a, r) => a + r.ppn, 0);
    const subtotal = charges + ppn;
    const paid = pool.filter((r) => r.invoice === 'PAID').reduce((a, r) => a + r.subtotal, 0);

    const map = new Map<string, any>();
    for (const r of pool) {
      let b = map.get(upper(r.brand));
      if (!b) {
        b = { brand: r.brand, count: 0, charges: 0, ppn: 0, subtotal: 0, paid: 0 };
        map.set(upper(r.brand), b);
      }
      b.count += 1;
      b.charges += r.charges;
      b.ppn += r.ppn;
      b.subtotal += r.subtotal;
      if (r.invoice === 'PAID') b.paid += r.subtotal;
    }
    const list = [...map.values()]
      .map((b) => ({
        brand: b.brand,
        count: b.count,
        charges: money(b.charges),
        ppn: money(b.ppn),
        subtotal: money(b.subtotal),
        paid: money(b.paid),
        outstanding: money(b.subtotal - b.paid),
      }))
      .sort((a, b) => b.subtotal - a.subtotal || a.brand.localeCompare(b.brand));

    return {
      kpis: {
        count: pool.length,
        charges: money(charges),
        ppn: money(ppn),
        subtotal: money(subtotal),
        paid: money(paid),
        outstanding: money(subtotal - paid),
        avgPerCase: pool.length > 0 ? money(subtotal / pool.length) : 0,
      },
      rows: list.slice(0, 8),
    };
  }

  private financeTab(rows: any[]) {
    const pool = rows.filter((r) => r.billing === 'ON-CALL');
    const map = new Map<string, any>();
    const totals = {
      brand: 'Total',
      count: 0,
      validated: 0,
      unvalidated: 0,
      charges: 0,
      ppn: 0,
      subtotal: 0,
      paid: 0,
      outstanding: 0,
    };

    for (const r of pool) {
      const key = upper(r.brand);
      let b = map.get(key);
      if (!b) {
        b = { brand: r.brand, count: 0, validated: 0, unvalidated: 0, charges: 0, ppn: 0, subtotal: 0, paid: 0, outstanding: 0 };
        map.set(key, b);
      }
      b.count += 1;
      totals.count += 1;
      if (r.validated) {
        b.validated += 1;
        totals.validated += 1;
      } else {
        b.unvalidated += 1;
        totals.unvalidated += 1;
      }
      b.charges += r.charges;
      b.ppn += r.ppn;
      b.subtotal += r.subtotal;
      if (r.invoice === 'PAID') b.paid += r.subtotal;

      totals.charges += r.charges;
      totals.ppn += r.ppn;
      totals.subtotal += r.subtotal;
      if (r.invoice === 'PAID') totals.paid += r.subtotal;
    }

    totals.outstanding = totals.subtotal - totals.paid;
    const list = [...map.values()]
      .map((b) => ({
        brand: b.brand,
        count: b.count,
        validated: b.validated,
        unvalidated: b.unvalidated,
        charges: money(b.charges),
        ppn: money(b.ppn),
        subtotal: money(b.subtotal),
        paid: money(b.paid),
        outstanding: money(b.subtotal - b.paid),
      }))
      .sort((a, b) => b.outstanding - a.outstanding || b.subtotal - a.subtotal || a.brand.localeCompare(b.brand));

    return {
      kpis: {
        count: totals.count,
        validated: totals.validated,
        unvalidated: totals.unvalidated,
        charges: money(totals.charges),
        ppn: money(totals.ppn),
        subtotal: money(totals.subtotal),
        paid: money(totals.paid),
        outstanding: money(totals.outstanding),
      },
      rows: list,
      totals: {
        count: totals.count,
        validated: totals.validated,
        unvalidated: totals.unvalidated,
        charges: money(totals.charges),
        ppn: money(totals.ppn),
        subtotal: money(totals.subtotal),
        paid: money(totals.paid),
        outstanding: money(totals.outstanding),
      },
    };
  }

  private auditTab(rows: any[]) {
    const count = (pred: (r: any) => boolean) => rows.filter(pred).length;
    const map = new Map<string, any>();
    for (const r of rows) {
      let b = map.get(upper(r.brand));
      if (!b) {
        b = { brand: r.brand, total: 0, validated: 0, invoiceIssued: 0, invoiceSent: 0, paid: 0, needCheck: 0 };
        map.set(upper(r.brand), b);
      }
      b.total += 1;
      if (r.validated) b.validated += 1;
      if (r.invoice === 'INVOICE TERBIT') b.invoiceIssued += 1;
      if (r.invoice === 'DIKIRIM') b.invoiceSent += 1;
      if (r.invoice === 'PAID') b.paid += 1;
      if (!r.validated && r.invoice !== 'MENUNGGU INVOICE') b.needCheck += 1;
    }
    return {
      kpis: {
        total: rows.length,
        onCall: count((r) => r.billing === 'ON-CALL'),
        validated: count((r) => r.validated),
        invoiceIssued: count((r) => r.invoice === 'INVOICE TERBIT'),
        invoiceSent: count((r) => r.invoice === 'DIKIRIM'),
        paid: count((r) => r.invoice === 'PAID'),
        needCheck: count((r) => !r.validated && r.invoice !== 'MENUNGGU INVOICE'),
      },
      rows: [...map.values()].sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand)).slice(0, 8),
    };
  }

  private modulesTab(rows: any[]) {
    const map = new Map<string, any>();
    const subSet = new Set<string>();
    const catSet = new Set<string>();
    const channelSet = new Set<string>();
    const channelCount = new Map<string, number>();

    for (const r of rows) {
      const raw = r.raw;
      const sub = str(raw.sub_module) || '-';
      const cat = str(raw.support_category) || '-';
      const channel = str(raw.channel_ticket) || '-';
      if (sub !== '-') subSet.add(sub);
      if (cat !== '-') catSet.add(cat);
      if (channel !== '-') channelSet.add(channel);
      channelCount.set(channel, (channelCount.get(channel) || 0) + 1);

      let m = map.get(r.module);
      if (!m) {
        m = {
          module: r.module,
          count: 0,
          onCall: 0,
          done: 0,
          open: 0,
          subs: new Map<string, number>(),
          cats: new Map<string, number>(),
          channels: new Map<string, number>(),
        };
        map.set(r.module, m);
      }
      m.count += 1;
      if (r.billing === 'ON-CALL') m.onCall += 1;
      if (r.done) m.done += 1;
      else m.open += 1;
      m.subs.set(sub, (m.subs.get(sub) || 0) + 1);
      m.cats.set(cat, (m.cats.get(cat) || 0) + 1);
      m.channels.set(channel, (m.channels.get(channel) || 0) + 1);
    }

    const list = [...map.values()]
      .map((m) => ({
        module: m.module,
        count: m.count,
        onCall: m.onCall,
        done: m.done,
        open: m.open,
        topSubModule: topKey(m.subs),
        topCategory: topKey(m.cats),
        topChannel: topKey(m.channels),
      }))
      .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module));

    return {
      kpis: {
        modules: map.size,
        subModules: subSet.size,
        categories: catSet.size,
        channels: channelSet.size,
        topModule: list[0]?.module || '-',
        topChannel: topKey(channelCount),
      },
      rows: list.slice(0, 8),
    };
  }

  private async popinavaTab(month: string) {
    const [outletsRes, scheduleRes, historyRes, shotsRes] = await Promise.all([
      this.db.pq(`SELECT uuid,brand_name,status FROM popinava_outlets`),
      this.db.pq(`SELECT weeks FROM audit_schedule WHERE month=$1`, [month]),
      this.db.pq(`SELECT item_id FROM audit_history WHERE month=$1 AND action='mark'`, [month]),
      this.db.pq(`SELECT dept_uuid,created_at FROM audit_shots`),
    ]);
    const outlets = rowsOf(outletsRes);
    const outletBrand = new Map<string, string>();
    const byBrand = new Map<string, any>();
    for (const o of outlets) {
      const b = str(o.brand_name) || '-';
      outletBrand.set(String(o.uuid), b);
      let g = byBrand.get(b);
      if (!g) {
        g = { brand: b, outlets: 0, active: 0, scheduled: 0, audited: 0, pending: 0, shots: 0 };
        byBrand.set(b, g);
      }
      g.outlets += 1;
      if (upper(o.status) === 'ACTIVE') g.active += 1;
    }

    const scheduleRow = rowsOf(scheduleRes)[0];
    let weeks: Record<string, any[]> = normalizeWeeks({});
    if (scheduleRow?.weeks) {
      try {
        weeks = normalizeWeeks(JSON.parse(scheduleRow.weeks));
      } catch {
        weeks = normalizeWeeks({});
      }
    }
    const marked = new Set(rowsOf(historyRes).map((h) => String(h.item_id)));
    let scheduled = 0;
    let audited = 0;
    for (const key of Object.keys(weeks)) {
      for (const item of weeks[key]) {
        scheduled += 1;
        const b = item?.type === 'brand' ? str(item.brand) || '-' : outletBrand.get(String(item?.uuid)) || str(item?.brand) || '-';
        let g = byBrand.get(b);
        if (!g) {
          g = { brand: b, outlets: 0, active: 0, scheduled: 0, audited: 0, pending: 0, shots: 0 };
          byBrand.set(b, g);
        }
        g.scheduled += 1;
        if (item?.audited || marked.has(String(item?.id))) {
          audited += 1;
          g.audited += 1;
        }
      }
    }
    for (const s of rowsOf(shotsRes)) {
      if (!String(s.created_at || '').startsWith(month)) continue;
      const b = outletBrand.get(String(s.dept_uuid)) || '-';
      let g = byBrand.get(b);
      if (!g) {
        g = { brand: b, outlets: 0, active: 0, scheduled: 0, audited: 0, pending: 0, shots: 0 };
        byBrand.set(b, g);
      }
      g.shots += 1;
    }

    const list = [...byBrand.values()]
      .map((g) => ({ ...g, pending: Math.max(0, g.scheduled - g.audited) }))
      .sort((a, b) => b.outlets - a.outlets || a.brand.localeCompare(b.brand));

    return {
      kpis: {
        outlets: outlets.length,
        active: list.reduce((a, g) => a + g.active, 0),
        inactive: outlets.length - list.reduce((a, g) => a + g.active, 0),
        scheduled,
        audited,
        pending: Math.max(0, scheduled - audited),
        shots: list.reduce((a, g) => a + g.shots, 0),
      },
      rows: list.slice(0, 8),
      note: `Bulan ${monthLabel(month)}`,
    };
  }

  private async contractsTab(rows: any[], today: string) {
    const contracts = await this.contractRows();
    const cases = new Map<string, number>();
    for (const r of rows) cases.set(upper(r.brand), (cases.get(upper(r.brand)) || 0) + 1);

    const list = [...contracts.values()]
      .map((c) => {
        const daysLeft = dayDiff(today, c.expired_at);
        return {
          brand: c.brand,
          type: upper(c.type) || '-',
          startAt: c.start_at || '',
          expiredAt: c.expired_at || '',
          daysLeft,
          status: contractStatus(daysLeft),
          monthlyFee: num(c.monthly_fee),
          pic: c.pic || '',
          cases: cases.get(upper(c.brand)) || 0,
        };
      })
      .sort((a, b) => {
        if (a.daysLeft === null && b.daysLeft === null) return a.brand.localeCompare(b.brand);
        if (a.daysLeft === null) return 1;
        if (b.daysLeft === null) return -1;
        return a.daysLeft - b.daysLeft;
      });

    const countType = (type: string) => list.filter((c) => c.type === type).length;
    return {
      kpis: {
        total: list.length,
        monthly: countType('MONTHLY'),
        gratis: countType('GRATIS'),
        baru: countType('BARU'),
        expiring30: list.filter((c) => c.daysLeft !== null && c.daysLeft >= 0 && c.daysLeft <= 30).length,
        expired: list.filter((c) => c.daysLeft !== null && c.daysLeft < 0).length,
      },
      rows: list.slice(0, 8),
    };
  }

  private async activityTab(from: string, to: string) {
    const start = `${String(from || '1970-01-01').slice(0, 10)}T00:00:00.000Z`;
    const end = `${String(to || '2999-12-31').slice(0, 10)}T23:59:59.999Z`;
    const res = await this.db.pq(
      `SELECT who,action,category,created_at FROM activity_logs WHERE created_at >= $1 AND created_at <= $2`,
      [start, end],
    );
    const logs = rowsOf(res);
    const map = new Map<string, any>();
    let input = 0;
    let update = 0;
    let validation = 0;
    for (const l of logs) {
      const who = str(l.who) || 'system';
      const text = `${str(l.action)} ${str(l.category)}`.toLowerCase();
      const isInput = /tambah|input|baru/.test(text);
      const isUpdate = /ubah|perbarui|update|perubahan/.test(text);
      const isValid = /validasi|audit/.test(text);
      if (isInput) input += 1;
      if (isUpdate) update += 1;
      if (isValid) validation += 1;
      let u = map.get(who);
      if (!u) {
        u = { user: who, actions: 0, inputCases: 0, updateCases: 0, validation: 0, lastAt: '' };
        map.set(who, u);
      }
      u.actions += 1;
      if (isInput) u.inputCases += 1;
      if (isUpdate) u.updateCases += 1;
      if (isValid) u.validation += 1;
      if (String(l.created_at || '') > String(u.lastAt || '')) u.lastAt = l.created_at;
    }
    const list = [...map.values()].sort((a, b) => b.actions - a.actions || a.user.localeCompare(b.user));
    return {
      kpis: {
        actions: logs.length,
        users: list.length,
        inputCases: input,
        updateCases: update,
        validation,
      },
      rows: list.slice(0, 8),
    };
  }

  private async slaTab(rows: any[], today: string) {
    const open = rows.filter((r) => !r.done);
    const ages = open
      .map((r) => dayDiff(r.raw.date_issue, today))
      .filter((n): n is number => n !== null && n >= 0);
    const avgAgeDays = ages.length > 0 ? Math.round(ages.reduce((a, n) => a + n, 0) / ages.length) : 0;
    const over = (days: number) => ages.filter((n) => n > days).length;

    const summaryRes = await this.db.pq(
      `SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN status <> 'Selesai' AND followup_date < $1 THEN 1 END) AS overdue,
        COUNT(CASE WHEN status <> 'Selesai' AND followup_date = $1 THEN 1 END) AS due_today,
        COUNT(CASE WHEN status = 'Selesai' THEN 1 END) AS done
       FROM followups`,
      [today],
    );
    const fs = rowsOf(summaryRes)[0] || {};
    const followRes = await this.db.pq(
      `SELECT client_name,title,priority,status,followup_date,pic FROM followups
       WHERE status <> 'Selesai' ORDER BY followup_date ASC LIMIT 8`,
    );
    const followRows = rowsOf(followRes).map((f) => {
      const late = dayDiff(f.followup_date, today);
      return {
        client: f.client_name || '-',
        title: f.title || '-',
        priority: f.priority || '-',
        status: f.status || '-',
        followupDate: f.followup_date || '',
        daysLate: late === null ? 0 : late,
        pic: f.pic || '-',
      };
    });

    return {
      kpis: {
        open: open.length,
        avgAgeDays,
        over3: over(3),
        over7: over(7),
        over14: over(14),
        over30: over(30),
        followupsTotal: num(fs.total),
        followupsOverdue: num(fs.overdue),
        followupsDueToday: num(fs.due_today),
        followupsDone: num(fs.done),
      },
      rows: followRows,
    };
  }

  private async qualityTab(rows: any[]) {
    const [syncRes, clientsRes, brandRes, userRes] = await Promise.all([
      this.db.pq(`SELECT status,started_at,finished_at FROM sync_logs ORDER BY started_at DESC LIMIT 1`),
      this.db.pq(`SELECT brand FROM clients`),
      this.db.pq(`SELECT brand FROM brand_statuses`),
      this.db.pq(`SELECT name FROM "user"`),
    ]);
    const sync = rowsOf(syncRes)[0] || null;
    const masterBrands = new Set<string>();
    for (const c of rowsOf(clientsRes)) masterBrands.add(upper(c.brand));
    for (const b of rowsOf(brandRes)) masterBrands.add(upper(b.brand));
    const masterUsers = new Set(rowsOf(userRes).map((u) => upper(u.name)).filter(Boolean));

    // rows sudah difilter getRangeRows(from,to); jangan memfilter ulang dengan
    // format tanggal mentah agar baris berformat 8 digit tetap ikut.
    const caseRows = rows;

    const missingBilling = caseRows.filter((r) => !str(r.raw.billing_status)).length;
    const missingAudit = caseRows.filter((r) => !str(r.raw.audit_action)).length;
    const missingTax = caseRows.filter((r) => isOnCall(r.raw.billing_status) && !str(r.raw.ppn_mode)).length;
    const validatedNoInvoice = caseRows.filter((r) => r.validated && r.invoice === 'MENUNGGU INVOICE').length;
    const paidNoProof = caseRows.filter((r) => r.invoice === 'PAID' && !str(r.raw.payment_note)).length;

    const unknownBrands = new Set<string>();
    for (const r of caseRows) {
      const key = upper(r.brand);
      if (key && !masterBrands.has(key)) unknownBrands.add(key);
    }
    const unknownUsers = new Set<string>();
    for (const r of caseRows) {
      if (r.user === 'TANPA USER') continue;
      if (!masterUsers.has(r.user)) unknownUsers.add(r.user);
    }

    const seen = new Map<string, number>();
    let duplicates = 0;
    for (const r of caseRows) {
      const no = str(r.raw.no);
      if (!no) continue;
      const key = `${no}|${upper(r.raw.client)}|${str(r.raw.date_issue)}`;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n > 1) duplicates += 1;
    }
    const invalidDates = caseRows.filter((r) => !parseDate(r.raw.date_issue)).length;
    const syncFailed = sync && upper(sync.status) === 'FAILED' ? 1 : 0;

    const checks = [
      { check: 'Tidak ada billing status', count: missingBilling, severity: 'Sedang', note: 'Billing kosong masuk LAINNYA.' },
      { check: 'Tidak ada audit status', count: missingAudit, severity: 'Tinggi', note: 'Belum punya baris/aksi audit.' },
      { check: 'ON-CALL tanpa data pajak', count: missingTax, severity: 'Tinggi', note: 'PPN tidak bisa dihitung.' },
      { check: 'Tervalidasi tanpa invoice', count: validatedNoInvoice, severity: 'Tinggi', note: 'Siap invoice tetapi masih menunggu.' },
      { check: 'PAID tanpa bukti pembayaran', count: paidNoProof, severity: 'Tinggi', note: 'Payment note kosong.' },
      { check: 'Brand tak ada di master', count: unknownBrands.size, severity: 'Sedang', note: 'Tidak ada di clients/brand_statuses.' },
      { check: 'User tak ada di master', count: unknownUsers.size, severity: 'Sedang', note: 'assign_to tidak cocok dengan akun.' },
      { check: 'Duplikat kasus', count: duplicates, severity: 'Sedang', note: 'no + brand + tanggal sama.' },
      { check: 'Tanggal issue invalid', count: invalidDates, severity: 'Rendah', note: 'Bukan tanggal kalender 8 digit.' },
      { check: 'Sync terakhir gagal', count: syncFailed, severity: 'Tinggi', note: sync ? `Status ${sync.status || '-'}.` : 'Belum ada log sync.' },
    ];

    return {
      kpis: {
        findings: checks.reduce((a, c) => a + c.count, 0),
        checksFailed: checks.filter((c) => c.count > 0).length,
        lastSyncStatus: sync?.status || '-',
        lastSyncAt: sync?.finished_at || sync?.started_at || '',
        missingTax,
      },
      rows: checks,
    };
  }
}
