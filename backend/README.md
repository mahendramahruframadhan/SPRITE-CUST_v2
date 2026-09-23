# SPRITE-CUST Backend — NestJS + Drizzle + Postgres (Docker opsional)

API untuk frontend di `http://localhost:5005/api`.

## Cara cepat jalan di localhost (baru clone / lanjutkan project)

```bash
cd backend
npm run setup      # bikin .env dari .env.example (tidak menimpa kalau .env sudah ada)
npm install        # install dependencies (wajib pertama kali → mengadakan ts-node)
npm run dev        # → http://localhost:5005/api/health
```

Cek: buka `http://localhost:5005/api/health` → harus balas
`{"ok":true,"service":"sprite-cust-backend",...}`.

> Default `.env` memakai **MODE A (tanpa Docker)**: `DATABASE_URL` dikosongkan
> sehingga backend memakai `pg-mem` (database in-memory). Jadi **langsung jalan
> tanpa install Docker/Postgres**. Data hilang saat restart — normal untuk dev.

## Syarat

- **Node.js ≥ 18** (teruji di Node 24), **npm ≥ 9**. Cek dengan:
  `node --version && npm --version`.
- Tidak butuh Docker/Postgres untuk mulai (lihat MODE A di bawah).
- Frontend terpisah — jalankan dari folder `frontend` bila perlu
  (`FRONTEND_URL` default `http://localhost:5173`).

## Database: 2 mode (pilih di `.env`)

| Mode | `DATABASE_URL` | Kapan dipakai |
|------|----------------|---------------|
| **A. pg-mem (default)** | dikosongkan | Localhost cepat, tanpa Docker. Seed otomatis tiap boot. Data hilang saat restart. |
| **B. Postgres asli** | `postgresql://postgres:postgres@localhost:5433/sprite_cust` | Data persisten. Wajib Postgres jalan dulu (mis. container `sprite-pg`, port host `5433`, db `sprite_cust`, volume `sprite-pgdata`). |

Aturan di kode (`src/db/drizzle.service.ts`): URL diawali `postgres` → pakai
Postgres asli, selain itu → `pg-mem`.

`src/main.ts` memanggil `initDb()` saat boot: buat tabel bila belum ada
(`IF NOT EXISTS`), lalu seed **2034 kasus** dari
`frontend/src/data/cases.js` + **6 user** bila tabel masih kosong.

## Scripts

| Perintah | Fungsi |
|----------|--------|
| `npm run setup` | Buat `.env` dari `.env.example` (aman, tidak menimpa) |
| `npm install` | Install dependencies (pertama kali / setelah pull) |
| `npm run dev` | Jalankan dev server (`ts-node`, baca `.env`) |
| `npm run dev:local` | Sama seperti `dev` tapi paksa MODE A (pg-mem), abaikan `DATABASE_URL` di `.env` — berguna bila `.env` menunjuk Postgres yang sedang mati |
| `npm run build` | Compile TypeScript ke `dist/` |
| `npm start` | Jalankan hasil build (`node dist/main.js`) |
| `npm run typecheck` | Cek tipe tanpa emit (CI / sebelum commit) |
| `npm run db:push` / `db:generate` | Drizzle Kit (hanya untuk MODE B / Postgres asli) |
| `npm run db:empty` | Kosongkan isi DB Postgres (`scripts/reset-db.sql`, struktur tetap) |
| `npm run dev:empty` | Boot pg-mem kosong tanpa seed (`SKIP_SEED=true`, siap inject Sheet) |

## Troubleshooting (yang sering kejadian)

1. **`ts-node not found` / `sh: ts-node: command not found` saat `npm run dev`**
   → `node_modules` belum ada. Solusi: `npm install` dulu, lalu `npm run dev`.
2. **`ERESOLVE could not resolve` (`better-auth` vs `drizzle-kit`) saat `npm install`**
   → Sudah ditangani repo ini via file `.npmrc` (`legacy-peer-deps=true`).
   Jangan hapus file itu. Bila masih error, pastikan npm ≥ 9 lalu ulangi
   `npm install`.
3. **Backend exit / gagal konek padahal `.env` menunjuk `postgresql://...`**
   → Postgres-nya belum jalan (atau Docker belum terinstall). Pilihan:
   - cepat: `npm run dev:local` (paksa pg-mem), atau
   - kosongkan `DATABASE_URL` di `.env`, atau
   - nyalakan Postgres lalu `npm run dev` lagi.
4. **`EADDRINUSE` / port 5005 sudah dipakai** → ada backend lain masih jalan.
   Matikan proses lama, atau ganti `PORT` di `.env`.
