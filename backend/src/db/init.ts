import * as fs from 'fs';
import * as path from 'path';
import { getDb, getMemDb } from './drizzle.service';

export async function initDb() {
  const db: any = getDb();
  const mem = getMemDb();
  const url = process.env.DATABASE_URL || '';
  const isRealPg = url.startsWith('postgres');

  // DDL — create tables if not exists (works for both pg-mem and real PG)
  const ddl = `
    CREATE TABLE IF NOT EXISTS assistance_records (
      record_uuid TEXT PRIMARY KEY, no TEXT, date_issue TEXT NOT NULL, start_date TEXT, finish_date TEXT,
      client TEXT NOT NULL, pic_name TEXT, module TEXT, sub_module TEXT, location TEXT,
      issue TEXT, assign_to TEXT, status TEXT, support_category TEXT, billing_status TEXT,
      billing_category TEXT, ref_price_list TEXT, channel_ticket TEXT, support_type TEXT,
      charges INTEGER DEFAULT 0, completion_notes TEXT, group_kpi TEXT, group_kpi_desc TEXT,
      month TEXT, weeknum TEXT, updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_date_issue ON assistance_records(date_issue);
    CREATE INDEX IF NOT EXISTS idx_client ON assistance_records(client);
    CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER DEFAULT 0, image TEXT, created_at TIMESTAMP, updated_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, expires_at TIMESTAMP NOT NULL, token TEXT NOT NULL UNIQUE, created_at TIMESTAMP, updated_at TIMESTAMP, ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at TIMESTAMP, refresh_token_expires_at TIMESTAMP, scope TEXT, password TEXT, created_at TIMESTAMP, updated_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP, updated_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS audit_status (record_uuid TEXT PRIMARY KEY REFERENCES assistance_records(record_uuid) ON DELETE CASCADE, action TEXT NOT NULL DEFAULT 'BELUM DIVALIDASI', updated_by TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS invoice_status (record_uuid TEXT PRIMARY KEY REFERENCES assistance_records(record_uuid) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'MENUNGGU INVOICE', updated_by TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS sync_logs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, rows_processed INTEGER DEFAULT 0, error_message TEXT, source TEXT DEFAULT 'sheets');
    CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  `;

  if (!isRealPg && mem) {
    // pg-mem: exec via mem.public
    mem.public.none(ddl);
  } else {
    // real PG: use db execute
    try {
      await db.execute(ddl as any);
    } catch (e) {
      // pg-mem path already handled
    }
  }

  // Seed assistance_records from frontend/src/data/cases.js if empty
  try {
    let c = 0;
    if (!isRealPg && mem) {
      c = Number(mem.public.many(`SELECT COUNT(*) as c FROM assistance_records`)[0]?.c || 0);
    } else {
      const res: any = await db.execute(`SELECT COUNT(*) as c FROM assistance_records` as any);
      c = Number(res.rows?.[0]?.c ?? res[0]?.c ?? 0);
    }
    if (c === 0) {
      const casesPath = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src', 'data', 'cases.js');
      if (fs.existsSync(casesPath)) {
        const raw = fs.readFileSync(casesPath, 'utf8');
        const jsonStr = raw.split('export const allCases = ')[1].trim().replace(/;$/, '');
        const arr = JSON.parse(jsonStr) as any[];
        let ok = 0;
        for (const r of arr) {
          if (!r.recordUuid) continue;
          const esc = (v: any) => String(v || '').replace(/'/g, "''");
          const sql = `INSERT INTO assistance_records (record_uuid,no,date_issue,start_date,finish_date,client,pic_name,module,sub_module,location,issue,assign_to,status,support_category,billing_status,billing_category,ref_price_list,channel_ticket,support_type,charges,completion_notes,group_kpi,group_kpi_desc,month,weeknum) VALUES ('${esc(r.recordUuid)}','${esc(r.no)}','${esc(r.dateIssue)}','${esc(r.startDate)}','${esc(r.finishDate)}','${esc(r.client)}','${esc(r.picName)}','${esc(r.module)}','${esc(r.subModule)}','${esc(r.location)}','${esc(r.issue)}','${esc(r.assignTo)}','${esc(r.status)}','${esc(r.supportCategory)}','${esc(r.billingStatus)}','${esc(r.billingCategory)}','${esc(r.refPriceList)}','${esc(r.channelTicket)}','${esc(r.supportType)}',${Number(r.charges) || 0},'${esc(r.completionNotes)}','${esc(r.groupKpi)}','${esc(r.groupKpiDesc)}','${esc(r.month)}','${esc(r.weeknum)}') ON CONFLICT (record_uuid) DO NOTHING`;
          try {
            if (!isRealPg && mem) mem.public.none(sql);
            else await db.execute(sql as any);
            ok++;
          } catch (e) {
            // ponytail: skip bad row, continue — one bad control char shouldn't block 2035 rows
          }
        }
        console.log(`[db] seeded ${ok}/${arr.length} cases`);
      }
    }
  } catch (e) {
    console.warn('[db] seed cases skipped', e);
  }

  // Seed users
  try {
    const res: any = await db.execute(`SELECT COUNT(*) as c FROM "user"` as any);
    const c = Number(res.rows?.[0]?.c ?? res[0]?.c ?? 0);
    if (c === 0) {
      const now = new Date().toISOString();
      const users = [
        ['u_rani', 'Rani Admin', 'rani@revota.id'],
        ['u_budi', 'Budi Santoso', 'budi.cs@revota.id'],
        ['u_sari', 'Sari Support', 'sari@revota.id'],
        ['u_fajar', 'Fajar Finance', 'finance@revota.id'],
        ['u_vina', 'Vina Viewer', 'vina@revota.id'],
      ];
      for (const [id, name, email] of users) {
        await db.execute(`INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ('${id}','${name}','${email}',1,'${now}','${now}') ON CONFLICT (id) DO NOTHING` as any);
        // also create account entry with password hash placeholder — real sign-up will overwrite
        const accId = `acc_${id}`;
        await db.execute(`INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ('${accId}','${email}','credential','${id}','password123','${now}','${now}') ON CONFLICT (id) DO NOTHING` as any);
      }
      console.log(`[db] seeded 5 users`);
    }
  } catch (e) {
    console.warn('[db] seed users skipped', e);
  }
}
