import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// ponytail: sqliteTable for local zero-ops. Upgrade path: duplicate this file as schema.pg.ts using pgTable + `npm i pg` + change drizzle.config.ts dialect to 'postgresql'
export const assistanceRecords = sqliteTable(
  'assistance_records',
  {
    recordUuid: text('record_uuid').primaryKey(),
    no: text('no'),
    dateIssue: text('date_issue').notNull(), // YYYYMMDD — indexed for filter DataKasusPage.jsx:46
    startDate: text('start_date'),
    finishDate: text('finish_date'),
    client: text('client').notNull(),
    picName: text('pic_name'),
    module: text('module'),
    subModule: text('sub_module'),
    location: text('location'),
    issue: text('issue'),
    assignTo: text('assign_to'),
    status: text('status'),
    supportCategory: text('support_category'),
    billingStatus: text('billing_status'),
    billingCategory: text('billing_category'),
    refPriceList: text('ref_price_list'),
    channelTicket: text('channel_ticket'),
    supportType: text('support_type'),
    charges: integer('charges').default(0),
    completionNotes: text('completion_notes'),
    groupKpi: text('group_kpi'),
    groupKpiDesc: text('group_kpi_desc'),
    month: text('month'),
    weeknum: text('weeknum'),
    updatedAt: text('updated_at'),
  },
  (t) => [
    index('idx_date_issue').on(t.dateIssue),
    index('idx_client').on(t.client),
    index('idx_assign_to').on(t.assignTo),
    index('idx_billing_status').on(t.billingStatus),
    index('idx_module').on(t.module),
    index('idx_date_client').on(t.dateIssue, t.client),
  ],
);

// Better Auth core tables — minimal required (better-auth will auto-create via drizzleAdapter, but we declare for drizzle-kit)
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Audit & invoice status — replaces localStorage caseAuditStatus / caseInvoiceStatus
export const auditStatus = sqliteTable('audit_status', {
  recordUuid: text('record_uuid').primaryKey().references(() => assistanceRecords.recordUuid, { onDelete: 'cascade' }),
  action: text('action').notNull().default('BELUM DIVALIDASI'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at'),
});

export const invoiceStatus = sqliteTable('invoice_status', {
  recordUuid: text('record_uuid').primaryKey().references(() => assistanceRecords.recordUuid, { onDelete: 'cascade' }),
  status: text('status').notNull().default('MENUNGGU INVOICE'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at'),
});

export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  status: text('status').notNull(),
  rowsProcessed: integer('rows_processed').default(0),
  errorMessage: text('error_message'),
  source: text('source').default('sheets'),
});

export const appConfig = sqliteTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
  updatedAt: text('updated_at'),
});
