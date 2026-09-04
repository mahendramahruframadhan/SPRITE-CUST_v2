# SPRITE-CUST Backend — NestJS 5005 + Better Auth + Drizzle (SQLite → Postgres)

> Ponytail lazy: local jalan tanpa Docker/Postgres. 1 file `data.db` cukup untuk 60k row (1k/bulan). Postgres tinggal ganti `DATABASE_URL`.

## Stack (Context7 refs)

* **NestJS 10** (`/nestjs/docs.nestjs.com`) — `@Module`, `@Controller`, `@Injectable`, `ScheduleModule` cron
* **Better Auth 1.3** (`/better-auth/better-auth`) — `betterAuth({ database: drizzleAdapter(db,{provider:"sqlite"}) })`, `toNodeHandler(auth)` di `src/main.ts:15`
* **Drizzle ORM 0.38** (`/drizzle-team/drizzle-orm-docs`) — `sqliteTable` + `better-sqlite3` driver, `drizzle-kit push`
* **googleapis 144** (`/websites/googleapis_dev_nodejs_googleapis`) — `google.auth.JWT` + `sheets.spreadsheets.values.get/append`

## Quick Start Local (Port 5005)

```bash
cd backend
npm install
cp .env.example .env   # sudah ada .env default 5005 + SHEETS_MOCK=true
npm run dev            # → http://localhost:5005/api/health
```

Frontend tetap tanpa ubah — cukup proxy (opsional):
```js
// frontend/vite.config.js
export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:5005' } }
})
// atau .env: VITE_API_URL=http://localhost:5005/api
```

## Env

| Key | Default | Ket |
|-----|---------|-----|
| `PORT` | `5005` | Nest listen |
| `DATABASE_URL` | `./data.db` | sqlite file. Postgres: `postgresql://user:pass@host:5432/db` |
| `BETTER_AUTH_SECRET` | dev-secret | ganti 32 char random prod |
| `BETTER_AUTH_URL` | `http://localhost:5005` | baseURL Better Auth |
| `SHEET_ID` | `1dJKS7...` | sama `SheetConfigPage.jsx:67` |
| `SHEET_GID_DATA` | `1535609154` | tab Data kasus |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | empty | base64 json. Kosong → `SHEETS_MOCK=true` baca dari `frontend/src/data/cases.js` seed |
| `SHEETS_MOCK` | `true` | `true` = tanpa Google API |

## Flow Teknis

```
Browser (Vite 5173)
  → /api/cases?page&limit&q&module&status (CasesService.findAll, drizzle paginated, indexed)
  → /api/cases/:uuid (detail + auditStatus + invoiceStatus)
  → POST /api/cases (FormKasusPage → SheetsService.appendCase → DB upsert)
  → PATCH /api/cases/:uuid/audit (BillingPage billingStatus update)
  → PATCH /api/cases/:uuid/invoice (FinanceAuditPage)
  → /api/auth/sign-up|sign-in (Better Auth, drizzleAdapter sqlite)

Google Sheets (1dJKS7...)
  → SheetsService.readDataTab() — JWT `google.auth.JWT` scopes spreadsheets
  → SyncService @Cron('*/5 * * * *') incremental upsert by record_uuid → sync_logs
  → Manual: POST /api/sync/trigger (tombol DashboardPage Muat Terbaru)
  → PRD 1-way: Sheets source of truth, Sheets append dulu baru DB
```

## API

```
GET  /api/health
GET  /api/cases?page=1&limit=50&q=&module=&status=&billingStatus=&assignTo=&from=YYYYMMDD&to=YYYYMMDD&sortBy=dateIssue&sortDir=desc
GET  /api/cases/stats/summary
GET  /api/cases/:recordUuid
POST /api/cases {client, issue, dateIssue*, module, ...} → {ok, data: row}
PATCH /api/cases/:uuid/audit {action: "VALID - SIAP INVOICE"}
PATCH /api/cases/:uuid/invoice {status: "PAID"}
GET  /api/billing/stats
GET  /api/config  → {source: "db"|"frontend", config: DEFAULT_CONFIG}
PUT  /api/config {config}
GET  /api/masters → {masters, priceListData}
POST /api/sync/trigger
GET  /api/sync/logs
ALL  /api/auth/* → Better Auth handler (sign-up, sign-in, sign-out, session)
```

## DB — Upgrade Postgres (ketika siap)

```bash
# 1. ganti drizzle.config.ts dialect: 'postgresql', driver: 'pg'
# 2. .env: DATABASE_URL=postgresql://user:pass@localhost:5432/sprite_cust
# 3. npm i pg
# 4. npx drizzle-kit push
# schema.ts ponytail: duplicate sqliteTable → pgTable (field sama, index sama)
```

`data.db` (sqlite) WAL mode, indexed `date_issue, client, assign_to, billing_status` — handle 60k row tanpa Docker.

## Google Sheets Setup (ketika mau live)

1. GCP Console → IAM → Service Accounts → Create → Keys → JSON → `base64` encode → paste ke `GOOGLE_SERVICE_ACCOUNT_JSON`
2. Share sheet `1dJKS7...` ke `service-account@project.iam.gserviceaccount.com` sebagai Editor
3. `.env`: `SHEETS_MOCK=false`, restart `npm run dev`
4. Test: `curl -X POST http://localhost:5005/api/sync/trigger`

## Better Auth

* Seed 5 user: `rani@revota.id`, `budi.cs@revota.id`, `sari@revota.id`, `finance@revota.id`, `vina@revota.id` — password `password123` via `POST /api/auth/sign-up`.
* Guard: `BetterAuthGuard` di `src/auth/auth.guard.ts` pakai `auth.api.getSession({headers})`.
* Frontend: `fetch('http://localhost:5005/api/auth/sign-in/email', {method:'POST', body: JSON.stringify({email,password}), credentials:'include'})`

## Skipped (YAGNI) — add when needed

* Postgres partition by month, Redis cache, Next.js migrasi, role_permissions table (sekarang hardcode RolesPage.jsx:30), file export server-side.
