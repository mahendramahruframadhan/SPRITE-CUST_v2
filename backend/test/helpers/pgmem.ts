// Helper test pg-mem:paksa mode in-memory (jangan pernah menyentuh Postgres
// asli) + skema minimal untuk alur auth/billing. Impor helper ini DULU sebelum
// modul src agar getDb() termemo ke pg-mem. Jalankan: npm test.
process.env.DATABASE_URL = '';

import { getDb, getMemDb } from '../../src/db/drizzle.service.ts';
import { esc } from '../../src/db/sql.ts';

export function db() {
  return getDb();
}

export function setupTables() {
  const mem = getMemDb();
  const ddls = [
    `CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, active INTEGER)`,
    `CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, account_id TEXT, provider_id TEXT, user_id TEXT, password TEXT)`,
    `CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, expires_at TIMESTAMP, token TEXT UNIQUE, created_at TIMESTAMP, updated_at TIMESTAMP, user_id TEXT)`,
    `CREATE TABLE IF NOT EXISTS role_permissions (role TEXT, module TEXT, allowed INTEGER)`,
    `CREATE TABLE IF NOT EXISTS assistance_records (record_uuid TEXT PRIMARY KEY, no TEXT, client TEXT)`,
    `CREATE TABLE IF NOT EXISTS audit_status (record_uuid TEXT PRIMARY KEY, action TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS invoice_status (record_uuid TEXT PRIMARY KEY, status TEXT, updated_at TEXT, payment_note TEXT, paid_at TEXT, paid_by TEXT)`,
    `CREATE TABLE IF NOT EXISTS invoice_pdfs (id TEXT PRIMARY KEY, record_uuid TEXT, filename TEXT, storage_key TEXT, size_bytes INTEGER, status TEXT, uploaded_by TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS activity_logs (id TEXT PRIMARY KEY, who TEXT, action TEXT, category TEXT, detail TEXT, record_uuid TEXT, created_at TEXT)`,
  ];
  for (const ddl of ddls) mem.public.none(ddl);
}

export async function seedUser(role = 'Super Admin', email = 't@revota.id', password = 'password123') {
  const d = db();
  const id = `u_${role.slice(0, 2).toLowerCase()}_${Date.now().toString(36)}`;
  await d.execute(
    `INSERT INTO "user" (id, name, email, role, active) VALUES ('${esc(id)}','${esc(role)}','${esc(email)}','${esc(role)}',1)` as any,
  );
  await d.execute(
    `INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ('acc_${esc(id)}','${esc(email)}','credential','${esc(id)}','${esc(password)}')` as any,
  );
  return { id, email, password, role };
}

export async function seedCase(uuid = 'case-uuid-1', no = '1', client = 'BRAND-A') {
  const d = db();
  await d.execute(
    `INSERT INTO assistance_records (record_uuid, no, client) VALUES ('${esc(uuid)}','${esc(no)}','${esc(client)}') ON CONFLICT (record_uuid) DO NOTHING` as any,
  );
  return uuid;
}
