# SPRITE-CUST Backend — NestJS + Drizzle + Postgres (Docker)

API untuk frontend di `http://localhost:5005/api`. Database Postgres
berjalan di container Docker `asten-pg` (port host `5433`, database
`sprite_cust`) — berbagi server dengan DB lain tanpa mengganggu.

## Stack

- **NestJS 10** — `@Module`, `@Controller`, `@Injectable`, `ScheduleModule` cron
- **Drizzle ORM 0.38** (`drizzle-orm/node-postgres`) + driver `pg`
  (`pg-mem` hanya fallback bila `DATABASE_URL` bukan `postgres://`)
- **googleapis 144** — `google.auth.JWT` + `sheets.spreadsheets.values.get/append`
- Auth email/password di `src/auth/auth.controller.ts`
  (Better Auth tidak di-mount — men-shadow route Nest + password seed plaintext)

## Menjalankan

```bash
cd backend
npm install
cp .env.example .env
npm run dev            # → http://localhost:5005/api/health
```

`src/main.ts` memanggil `initDb()` saat boot: buat tabel bila belum ada
(`IF NOT EXISTS`), lalu seed **2034 kasus** dari
`frontend/src/data/cases.js` + **5 user** bila tabel masih kosong.

## Env

| Key | Nilai | Ket |
|-----|-------|-----|
| `PORT` | `5005` | Nest listen |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5433/sprite_cust` | Wajib `postgres://` agar pakai DB asli |
| `BETTER_AUTH_SECRET` | dev-secret | Ganti 32 char random di prod |
| `BETTER_AUTH_URL` | `http://localhost:5005` | Base URL auth |
| `FRONTEND_URL` | `http://localhost:5173` | Origin CORS |
| `SHEET_ID` / `SHEET_GID_DATA` / `SHEET_GID_CONFIG` | `1dJKS7…` / `1535609154` / `0` | Google Sheet sumber |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | kosong | Kosong → `SHEETS_MOCK=true` (tanpa Google API) |
| `SHEETS_MOCK` | `true` | `false` = baca/tulis Sheet asli |

## API

```
GET  /api/health
GET  /api/cases?page=1&limit=100&q=&module=&status=&billingStatus=&assignTo=&from=YYYYMMDD&to=YYYYMMDD
       → { data[], total, page, limit, totalPages } (key camelCase, siap pakai frontend)
GET  /api/cases/stats/summary
GET  /api/cases/:recordUuid            → detail + auditStatus + invoiceStatus
POST /api/cases {client, issue, dateIssue*, ...} → {ok, data}
PATCH /api/cases/:uuid/audit {action}  → ex. "VALID - SIAP INVOICE"
PATCH /api/cases/:uuid/invoice {status} → ex. "PAID"
GET  /api/billing/stats                → {auditCounts, invoiceCounts, totalCharges}
GET  /api/config  → {source: "db"|"frontend", config}
PUT  /api/config {config}
GET  /api/masters → {masters, priceListData} (dibaca dari frontend/src/data/masters.js)
POST /api/sync/trigger                 → sinkron manual (mock: echo ke sync_logs)
GET  /api/sync/logs
POST /api/auth/sign-up/email {email, password, name, role?}
POST /api/auth/sign-in/email {email, password} → {user} atau {error}
POST /api/auth/sign-out
GET  /api/users → [{id, name, email, role, active}]
PATCH /api/users/:id {name?, email?, role?, active?}
DELETE /api/users/:id (Super Admin dilindungi)
POST /api/users/:id/password {password}
GET  /api/roles/permissions → {perms: {role: {module: 0|1}}}
PUT  /api/roles/permissions {perms}
GET  /api/roles/logs (30 terakhir) · POST /api/roles/logs {who, action}
```

User seed: `rani@revota.id`, `budi.cs@revota.id`, `sari@revota.id`,
`finance@revota.id`, `vina@revota.id` (password awal `password123`) plus
`admin@revota.id` / `12345` (Super Admin). Password min. 5 karakter.

## Hak akses (PermGuard)

Endpoint **tulis** dijaga matriks `role_permissions` via header
`x-user-email` (dikirim otomatis oleh frontend). Tanpa izin → `403`.
Super Admin selalu lolos dan barisnya dikunci penuh di `PUT /roles/permissions`.

| Endpoint tulis | Butuh modul |
| --- | --- |
| `POST /api/cases` | `form` |
| `PATCH …/audit` / `PATCH …/invoice` | `billing` / `finance` |
| `PUT /api/config` | `cfg` |
| `/api/users*`, `/api/roles/*` | `roles` |

`GET` (baca) sengaja terbuka; menu + route frontend difilter oleh
`usePermissions` + `RequirePerm` dari matriks yang sama.

## Google Sheets live (bila mau)

1. GCP → Service Account → Keys → JSON → `base64` → `GOOGLE_SERVICE_ACCOUNT_JSON`
2. Share sheet ke service account sebagai Editor
3. `.env`: `SHEETS_MOCK=false`, restart. Cron tiap 5 menit + `POST /api/sync/trigger` manual.

## Skipped (YAGNI) — add when needed

Bulk read status audit/invoice, `role_permissions` table (role masih map di
`AuthContext.jsx`), export server-side, Redis cache, partisi Postgres per bulan.