5. **Frontend kena CORS / `Failed to fetch`** → pastikan backend jalan di
   `http://localhost:5005` dan `FRONTEND_URL` di `.env` = origin frontend
   (`http://localhost:5173`).
6. **Data kosong setelah restart** → normal di MODE A (pg-mem in-memory).
   Butuh persisten? Pakai MODE B.
7. **`.env` tidak ada** → `npm run setup` (atau `cp .env.example .env`).

## Stack

- **NestJS 10** — `@Module`, `@Controller`, `@Injectable`, `ScheduleModule` cron
- **Drizzle ORM 0.38** (`drizzle-orm/node-postgres`) + driver `pg`
  (`pg-mem` hanya fallback bila `DATABASE_URL` bukan `postgres://`)
- **googleapis 144** — `google.auth.JWT` + `sheets.spreadsheets.values.get/append`
- Auth email/password di `src/auth/auth.controller.ts`
  (Better Auth tidak di-mount — men-shadow route Nest + password seed plaintext)

## Env

| Key | Nilai default | Ket |
|-----|---------------|-----|
| `PORT` | `5005` | Nest listen |
| `DATABASE_URL` | *(kosong = pg-mem)* | Isi `postgresql://postgres:postgres@localhost:5433/sprite_cust` untuk MODE B |
| `BETTER_AUTH_SECRET` | dev-secret | Ganti 32 char random di prod |
| `BETTER_AUTH_URL` | `http://localhost:5005` | Base URL auth |
| `FRONTEND_URL` | `http://localhost:5173` | Origin CORS |
| `SHEET_ID` / `SHEET_GID_DATA` / `SHEET_GID_CONFIG` | `1dJKS7…` / `1535609154` / `0` | Google Sheet sumber |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | kosong | Kosong → `SHEETS_MOCK=true` (tanpa Google API) |
| `SHEETS_MOCK` | `true` | `false` = baca/tulis Sheet asli |
| `SKIP_SEED` | kosong | `true` = DDL saja, tanpa seed apa pun |
| `SKIP_FINANCE_SEED` | kosong | `true` = lewati seed 15 contoh kontrak finance |

## API

```
GET  /api/health
GET  /api/cases?page=1&limit=100&q=&module=&status=&billingStatus=&assignTo=&from=YYYYMMDD&to=YYYYMMDD
       → { data[], total, page, limit, totalPages } (key camelCase, siap pakai frontend)
GET  /api/cases/stats/summary
GET  /api/cases/:recordUuid            → detail + auditStatus + invoiceStatus
POST /api/cases {client, issue, dateIssue*, ...} → {ok, data}
PATCH /api/cases/:uuid/audit {action}  → ex. "VALID - SIAP INVOICE"
PATCH /api/cases/:uuid/invoice {status: "PAID", paymentNote*} → PAID + bukti bayar
GET  /api/billing/stats                → {auditCounts, invoiceCounts, totalCharges}
GET  /api/config  → {source: "db"|"frontend", config}
PUT  /api/config {config}
GET  /api/masters → {masters, priceListData} (dibaca dari frontend/src/data/masters.js)
POST /api/sync/trigger                 → sinkron manual (mock: echo ke sync_logs)
GET  /api/sync/logs
POST /api/auth/sign-up/email {email, password, name, role?}
       → 201 {user} · 400 VALIDATION_ERROR · 409 EMAIL_TAKEN.
       Role awal Viewer; body.role hanya dihormati bila peminta (header
       x-user-email) adalah Super Admin — dipakai form tambah pengguna /roles.
       Daftar HANYA menyimpan ke DB; frontend mengarahkan ke /login (tanpa auto-login).
GET  /api/setup/status → {firstRun, userCount} (Cache-Control: no-store, publik)
POST /api/setup/first-admin {name, email, password}
       → 201 {user Super Admin} — HANYA saat DB kosong, role dikunci server.
       409 ALREADY_INITIALIZED bila sudah ada user · 409 EMAIL_TAKEN ·
       400 VALIDATION_ERROR · throttle 10 req/menit/IP.
POST /api/auth/sign-in/email {email, password} → {user} atau {error}
POST /api/auth/sign-out
GET  /api/users → [{id, name, email, role, active}]
PATCH /api/users/:id {name?, email?, role?, active?}
DELETE /api/users/:id (Super Admin dilindungi)
POST /api/users/:id/password {password}
GET  /api/roles/permissions → {perms: {role: {module: 0|1}}}
PUT  /api/roles/permissions {perms}
GET  /api/roles/logs (30 terakhir) · POST /api/roles/logs {who, action}
POST /api/ai/chat {messages, connectionId?} → {ok, reply} (proxy AI eksternal + system prompt SPRITE AI + snapshot data; key di app_config `aiConfig`)
GET  /api/ai/connections → [{id, name, provider, model, active}] (tanpa key, untuk switcher model)
GET  /api/clients → [{id, brand, company, pic, contact, joined_at, ...}]
POST /api/clients {brand*, company?, pic?, contact?, joinedAt?, source?, note?} → {ok, data}
PATCH /api/clients/:id {...} · DELETE /api/clients/:id
GET  /api/brand-status → [{id, brand, type, expired_at, ...}] (seed 6 Monthly + 9 Free bila kosong)
POST /api/brand-status {brand*, type: MONTHLY|BARU|GRATIS, expiredAt* bila GRATIS}
        → {ok, data} · 400 BRAND_REQUIRED/EXPIRED_REQUIRED · 409 BRAND_EXISTS
PATCH /api/brand-status/:id {brand?, type?, expiredAt?, ...} · DELETE /api/brand-status/:id
```

