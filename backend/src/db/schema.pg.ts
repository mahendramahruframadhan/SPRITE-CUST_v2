import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

// Real Postgres schema — used when DATABASE_URL is postgres://
// For local dev we use pg-mem in-memory (same schema) — no Docker needed
export const assistanceRecords = pgTable(
  'assistance_records',
  {
    recordUuid: text('record_uuid').primaryKey(),
    no: text('no'),
    dateIssue: text('date_issue').notNull(),
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
  ],
);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified').default(0),
  image: text('image'),
  role: text('role').default('Viewer'),
  active: integer('active').default(1),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const auditStatus = pgTable('audit_status', {
  recordUuid: text('record_uuid').primaryKey().references(() => assistanceRecords.recordUuid, { onDelete: 'cascade' }),
  action: text('action').notNull().default('BELUM DIVALIDASI'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at'),
});

export const invoiceStatus = pgTable('invoice_status', {
  recordUuid: text('record_uuid').primaryKey().references(() => assistanceRecords.recordUuid, { onDelete: 'cascade' }),
  status: text('status').notNull().default('MENUNGGU INVOICE'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at'),
});

export const syncLogs = pgTable('sync_logs', {
  id: text('id').primaryKey(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  status: text('status').notNull(),
  rowsProcessed: integer('rows_processed').default(0),
  errorMessage: text('error_message'),
  source: text('source').default('sheets'),
});

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at'),
});

export const rolePermissions = pgTable('role_permissions', {
  role: text('role').notNull(),
  module: text('module').notNull(),
  allowed: integer('allowed').default(0),
  updatedAt: text('updated_at'),
});

export const activityLogs = pgTable('activity_logs', {
  id: text('id').primaryKey(),
  who: text('who'),
  action: text('action').notNull(),
  createdAt: text('created_at').notNull(),
});
