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
  countClients,
  contractTotals,
  outletTotals,
  followupTotals,
  supportTotals,
  lastSync,
  masterTotals,
  userTotals,
  auditSchedule,
} from './ai.queries';

const BILLING_STATUSES = ['ON-CALL', 'MONTHLY', 'FREE'] as const;
const LIMIT_MIN = 1;
const LIMIT_MAX = 20;
const LIMIT_DEFAULT = 5;

// Properti opsional dibuat nullable (type: [t,'null']): beberapa model (mis.
// gpt-oss via Groq) memancarkan null untuk filter yang tidak dipakai, dan
// penyedia memvalidasi argumen tool terhadap skema ini — non-nullable bikin
// HTTP 400. Runtime (runTool) memperlakukan null = tidak ada (dibuang).
const nullable = (property: object): object => {
  const t = (property as { type?: unknown }).type;
  if (!t || Array.isArray(t)) return property;
  return { ...property, type: [t, 'null'] };
};

const objectSchema = (properties: Record<string, object>, required: string[] = []) => ({
  type: 'object',
  properties: Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, nullable(v)])),
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
  // Perluasan lingkup 2026-10-26: master client/kontrak, outlet, follow-up,
  // breakdown support, sinkron, master konfigurasi, pengguna, jadwal audit.
  {
    type: 'function',
    function: {
      name: 'count_clients',
      description:
        'Hitung jumlah client. Dua basis: client unik yang muncul di kasus ' +
        '(source=kasus, default) atau jumlah kontrak client yang terdaftar ' +
        '(source=kontrak). Angka keduanya bisa berbeda.',
      parameters: objectSchema({
        source: { type: 'string', description: "Basis hitung: 'kasus' atau 'kontrak'" },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_contract_breakdown',
      description:
        'Ringkasan kontrak client: total, distribusi per tipe (MONTHLY atau GRATIS), ' +
        'total biaya bulanan, dan jumlah kontrak yang punya tanggal berakhir.',
      parameters: objectSchema({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_outlets',
      description: 'Jumlah outlet PoPi Nava; opsional dikelompokkan per city, province, atau region.',
      parameters: objectSchema({
        group_by: { type: 'string', description: "Tanpa = total saja; atau 'city', 'province', 'region'" },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_followups',
      description:
        'Ringkasan follow-up client: total, jumlah yang belum selesai, serta ' +
        'distribusi per status, priority, atau module. ' +
        'Bila tak yakin nilai status, kelompok per status dan sebutkan nilai yang ada.',
      parameters: objectSchema({
        group_by: { type: 'string', description: "Tanpa = per status; atau 'priority', 'module'" },
        open_only: { type: 'boolean', description: 'true = hanya yang belum selesai (belum ada resolved)' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_support_breakdown',
      description:
        'Rekap kasus per support_category, support_type, atau channel_ticket dengan ' +
        'metrik jumlah kasus atau total charge. Bisa filter month/year.',
      parameters: objectSchema({
        group_by: { type: 'string', description: "Tanpa = per support_category; atau 'support_type', 'channel_ticket'" },
        metric: { type: 'string', description: "Tanpa = jumlah kasus; 'charges' = total nilai tagihan" },
        month: { type: 'integer', description: 'Bulan 1-12' },
        year: { type: 'integer', description: `Tahun ${PERIOD_MIN_YEAR}-${PERIOD_MAX_YEAR}` },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_last_sync',
      description: 'Status sinkronisasi Google Sheets terakhir: kapan dimulai, status, jumlah baris, dan sumber. Tanpa argumen.',
      parameters: objectSchema({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'master_totals',
      description:
        'Jumlah entri tiap master konfigurasi (brands, modules, pricelist, supportTypes, supportCategories, channels, dan sejenisnya). Tanpa argumen.',
      parameters: objectSchema({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_users',
      description:
        'Ringkasan pengguna aplikasi: total, jumlah aktif, dan distribusi per role. ' +
        'Hanya angka — data pribadi pengguna tidak tersedia lewat tool. Tanpa argumen.',
      parameters: objectSchema({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_audit_schedule',
      description: 'Jadwal audit terakhir: bulan, jumlah minggu terjadwal, waktu pembaruan, dan siapa yang memperbarui. Tanpa argumen.',
      parameters: objectSchema({}),
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
  // null = field tidak dipakai oleh model (beberapa model mengirim null untuk
  // parameter opsional) — dibuang agar equal dengan argumen yang absent.
  const a: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (v !== null) a[k] = v;
  }

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
        // Konteks anti-hallucination: saat ada filter bulan, ikutkan total
        // seluruh kasus pada bulan itu agar model tak menebak/meng-echo contoh.
        if (p.period?.month != null) {
          const monthTotal = await countCases(db, { period: { month: p.period.month, year: p.period.year } });
          return { total, period: periodLabel(p.period), total_di_bulan: monthTotal };
        }
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

      // Perluasan lingkup 2026-10-26 — pola sama: validasi dulu, query kemudian.
      case 'count_clients': {
        const source = a['source'];
        if (source !== undefined && source !== 'kasus' && source !== 'kontrak') {
          return error('source harus kasus atau kontrak');
        }
        return { total: await countClients(db, { source: source || 'kasus' }), basis: source || 'kasus' };
      }
      case 'get_contract_breakdown': {
        const r = await contractTotals(db);
        return { ...r, groups: r.groups.map((g) => ({ label: g.type, count: g.count, monthly_fee: g.fee })) };
      }
      case 'count_outlets': {
        const g = a['group_by'];
        if (g !== undefined && g !== 'city' && g !== 'province' && g !== 'region') {
          return error('group_by harus city, province, region, atau tanpa nilai untuk total');
        }
        const r = await outletTotals(db, { groupBy: g as any });
        return g ? { total: r.total, groups: r.groups } : { total: r.total };
      }
      case 'count_followups': {
        const g = a['group_by'];
        if (g !== undefined && g !== 'status' && g !== 'priority' && g !== 'module') {
          return error('group_by harus status, priority, module, atau tanpa nilai (status)');
        }
        const r = await followupTotals(db, { groupBy: g || 'status', openOnly: a['open_only'] === true });
        return r;
      }
      case 'get_support_breakdown': {
        const g = a['group_by'];
        if (g !== undefined && g !== 'support_category' && g !== 'support_type' && g !== 'channel_ticket') {
          return error('group_by harus support_category, support_type, atau channel_ticket');
        }
        const metric = a['metric'];
        if (metric !== undefined && metric !== 'cases' && metric !== 'charges') {
          return error('metric harus cases atau charges');
        }
        const p = parsePeriod(a);
        if (p.err) return error(p.err);
        const items = await supportTotals(db, {
          groupBy: g || 'support_category',
          metric: metric || 'cases',
          period: p.period,
        });
        return {
          period: periodLabel(p.period ?? {}),
          items: metric === 'charges' ? items : items.map((i) => ({ label: i.label, count: i.count })),
        };
      }
      case 'get_last_sync': {
        const r = await lastSync(db);
        if (!r) return { sync: null, note: 'belum ada sinkronisasi' };
        return {
          sync: {
            started_at: r.started_at,
            finished_at: r.finished_at,
            status: r.status,
            rows: r.rows,
            source: r.source,
            error: r.error,
          },
        };
      }
      case 'master_totals': {
        return { groups: await masterTotals(db) };
      }
      case 'count_users': {
        const r = await userTotals(db);
        return { total: r.total, aktif: r.active, roles: r.roles };
      }
      case 'get_audit_schedule': {
        const r = await auditSchedule(db);
        if (!r) return { schedule: null, note: 'belum ada jadwal audit' };
        return { schedule: { month: r.month, weeks: r.weeks, updated_at: r.updated_at, dipakai: r.updated_by } };
      }
    }
  } catch (e: any) {
    return { error: `gagal menjalankan tool: ${e?.message || e}` };
  }
  return error('tool tidak dikenal');
}