User seed: `admin@revota.id` (`12345`, Super Admin), `rani@revota.id`,
`budi.cs@revota.id`, `sari@revota.id`, `finance@revota.id`,
`vina@revota.id` (password awal `password123`). Password min. 5 karakter.

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
| `/api/clients*`, `/api/brand-status*` | `clients` |

`GET` (baca) sengaja terbuka; menu + route frontend difilter oleh
`usePermissions` + `RequirePerm` dari matriks yang sama.

## Kosongkan DB + inject dari Sheet live terbaru

Sheet live saat ini: `1dozgmtHZFsIkwbnFbsDR5hCQWc6_LG_psPzIXyFX8XU`
(sheet lama `1dJKS7iJ80iK2rV5Jd9D6ap3yATcaUOlj07IcJg74CuY` sudah tidak dipakai —
struktur/kolom sama persis, 25 kolom `COLS` di `src/sheets/sheets.service.ts`).

1. Backup dulu (MODE B / Postgres asli):
   `pg_dump "$DATABASE_URL" > backup-main-$(date +%F).sql`
2. Kosongkan isi (struktur tetap):
   - MODE B: `npm run db:empty` (= `psql "$DATABASE_URL" -f scripts/reset-db.sql`;
     TRUNCATE CASCADE + hapus `app_config.syncHashes` agar sync berikutnya
     menganggap semua baris baru).
   - MODE A (pg-mem, default): cukup `npm run dev:empty`
     (= `SKIP_SEED=true`), karena in-memory hilang tiap restart dan seed
     2034 kasus + 6 user dilewati.
   - Tanpa `SKIP_SEED`, `initDb()` akan me-seed ulang data lama saat boot.
3. Isi `.env` Sheet live + share sheet ke service account sebagai Editor:
   `SHEET_ID=1dozgmtHZFsIkwbnFbsDR5hCQWc6_LG_psPzIXyFX8XU`,
   `SHEET_DATA_TAB=` (kosong = coba tab `Data`, lalu tab pertama),
   `GOOGLE_SERVICE_ACCOUNT_JSON=<base64 JSON>`, `SHEETS_MOCK=false`. Restart.
4. Inject: `POST /api/sync/trigger` (atau tunggu cron 5 menit).
   Verifikasi: `GET /api/sync/logs` → `success`,
   `GET /api/cases?limit=1` → data baru, `GET /api/setup/status` → userCount.

## Google Sheets live (bila mau)

1. GCP → Service Account → Keys → JSON → `base64` → `GOOGLE_SERVICE_ACCOUNT_JSON`
2. Share sheet ke service account sebagai Editor
3. `.env`: `SHEETS_MOCK=false`, restart. Cron tiap 5 menit + `POST /api/sync/trigger` manual.

## PDF invoice (Cloudflare R2)

Upload langsung browser → R2 via presigned URL (file tidak transit server).
Tanpa kredensial R2, endpoint tulis balas `R2_NOT_CONFIGURED` (503).

1. R2 → bucket (mis. `pdf-storage`) → API token (baca+tulis bucket ini).
2. CORS bucket (wajib untuk PUT langsung dari browser):
   `AllowedOrigins: [<domain deploy>, http://localhost:5173]`,
   `AllowedMethods: [PUT, GET, DELETE, HEAD]`, `AllowedHeaders: [*]`.
3. `.env` (server saja, jangan commit):
   `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`,
   `R2_MAX_MB=10`, `PDF_STUCK_MINUTES=30`. Restart backend.
4. Alur per file: `POST /api/pdf/upload-url {recordUuid,filename,sizeBytes}`
   → PUT ke `url` (maks 10 MB, 5 menit) → `POST /api/pdf/confirm {id}`
   (cek HEAD + magic bytes `%PDF-`) → `completed`.
