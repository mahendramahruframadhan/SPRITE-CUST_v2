import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getDb, getMemDb } from './drizzle.service';

// Matriks izin default — cermin frontend RolesPage DEFAULT_PERMS
const ROLE_PERMS: Record<string, Record<string, number>> = {
  'Super Admin': { dashboard: 1, cases: 1, form: 1, hrreport: 1, cfg: 1, billing: 1, finance: 1, mockup: 1, roles: 1, logs: 1, settings: 1 },
  'Admin CS': { dashboard: 1, cases: 1, form: 1, hrreport: 1, cfg: 1, billing: 1, finance: 0, mockup: 1, roles: 0, logs: 1, settings: 1 },
  Support: { dashboard: 1, cases: 1, form: 1, hrreport: 1, cfg: 0, billing: 0, finance: 0, mockup: 0, roles: 0, logs: 0, settings: 1 },
  Finance: { dashboard: 1, cases: 0, form: 0, hrreport: 0, cfg: 0, billing: 1, finance: 1, mockup: 0, roles: 0, logs: 1, settings: 1 },
  Viewer: { dashboard: 1, cases: 1, form: 0, hrreport: 0, cfg: 0, billing: 0, finance: 0, mockup: 0, roles: 0, logs: 0, settings: 1 },
};

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
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Viewer';
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1;
    CREATE TABLE IF NOT EXISTS role_permissions (role TEXT NOT NULL, module TEXT NOT NULL, allowed INTEGER DEFAULT 0, updated_at TEXT, PRIMARY KEY (role, module));
    CREATE TABLE IF NOT EXISTS activity_logs (id TEXT PRIMARY KEY, who TEXT, action TEXT NOT NULL, category TEXT, detail TEXT, record_uuid TEXT, created_at TEXT NOT NULL);
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
        ['u_admin', 'Admin Utama', 'admin@revota.id', 'Super Admin', '12345'],
        ['u_rani', 'Rani Admin', 'rani@revota.id', 'Super Admin', 'password123'],
        ['u_budi', 'Budi Santoso', 'budi.cs@revota.id', 'Admin CS', 'password123'],
        ['u_sari', 'Sari Support', 'sari@revota.id', 'Support', 'password123'],
        ['u_fajar', 'Fajar Finance', 'finance@revota.id', 'Finance', 'password123'],
        ['u_vina', 'Vina Viewer', 'vina@revota.id', 'Viewer', 'password123'],
      ];
      for (const [id, name, email, role, pwd] of users) {
        await db.execute(`INSERT INTO "user" (id,name,email,email_verified,role,active,created_at,updated_at) VALUES ('${id}','${name}','${email}',1,'${role}',1,'${now}','${now}') ON CONFLICT (id) DO NOTHING` as any);
        // also create account entry with password hash placeholder — real sign-up will overwrite
        const accId = `acc_${id}`;
        await db.execute(`INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ('${accId}','${email}','credential','${id}','${pwd}','${now}','${now}') ON CONFLICT (id) DO NOTHING` as any);
      }
      console.log(`[db] seeded 6 users`);
    }
  } catch (e) {
    console.warn('[db] seed users skipped', e);
  }

  // Backfill role/active untuk DB lama + seed role_permissions + activity_logs
  // ponytail: guard role='Viewer' agar role yang diubah admin tidak tertimpa saat restart
  try {
    const q = async (sql: string) => {
      if (!isRealPg && mem) {
        mem.public.none(sql);
        return [];
      }
      const res: any = await db.execute(sql as any);
      return res.rows || res;
    };
    const roleSeed: Record<string, string> = {
      'admin@revota.id': 'Super Admin',
      'rani@revota.id': 'Super Admin',
      'budi.cs@revota.id': 'Admin CS',
      'sari@revota.id': 'Support',
      'finance@revota.id': 'Finance',
      'vina@revota.id': 'Viewer',
    };
    for (const [email, role] of Object.entries(roleSeed)) {
      await q(`UPDATE "user" SET role='${role}' WHERE email='${email}' AND role='Viewer'`);
    }
    await q(`UPDATE "user" SET active=1 WHERE active IS NULL`);
    // Migrasi ringan: kolom baru activity_logs untuk DB lama (aman bila sudah ada)
    for (const col of ['category TEXT', 'detail TEXT', 'record_uuid TEXT']) {
      try {
        await q(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ${col}`);
      } catch {}
    }
    // Backfill izin modul 'logs' untuk DB yang di-seed sebelum modul ini ada
    try {
      const now = new Date().toISOString();
      const logsSeed: Record<string, number> = { 'Super Admin': 1, 'Admin CS': 1, Support: 0, Finance: 1, Viewer: 0 };
      for (const [role, allowed] of Object.entries(logsSeed)) {
        await q(`INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ('${role}','logs',${allowed},'${now}') ON CONFLICT (role,module) DO NOTHING`);
      }
    } catch {}
    // Backfill izin modul 'settings' untuk DB yang di-seed sebelum modul ini ada
    try {
      const now = new Date().toISOString();
      const settingsSeed: Record<string, number> = { 'Super Admin': 1, 'Admin CS': 1, Support: 1, Finance: 1, Viewer: 1 };
      for (const [role, allowed] of Object.entries(settingsSeed)) {
        await q(`INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ('${role}','settings',${allowed},'${now}') ON CONFLICT (role,module) DO NOTHING`);
      }
    } catch {}
    // Seed master status Billing/Finance (dikelola dari Pengaturan) —
    // DO NOTHING agar perubahan admin tidak tertimpa saat restart
    try {
      const now = new Date().toISOString();
      const statusSeeds: Record<string, string[]> = {
        auditActions: ['BELUM DIVALIDASI', 'VALID - SIAP INVOICE', 'PERLU DICEK ULANG'],
        invoiceActions: ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'PAID'],
      };
      for (const [k, arr] of Object.entries(statusSeeds)) {
        const val = JSON.stringify(arr).replace(/'/g, "''");
        await q(`INSERT INTO app_config (key,value,updated_at) VALUES ('${k}','${val}','${now}') ON CONFLICT (key) DO NOTHING`);
      }
    } catch {}
    const pc: any = await q(`SELECT COUNT(*) as c FROM role_permissions`);
    if (!Number(pc[0]?.c || 0)) {
      const now = new Date().toISOString();
      for (const [role, mods] of Object.entries(ROLE_PERMS)) {
        for (const [mod, allowed] of Object.entries(mods)) {
          await q(`INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ('${role}','${mod}',${allowed},'${now}')`);
        }
      }
      console.log('[db] seeded role_permissions');
    }
    const lc: any = await q(`SELECT COUNT(*) as c FROM activity_logs`);
    if (!Number(lc[0]?.c || 0)) {
      const now = new Date().toISOString();
      const seedLogs = [
        ['Rani Admin', 'mengubah role Fajar Finance menjadi Finance'],
        ['Rani Admin', 'menonaktifkan akun Vina Viewer'],
        ['Budi Santoso', 'menambahkan pengguna baru Sari Support'],
        ['Rani Admin', 'memperbarui matriks izin modul'],
      ];
      for (const [who, act] of seedLogs) {
        await q(`INSERT INTO activity_logs (id,who,action,created_at) VALUES ('${randomUUID()}','${who}','${act}','${now}')`);
      }
      console.log('[db] seeded activity_logs');
    }
  } catch (e) {
    console.warn('[db] seed roles skipped', e);
  }
}
