// Lapisan query agregat read-only untuk tool asisten AI (design 2026-10-23
// langkah A.2). Kontrak: hanya SELECT, nama tabel/kolom HARDCODED (tidak pernah
// dari input), argumen diasumsikan sudah divalidasi pemanggil (Task 4), dan
// nilai NUMERIC yang diberi driver pg sebagai string dikonversi Number(...).
// Query dapat berjalan di pg-mem maupun Postgres asli lewat db.pq(text, params).

export const PERIOD_MIN_YEAR = 2020;
export const PERIOD_MAX_YEAR = 2035;

export interface Period {
  month?: number;
  year?: number;
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// '202607' untuk LIKE date_issue; tanpa bulan → null (periode tahunan tidak
// dipakai LIKE bulanan). Bulan tanpa tahun → tahun berjalan.
export function ymValue(p: Period): string | null {
  if (p.month == null) return null;
  const year = p.year != null ? p.year : new Date().getFullYear();
  return `${year}${String(p.month).padStart(2, '0')}`;
}

export function periodLabel(p: Period): string {
  if (p.month == null && p.year == null) return 'seluruh periode';
  if (p.month != null) {
    const year = p.year != null ? p.year : new Date().getFullYear();
    return `${MONTHS[p.month - 1]} ${year}`;
  }
  return `tahun ${p.year}`;
}

// Builder WHERE kecil: dorong nilai ke params, tempel placeholder $n ke sql
// (tanda '$' pertama diganti nomor parameter hasil dorongan).
function _w(clauses: string[], params: any[], sql: string, val: any) {
  params.push(val);
  clauses.push(sql.replace('$', `$${params.length}`));
}

// date_issue tersimpan YYYYMMDD → LIKE 'YYYYMM%'; periode hanya tahun → 'YYYY%'
function periodPart(clauses: string[], params: any[], p?: Period) {
  if (!p) return;
  if (p.month != null) _w(clauses, params, 'date_issue LIKE $', `${ymValue(p)}%`);
  else if (p.year != null) _w(clauses, params, 'date_issue LIKE $', `${p.year}%`);
}

function whereOf(clauses: string[], params: any[]): string {
  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
}

export async function countCases(db: any, f: { status?: string; billingStatus?: string; period?: Period }): Promise<number> {
  const clauses: string[] = [], params: any[] = [];
  if (f.status) _w(clauses, params, 'status = $', f.status);
  if (f.billingStatus) _w(clauses, params, 'billing_status = $', f.billingStatus);
  periodPart(clauses, params, f.period);
  const r = await db.pq(
    `SELECT COUNT(*) AS c FROM assistance_records${whereOf(clauses, params)}`,
    params,
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function caseTotals(
  db: any,
  f: { groupBy?: 'billing_status' | 'status'; period?: Period },
): Promise<Array<{ label: string; count: number; charges: number }>> {
  const col = f.groupBy === 'status' ? 'status' : 'billing_status';
  const clauses: string[] = [], params: any[] = [];
  periodPart(clauses, params, f.period);
  const r = await db.pq(
    `SELECT COALESCE(${col}, '—') AS label, COUNT(*) AS count, COALESCE(SUM(charges), 0) AS charges
     FROM assistance_records${whereOf(clauses, params)}
     GROUP BY ${col} ORDER BY count DESC, charges DESC, label`,
    params,
  );
  return r.rows.map((row: any) => ({
    label: String(row.label),
    count: Number(row.count),
    charges: Number(row.charges),
  }));
}

export async function topClients(
  db: any,
  f: { metric: 'cases' | 'charges'; limit: number; period?: Period },
): Promise<Array<{ client: string; total: number }>> {
  const agg = f.metric === 'charges' ? 'COALESCE(SUM(charges), 0)' : 'COUNT(*)';
  const clauses: string[] = [], params: any[] = [];
  periodPart(clauses, params, f.period);
  params.push(f.limit);
  const r = await db.pq(
    `SELECT client, ${agg} AS total
     FROM assistance_records${whereOf(clauses, params)}
     GROUP BY client ORDER BY total DESC LIMIT $${params.length}`,
    params,
  );
  return r.rows.map((row: any) => ({ client: String(row.client), total: Number(row.total) }));
}

export async function moduleBreakdown(db: any, period?: Period): Promise<Array<{ module: string; count: number }>> {
  const clauses: string[] = [], params: any[] = [];
  periodPart(clauses, params, period);
  const r = await db.pq(
    `SELECT COALESCE(module, '—') AS module, COUNT(*) AS count
     FROM assistance_records${whereOf(clauses, params)}
     GROUP BY module ORDER BY count DESC, module`,
    params,
  );
  return r.rows.map((row: any) => ({ module: String(row.module), count: Number(row.count) }));
}

export async function countAudit(db: any, f: { status?: string }): Promise<number> {
  const clauses: string[] = [], params: any[] = [];
  if (f.status) _w(clauses, params, 'action = $', f.status);
  const r = await db.pq(`SELECT COUNT(*) AS c FROM audit_status${whereOf(clauses, params)}`, params);
  return Number(r.rows[0]?.c ?? 0);
}

export async function countInvoice(
  db: any,
  f: { status?: string; sumAmount?: boolean },
): Promise<{ total: number; amount?: number }> {
  const clauses: string[] = [], params: any[] = [];
  if (f.status) _w(clauses, params, 'i.status = $', f.status);
  const where = whereOf(clauses, params);
  if (f.sumAmount) {
    const r = await db.pq(
      `SELECT COUNT(*) AS total, COALESCE(SUM(a.charges), 0) AS amount
       FROM invoice_status i JOIN assistance_records a ON a.record_uuid = i.record_uuid${where}`,
      params,
    );
    return { total: Number(r.rows[0]?.total ?? 0), amount: Number(r.rows[0]?.amount ?? 0) };
  }
  const r = await db.pq(`SELECT COUNT(*) AS total FROM invoice_status i${where}`, params);
  return { total: Number(r.rows[0]?.total ?? 0) };
}