5. Baca/hapus: `GET /api/pdf/by-case/:uuid`,
   `GET /api/pdf/state/:uuid` → `{total, completed, pending, canDownload, canDelete, canUpload}`
   (kondisi gate tombol; `canUpload` false bila sudah ada file `completed`),
   `GET /api/pdf/:id/download-url` (presigned GET 5 menit, attachment;
   tambah `?inline=1` untuk disposition inline → tampil di iframe pratinjau),
   `DELETE /api/pdf/:id`. Tulis dijaga modul `finance` (PermGuard).
   `GET /api/pdf/history/:uuid` → riwayat invoice + validasi + PDF per kasus (50 terakhir,
   dari `activity_logs` kategori `Invoice`/`Validasi`: siapa, apa, kapan).
   `GET /api/billing/invoice-map` → peta `{recordUuid: status}` seluruh kasus
   (dipakai frontend menyinkronkan status lokal dengan otomasi backend).
6. **Otomatisasi status invoice** (3 status, tercatat di `activity_logs` kategori `Invoice`):
   `confirm` sukses → `UNPAID` (kecuali sudah `PAID`, tidak diturunkan);
   hapus PDF terakhir → kembali `MENUNGGU INVOICE` (kecuali `PAID`).
    Manual `PATCH /cases/:uuid/invoice` hanya menerima `PAID` dari status `UNPAID`
    dan wajib ≥1 PDF `completed` + `paymentNote` (bukti pembayaran tersimpan di
    `payment_note/paid_at/paid_by`) — `MENUNGGU/UNPAID` manual ditolak
    `422 INVOICE_AUTO_LOCKED`, `PAID` tanpa PDF ditolak `422 INVOICE_NEED_PDF`,
    tanpa notes ditolak `422 PAYMENT_NOTE_REQUIRED`.
6. Cron 10 menit menghapus baris `uploading` macet > 30 menit + baris `failed` yang tua (> 24 jam, beserta objeknya di storage).
7. Frontend: kolom Upload PDF di halaman Finance (`PdfCell`) —
   pilih → progress → daftar/lihat/unduh/hapus per baris kasus.

## Ganti provider storage (R2 <-> Supabase <-> S3 lain)

Backend memakai protokol S3-compatible (`@aws-sdk/client-s3`), jadi pindah
provider = ganti env + CORS, **tanpa ubah kode**. Prosedur (prompt sakti):

1. Buat bucket privat di provider baru (nama boleh sama, mis. `pdf-storage`).
2. Buat access key (scope tulis+baca bucket itu) + catat endpoint S3-nya:
   - R2: `https://<account-id>.r2.cloudflarestorage.com`, `R2_REGION=auto`
   - Supabase: `https://<project-ref>.supabase.co/storage/v1/s3`, `R2_REGION=<region project>`
   - S3/MinIO lain: endpoint masing-masing, `R2_REGION` mengikuti regionnya
3. Pasang CORS bucket: origin = domain deploy + `http://localhost:5173`,
   methods `PUT, GET, DELETE, HEAD`, headers `*`.
4. Isi `.env`: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME`, `R2_REGION`. Restart backend.
5. Uji 1 file: pilih → progress 100% → `confirm` → `completed` →
   unduh sama isinya → hapus. File lama tetap di provider lama
   (migrasi manual bila perlu, key: `invoices/<uuid>/...`).

## Deploy (live, Postgres permanen)

1. Siapkan Postgres + database (contoh lokal: cluster port `5433`, db `sprite_cust`).
2. `.env` produksi (jangan commit):
   `DATABASE_URL=postgresql://user:pass@host:5433/sprite_cust`,
   `BETTER_AUTH_SECRET=<32 char random>`, `BETTER_AUTH_URL=<url backend>`,
   `FRONTEND_URL=<url frontend>`, `SHEET_ID`, `SHEET_DATA_TAB`,
   `GOOGLE_SERVICE_ACCOUNT_JSON=<base64>`, `SHEETS_MOCK=false`.
   Sheet harus di-share ke `client_email` Service Account sebagai Editor.
3. Boot pertama: `SKIP_SEED=true npm run build && SKIP_SEED=true npm start`
   (atau `npm run dev:empty`) → DDL saja, tanpa seed dev.
4. Inject: `POST /api/sync/trigger` → `rows:N`, cek `GET /api/sync/logs`.
5. Buat Super Admin: `POST /api/setup/first-admin {name,email,password}`
   (hanya saat user kosong). Boot normal berikutnya tidak me-seed ulang:
   user dev hanya di-seed saat fresh install (kasus kosong saat boot).

## Skipped (YAGNI) — add when needed

Bulk read status audit/invoice, `role_permissions` table (role masih map di
`AuthContext.jsx`), export server-side, Redis cache, partisi Postgres per bulan.
