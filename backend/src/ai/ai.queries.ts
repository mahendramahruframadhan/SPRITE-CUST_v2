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

// Perluasan lingkup (2026-10-26): master client/kontrak, outlet PoPi Nava,
// follow-up, breakdown support/channel, sinkron Sheets, master konfigurasi,
// pengguna, dan jadwal audit — semua agregat counts/sums, tanpa baris detail.

// Jumlah client: 'kasus' = client unik pada assistance_records; 'kontrak' =
// entri kontrak pada brand_statuses (tabel clients master saat ini kosong).
export async function countClients(db: any, f: { source?: 'kasus' | 'kontrak' }): Promise<number> {
  if (f.source === 'kontrak') {
    const r = await db.pq(`SELECT COUNT(*) AS c FROM brand_statuses`, []);
    return Number(r.rows[0]?.c ?? 0);
  }
  const r = await db.pq(`SELECT COUNT(DISTINCT client) AS c FROM assistance_records WHERE COALESCE(client,'') <> ''`, []);
  return Number(r.rows[0]?.c ?? 0);
}

// Kontrak per tipe (MONTHLY/GRATIS) + total monthly_fee + jumlah ber-tanggal
// berakhir + tanggal berakhir paling dekat (bukan hari ini — teks bebas).
export async function contractTotals(db: any): Promise<{
  total: number;
  groups: Array<{ type: string; count: number; fee: number }>;
  expiring: number;
  nearestExpiry: string | null;
}> {
  const g = await db.pq(
    `SELECT COALESCE(type, '—') AS type, COUNT(*) AS count, COALESCE(SUM(monthly_fee), 0) AS fee
     FROM brand_statuses GROUP BY type ORDER BY type`,
    [],
  );
  const e = await db.pq(
    `SELECT COUNT(*) AS n, MIN(expired_at) AS nearest FROM brand_statuses WHERE COALESCE(expired_at, '') <> ''`,
    [],
  );
  return {
    total: g.rows.reduce((s: number, row: any) => s + Number(row.count), 0),
    groups: g.rows.map((row: any) => ({ type: String(row.type), count: Number(row.count), fee: Number(row.fee) })),
    expiring: Number(e.rows[0]?.n ?? 0),
    nearestExpiry: e.rows[0]?.nearest ? String(e.rows[0].nearest) : null,
  };
}

// Outlet PoPi Nava: total (default) atau dikelompokkan per city/province/region;
// status selalu dibaca apa adanya (semua baris, kolom status).
export async function outletTotals(
  db: any,
  f: { groupBy?: 'city' | 'province' | 'region' },
): Promise<{ total: number; groups?: Array<{ label: string; count: number }> }> {
  const r = await db.pq(`SELECT COUNT(*) AS c FROM popinava_outlets`, []);
  const total = Number(r.rows[0]?.c ?? 0);
  const col = f.groupBy;
  if (!col) return { total };
  const g = await db.pq(
    `SELECT COALESCE(${col}, '—') AS label, COUNT(*) AS count
     FROM popinava_outlets GROUP BY ${col} ORDER BY count DESC, label`,
    [],
  );
  return { total, groups: g.rows.map((row: any) => ({ label: String(row.label), count: Number(row.count) })) };
}

// Follow-up: kelompok per status/priority/module (default status); hanya belum
// selesai bila openOnly (resolved_at kosong/null).
export async function followupTotals(
  db: any,
  f: { groupBy?: 'status' | 'priority' | 'module'; openOnly?: boolean },
): Promise<{ total: number; open: number; groups: Array<{ label: string; count: number }> }> {
  const col = f.groupBy || 'status';
  const clauses: string[] = [], params: any[] = [];
  if (f.openOnly) _w(clauses, params, 'COALESCE(resolved_at, \'\') = $', '');
  const r = await db.pq(`SELECT COUNT(*) AS c FROM followups${whereOf(clauses, params)}`, params);
  const total = Number(r.rows[0]?.c ?? 0);
  const openRows = await db.pq(`SELECT COUNT(*) AS c FROM followups WHERE COALESCE(resolved_at, '') = $1`, ['']);
  const groups = await db.pq(
    `SELECT COALESCE(${col}, '—') AS label, COUNT(*) AS count
     FROM followups${whereOf(clauses, params)}
     GROUP BY ${col} ORDER BY count DESC, label`,
    params,
  );
  return {
    total,
    open: Number(openRows.rows[0]?.c ?? 0),
    groups: groups.rows.map((row: any) => ({ label: String(row.label), count: Number(row.count) })),
  };
}

