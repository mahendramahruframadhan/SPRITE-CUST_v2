// Registry tool read-only untuk asisten AI (design 2026-10-23 langkah A.2).
// TOOL_SPECS diiklankan ke provider AI (JSON Schema OpenAI); runTool
// memvalidasi + menormalkan argumen JSON dari model SEBELUM memanggil lapisan
// query (ai.queries.ts): enum salah/error → { error } eksplisit ke model (tidak
// diubah diam-diam), HANYA limit yang di-clamp; tool tak pernah throw.

import {
  PERIOD_MIN_YEAR,
  PERIOD_MAX_YEAR,
  Period,
  periodLabel,
  countCases,
  caseTotals,
  topClients,
  moduleBreakdown,
  countAudit,
  countInvoice,
} from './ai.queries';

const BILLING_STATUSES = ['ON-CALL', 'MONTHLY', 'FREE'] as const;
const LIMIT_MIN = 1;
const LIMIT_MAX = 20;
const LIMIT_DEFAULT = 5;

const objectSchema = (properties: Record<string, object>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_SPECS: Array<{
  type: 'function';
  function: { name: string; description: string; parameters: object };
}> = [
  {
    type: 'function',
    function: {
      name: 'count_cases',
      description: 'Hitung jumlah kasus; bisa filter status case, billing, dan periode bulan/tahun.',
      parameters: objectSchema({
        status: { type: 'string', description: 'Filter status case, mis. DONE atau OPEN' },
        billing_status: { type: 'string', description: `Filter billing, salah satu: ${BILLING_STATUSES.join(', ')}` },
        month: { type: 'integer', description: 'Bulan 1-12 (tanpa bulan = seluruh periode)' },
        year: { type: 'integer', description: `Tahun ${PERIOD_MIN_YEAR}-${PERIOD_MAX_YEAR}` },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'case_totals',
      description: 'Rincian jumlah kasus & total tagihan dikelompokkan per billing atau per status.',
      parameters: objectSchema({
        group_by: { type: 'string', description: "Kelompokkan per 'billing_status' atau 'status'" },
        month: { type: 'integer', description: 'Bulan 1-12' },
        year: { type: 'integer', description: `Tahun ${PERIOD_MIN_YEAR}-${PERIOD_MAX_YEAR}` },
      }, ['group_by']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_clients',
      description: 'Daftar client teratas berdasarkan jumlah kasus atau total tagihan.',
      parameters: objectSchema({
        metric: { type: 'string', description: "Urutkan berdasarkan 'cases' atau 'charges'" },
        limit: { type: 'integer', description: 'Jumlah client yang ditampilkan (1-20)' },
        month: { type: 'integer', description: 'Bulan 1-12' },
        year: { type: 'integer', description: `Tahun ${PERIOD_MIN_YEAR}-${PERIOD_MAX_YEAR}` },
      }, ['metric']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_module_breakdown',
      description: 'Jumlah kasus per modul untuk mengetahui modul tersibuk.',
      parameters: objectSchema({
        month: { type: 'integer', description: 'Bulan 1-12' },
        year: { type: 'integer', description: `Tahun ${PERIOD_MIN_YEAR}-${PERIOD_MAX_YEAR}` },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_audit',
      description:
        'Hitung jumlah entri audit dari tabel audit_status; bisa filter action audit, mis. ' +
        'BELUM DIVALIDASI, VALID - SIAP INVOICE, atau PERLU DICEK ULANG. ' +
        'Bila tak yakin nilai status, panggil TANPA filter status dan laporkan total.',
      parameters: objectSchema({
        status: { type: 'string', description: 'Filter action audit, salah satu: BELUM DIVALIDASI, VALID - SIAP INVOICE, PERLU DICEK ULANG' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_invoice',
      description:
        'Hitung entri invoice dari tabel invoice_status; opsional kembalikan juga total nilai tagihan. ' +
        'Status invoice: MENUNGGU INVOICE, INVOICE TERBIT, DIKIRIM, PAID. ' +
        'Bila tak yakin nilai status, panggil TANPA filter status dan laporkan total.',
      parameters: objectSchema({
        status: { type: 'string', description: 'Filter status invoice, salah satu: MENUNGGU INVOICE, INVOICE TERBIT, DIKIRIM, PAID' },
        sum_amount: { type: 'boolean', description: 'true = sertakan total nilai tagihan (Rp)' },
      }),
    },
  },
];

export const TOOL_NAMES: string[] = TOOL_SPECS.map((s) => s.function.name);

// Argumen JSON dari model pakai snake_case ('billing_status', 'group_by',
// 'sum_amount', 'limit') — ini yang dibaca; pemetaan ke camelCase hanya
// terjadi di pemanggilan fungsi ai.queries.

const error = (err: string) => ({ error: err });

function asInt(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : NaN;
}

// Parse month/year → Period (bulan tanpa tahun pakai tahun berjalan);
// hasil string error kalau validasi gagal.
function parsePeriod(args: Record<string, unknown>): { period?: Period; err?: string } {
  const argsMonth = args['month'];
  const argsYear = args['year'];
  const period: Period = {};
  if (argsMonth !== undefined) {
    const month = asInt(argsMonth);
    if (!(month >= 1 && month <= 12)) return { err: 'month harus 1-12' };
    period.month = month;
  }
  if (argsYear !== undefined) {
    const year = asInt(argsYear);
    if (!(year >= PERIOD_MIN_YEAR && year <= PERIOD_MAX_YEAR)) {
      return { err: `year harus ${PERIOD_MIN_YEAR}-${PERIOD_MAX_YEAR}` };
    }
    period.year = year;
  } else if (period.month != null) {
    period.year = new Date().getFullYear();
  }
  return { period: period.month != null || period.year != null ? period : undefined };
}

// Limit disensor inilah satu-satunya argumen yang dibetulkan diam-diam
// (1-20); non-angka (termasuk NaN) → default; angka float di-floor lalu clamp.
function parseLimit(value: unknown): number {
  let limit: number = LIMIT_DEFAULT;
  if (typeof value === 'number' && Number.isFinite(value)) {
    limit = Math.floor(value);
    limit = Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, limit));
  }
  return limit;
}

// Status: string, trim, dipakai apa adanya (mis. 'AUDITEE').
const toStatus = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  const s = String(value).trim();
  return s || undefined;
};

// Billing: uppercase dulu (case-insensitive), hanya daftar tetap yang lolos.
function parseBillingStatus(value: unknown): { value?: string; err?: string } {
  if (value === undefined) return {};
  const s = String(value).trim().toUpperCase() as typeof BILLING_STATUSES[number];
  if (!BILLING_STATUSES.includes(s)) {
    return { err: `billing_status harus ${BILLING_STATUSES.join(', ')}` };
  }
  return { value: s };
}

export async function runTool(
  db: any,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (!TOOL_NAMES.includes(name)) return error('tool tidak dikenal');
  const a = args || {};

  // Validasi berjalan penuh SEBELUM query apa pun; enum atau periode salah
  // langsung kembali ke model sebagai { error } (tidak diubah diam-diam).
  // Limit di get_top_clients adalah pengecualian: di-clamp diam-diam 1-20.

  // Eksekusi dijaga: kegagalan db pun dikembalikan sebagai error ke model.
  try {
    switch (name) {
      case 'count_cases': {
        const p = parsePeriod(a);
        const b = parseBillingStatus(a['billing_status']);
        if (p.err) return error(p.err);
        if (b.err) return error(b.err);
        const total = await countCases(db, {
          status: toStatus(a['status']),
          billingStatus: b.value,
          period: p.period,
        });
        return { total, period: periodLabel(p.period ?? {}) };
      }
      case 'case_totals': {
        const g = a['group_by'];
        if (g !== 'billing_status' && g !== 'status') return error('group_by harus billing_status atau status');
        const p = parsePeriod(a);
        if (p.err) return error(p.err);
        const groups = await caseTotals(db, { groupBy: g, period: p.period });
        return { groups, period: periodLabel(p.period ?? {}) };
      }
      case 'get_top_clients': {
        const metric = a['metric'] === 'charges' ? 'charges' : a['metric'] === 'cases' ? 'cases' : null;
        if (metric == null) return error('metric harus cases atau charges');
        const p = parsePeriod(a);
        if (p.err) return error(p.err);
        const items = await topClients(db, { metric, limit: parseLimit(a['limit']), period: p.period });
        return { items, period: periodLabel(p.period ?? {}) };
      }
      case 'get_module_breakdown': {
        const p = parsePeriod(a);
        if (p.err) return error(p.err);
        const items = await moduleBreakdown(db, p.period);
        return { items, period: periodLabel(p.period ?? {}) };
      }
      case 'count_audit':
        return { total: await countAudit(db, { status: toStatus(a['status']) }) };
      case 'count_invoice': {
        const sumAmount = typeof a['sum_amount'] === 'boolean' ? (a['sum_amount'] as boolean) : false;
        return { ...(await countInvoice(db, { status: toStatus(a['status']), sumAmount })) };
      }
    }
  } catch (e: any) {
    return { error: `gagal menjalankan tool: ${e?.message || e}` };
  }
  return error('tool tidak dikenal');
}