// Breakdown kasus per support_category/support_type/channel_ticket dengan
// metrik kasus (count) atau charge (SUM) — juga menerapkan periode filter.
export async function supportTotals(
  db: any,
  f: { groupBy?: 'support_category' | 'support_type' | 'channel_ticket'; metric?: 'cases' | 'charges'; period?: Period },
): Promise<Array<{ label: string; count: number; charges: number }>> {
  const col = f.groupBy || 'support_category';
  const agg = f.metric === 'charges' ? 'COALESCE(SUM(charges), 0)' : 'COUNT(*)';
  const clauses: string[] = [], params: any[] = [];
  periodPart(clauses, params, f.period);
  const r = await db.pq(
    `SELECT COALESCE(${col}, '—') AS label, COUNT(*) AS count, COALESCE(SUM(charges), 0) AS charges
     FROM assistance_records${whereOf(clauses, params)}
     GROUP BY ${col} ORDER BY ${agg === 'COUNT(*)' ? 'count' : 'charges'} DESC, label`,
    params,
  );
  return r.rows.map((row: any) => ({
    label: String(row.label),
    count: Number(row.count),
    charges: Number(row.charges),
  }));
}

// Sinkron Sheets terakhir (satu baris terbaru berdasarkan started_at).
export async function lastSync(
  db: any,
): Promise<{ started_at: string; finished_at: string | null; status: string; rows: number; source: string; error: string | null } | null> {
  const r = await db.pq(
    `SELECT started_at, finished_at, status, COALESCE(rows_processed, 0) AS rows_processed, COALESCE(error_message, '') AS error_message, COALESCE(source, '') AS source
     FROM sync_logs ORDER BY started_at DESC LIMIT 1`,
    [],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    started_at: String(row.started_at),
    finished_at: row.finished_at != null ? String(row.finished_at) : null,
    status: String(row.status),
    rows: Number(row.rows_processed),
    source: String(row.source),
    error: String(row.error_message) || null,
  };
}

// Master konfigurasi (app_config key 'sheetConfig'): jumlah entri tiap daftar
// master (brands, modules, pricelist, supportTypes, …) — hanya array.
export async function masterTotals(db: any): Promise<Array<{ label: string; count: number }>> {
  const r = await db.pq(`SELECT value FROM app_config WHERE key = $1`, ['sheetConfig']);
  const raw = r.rows[0]?.value;
  if (!raw) return [];
  let cfg: any;
  try {
    cfg = JSON.parse(String(raw));
  } catch {
    return [];
  }
  return Object.entries(cfg || {})
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => ({ label: k, count: (v as any[]).length }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Pengguna: jumlah, yang aktif, dan distribusi role — counts saja, TANPA
// data pribadi (email/nama tidak dipakai tool).
export async function userTotals(db: any): Promise<{ total: number; active: number; roles: Array<{ label: string; count: number }> }> {
  const t = await db.pq(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active FROM "user"`, []);
  const roles = await db.pq(
    `SELECT COALESCE(role, '—') AS label, COUNT(*) AS count FROM "user" GROUP BY role ORDER BY count DESC, label`,
    [],
  );
  return {
    total: Number(t.rows[0]?.total ?? 0),
    active: Number(t.rows[0]?.active ?? 0),
    roles: roles.rows.map((row: any) => ({ label: String(row.label), count: Number(row.count) })),
  };
}

// Jadwal audit (audit_schedule baris tunggal terbaru): bulan, jumlah minggu,
// updated_at/updated_by. weeks TEXT JSON — gagal parse → jumlah minggu null.
export async function auditSchedule(
  db: any,
): Promise<{ month: string; weeks: number | null; updated_at: string | null; updated_by: string | null } | null> {
  const r = await db.pq(
    `SELECT month, weeks, updated_by, updated_at FROM audit_schedule ORDER BY month DESC LIMIT 1`,
    [],
  ) as any;
  const row = r.rows?.[0];
  if (!row) return null;
  let weeks: number | null = null;
  try {
    const parsed = JSON.parse(String(row.weeks));
    if (Array.isArray(parsed)) weeks = parsed.length;
  } catch {
    weeks = null;
  }
  return {
    month: String(row.month),
    weeks,
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
    updated_by: row.updated_by != null ? String(row.updated_by) : null,
  };
}
