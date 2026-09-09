# SPRITE-CUST v2 — Pusat Data Bantuan

Sistem terpadu pengelolaan data kasus support, billing & audit, finance,
HR report, dan konfigurasi sheet. Frontend React memanggil backend NestJS
yang menyimpan data di Postgres (Docker).

```
SPRITE-CUST_v2/
├── frontend/   # React 18 + Vite 5 + Tailwind 3 → http://localhost:5173
├── backend/    # NestJS 10 + Drizzle → http://localhost:5005/api
└── .local/     # Mockup HTML statis (referensi awal)
```

| Lapisan | URL | Keterangan |
| --- | --- | --- |
| Frontend | `http://localhost:5173` | `/api` otomatis di-proxy ke backend |
| Backend | `http://localhost:5005/api` | Health: `/api/health` |
| Postgres | `localhost:5433` | Container `sprite-pg`, database `sprite_cust` |

---

## 1. Yang harus diinstal

| Kebutuhan | Keterangan |
| --- | --- |
| Git | `git --version` |
| Node.js 20+ | `node -v` |
| Docker Desktop | Harus **running** (daemon mati = DB mati) |
| Port bebas | `5173` (frontend), `5005` (backend), `5433` (postgres) |

---

## 2. Clone project dari Git

```powershell
git clone https://github.com/mahendramahruframadhan/SPRITE-CUST_v2
cd SPRITE-CUST_v2
```

---

## 3. Database — buat Postgres di Docker

Backend memakai database `sprite_cust` di container **`sprite-pg`**
(Postgres 16, port host `5433`). Satu kali saja:

```powershell
docker volume create sprite-pgdata
docker run -d --name sprite-pg --restart unless-stopped `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=sprite_cust `
  -p 5433:5432 `
  -v sprite-pgdata:/var/lib/postgresql/data `
  postgres:16-alpine
```

Verifikasi:

```powershell
docker exec sprite-pg pg_isready -U postgres   # → accepting connections
```

> Menjalankan ulang di lain hari cukup: `docker start sprite-pg`.
> Kalau container terhapus, ulangi `docker run` di atas — data aman
> selama volume `sprite-pgdata` tidak dihapus.

### Lihat DB di DBeaver

1. **Database → New Database Connection → PostgreSQL → Next**
2. Host `localhost`, Port `5433`, Database `sprite_cust`,
   Username `postgres`, Password `postgres`
3. **Test Connection** → **Finish**

---

## 4. Backend — install, setup env, jalankan

```powershell
cd backend
npm install --legacy-peer-deps   # wajib ada flag-nya (peer-dep better-auth vs drizzle-kit)
copy .env.example .env           # sudah berisi DATABASE_URL + SHEET_ID yang benar
npm run dev                      # → http://localhost:5005/api/health
```

> `--legacy-peer-deps` wajib — `npm install` biasa gagal
> (`Conflicting peer dependency: drizzle-kit`).

Boot pertama agak lama (±1 menit): backend membuat 11 tabel lalu seed
**2034 kasus + 6 user**. Verifikasi:

```powershell
Invoke-RestMethod http://localhost:5005/api/health
Invoke-RestMethod "http://localhost:5005/api/cases?limit=1"
docker exec sprite-pg psql -U postgres -d sprite_cust -c "\dt"   # harus 11 tabel
```

Isi `backend/.env` (umumnya tak perlu diubah):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/sprite_cust
SHEET_ID=1dJKS7iJ80iK2rV5Jd9D6ap3yATcaUOlj07IcJg74CuY
SHEET_GID_DATA=1535609154
SHEETS_MOCK=true
```

---

## 5. Frontend — install & jalankan

Terminal **baru** (backend tetap jalan):

```powershell
cd frontend
npm install
npm run dev              # → http://localhost:5173
```

`/api` otomatis di-proxy ke backend (lihat `vite.config.js`), jadi tanpa
config tambahan. Kalau backend di host/port lain, buat file `.env`:

```
VITE_API_URL=http://host:5005/api
```

> Path project mengandung `#`? Baca `frontend/NOTE-VITE-PATH.md` dulu.

---

## 6. Login

Buka `http://localhost:5173` → login dengan salah satu akun seed:

| Email | Role | Password |
| --- | --- | --- |
| `admin@revota.id` | Super Admin | `12345` |
| `rani@revota.id` | Super Admin | `password123` |
| `budi.cs@revota.id` | Admin CS | `password123` |
| `sari@revota.id` | Support | `password123` |
| `finance@revota.id` | Finance | `password123` |
| `vina@revota.id` | Viewer | `password123` |

Akun baru bisa daftar di `/signup` (role awal Viewer, password min. 5 karakter),
lalu diatur role-nya di halaman `/roles` oleh Super Admin.

## Hak akses per role

- **Super Admin** selalu punya semua akses (dikunci di backend, tak bisa dicabut).
- Role lain mengikuti **matriks izin di halaman `/roles`** (tab Role & Izin Modul)
  — menu yang tak diizinkan hilang otomatis, URL langsung ditolak, dan
  API tulis mengembalikan `403` tanpa izin.
- Mengubah matriks tersimpan di DB (`role_permissions`) dan berlaku
  untuk semua user role tersebut saat itu juga.
- Endpoint **baca** (`GET`) sengaja terbuka; yang dijaga izin hanya
  endpoint **tulis** (`POST/PATCH/PUT/DELETE`).

---

## 7. Google Sheets — mode mock vs live

Sheet sumber (sudah terkonfigurasi, tak perlu diubah):

- Doc: `https://docs.google.com/spreadsheets/d/1dJKS7iJ80iK2rV5Jd9D6ap3yATcaUOlj07IcJg74CuY/edit?gid=1535609154`
- `SHEET_ID=1dJKS7iJ80iK2rV5Jd9D6ap3yATcaUOlj07IcJg74CuY`, tab Data `GID=1535609154`

Secara default backend jalan dalam **mode MOCK** (`SHEETS_MOCK=true`):
data berasal dari DB/seed dan tombol **Sinkron & Muat Ulang tidak membaca
Sheet asli** (hasilnya selalu "0 baris tersinkron", dan di Dashboard muncul
peringatan kuning *"Mode mock"*). Untuk membaca Sheet asli, ikuti tahap live
di bawah — **gratis**, kuota gratis Sheets API jauh di atas kebutuhan
(cron 5 menit + klik manual), tanpa kartu kredit.

### Tahap 1 — Buat Service Account di Google Cloud

1. Buka `console.cloud.google.com` → buat **Project baru** (mis. `sprite-sync`).
2. **APIs & Services → Library** → cari **Google Sheets API** → **Enable**.
3. **IAM & Admin → Service Accounts** → **Create Service Account** →
   isi nama (mis. `sprite-sync`) → Create (role boleh dikosongkan).
4. Klik service account → tab **Keys** → **Add Key → Create new key → JSON**
   → file `.json` terdownload.

### Tahap 2 — Share Sheet ke service account

5. Buka file JSON → catat `client_email`
   (bentuknya `xxx@yyy.iam.gserviceaccount.com`).
6. Buka Google Sheet → **Share** → paste email itu → akses **Viewer** → Share.

### Tahap 3 — Pasang ke backend

7. Encode JSON ke base64 (PowerShell, sesuaikan path):

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\ke\key.json"))
   ```

   Hasilnya satu baris panjang — copy semuanya.
8. Isi `backend/.env`:

   ```
   GOOGLE_SERVICE_ACCOUNT_JSON=<hasil base64 tadi>
   SHEETS_MOCK=false
   ```

9. **Restart backend**, buka Dashboard → klik **Sinkron & Muat Ulang** →
   notifikasi harusnya "N baris tersinkron" (N > 0) dan peringatan mode
   mock hilang. Alurnya: Spreadsheet → **upsert** ke DB (baris baru
   di-insert, baris lama yang sama di-update) → layar dimuat ulang.
   Sync berjalan **incremental**: hanya baris baru/berubah yang ditulis
   (deteksi hash), sisanya dilewati — sync kedua dan seterusnya jauh
   lebih cepat. Tombol menolak halus bila ada sync lain sedang berjalan.

### Syarat baris Sheet (penting)

- Setiap baris **wajib mengisi kolom `recordUuid`** (unik, mis. UUID acak) —
  baris tanpanya otomatis dilewati backend.
- Kolom mengikuti urutan header di `backend/src/sheets/sheets.service.ts`
  (`no, dateIssue, startDate, ...`); kolom tambahan di luar itu diabaikan.
- Format tanggal `dateIssue`: `yyyyMMdd` (mis. `20250909`).

### Cek cepat bila sync 0 baris

```powershell
Invoke-RestMethod http://localhost:5005/api/health          # sheetsMock harus false
Invoke-RestMethod http://localhost:5005/api/sync/logs | Select-Object -First 1  # rows_processed > 0?
```

---

## 8. Alur data

- Semua halaman baca kasus via `GET /api/cases` (hook `useCases`, cache 1x).
- Validasi billing (`/billing`) → `PATCH /api/cases/:uuid/audit`.
- Status invoice (`/finance`) → `PATCH /api/cases/:uuid/invoice`.
- Form kasus (`/form`) → master dari `GET /api/masters`, simpan via `POST /api/cases`.
- Konfigurasi (`/cfg`) → `GET/PUT /api/config` (DB, fallback file lokal).
- Semua request frontend menyertakan header `x-user-email` untuk cek izin backend.

---

## 9. Troubleshooting

| Gejala | Solusi |
| --- | --- |
| `failed to connect to the docker API` | Start **Docker Desktop**, lalu `docker start sprite-pg` |
| `npm install` backend gagal (`eresolve`) | Pakai `npm install --legacy-peer-deps` |
| Frontend: "Backend tidak terjangkau" | Backend belum jalan / masih seeding → `cd backend; npm run dev`, tunggu ±1 menit |
| Login "Email atau password salah" padahal benar | Pastikan seed selesai; user seed ada 6 (lihat tabel login). Cek `SELECT email FROM "user"` di DB |
| `GET /api/roles/permissions` 403 di console | Sudah fix (guard hanya untuk method tulis). Restart backend bila masih muncul dari kode lama |
| Boot backend lama / tabel kosong | Tunggu seed selesai; cek `docker exec sprite-pg psql -U postgres -d sprite_cust -c "\dt"` (harus 11 tabel) |
| Port bentrok (`5433`/`5005`/`5173` dipakai) | `netstat -ano \| Select-String "5433"` → `taskkill /PID <id> /F`, atau sesuaikan port |
| DB rusak / mau mulai dari nol | `docker rm -f sprite-pg; docker volume rm sprite-pgdata` lalu ulangi langkah 3 + restart backend (seed ulang otomatis) |
| Sync "0 baris tersinkron" terus | Backend masih mode mock → ikuti Tahap 1–3 bagian 7 (`sheetsMock` harus `false`) |
| Sync gagal / baris baru tak masuk | Pastikan sheet di-share ke service account + tiap baris ada `recordUuid` + format tanggal `yyyyMMdd` |

## Dokumentasi lanjutan

- [`backend/README.md`](backend/README.md) — API, env, dan Google Sheets live.
- [`frontend/README.md`](frontend/README.md) — struktur, route, lapisan API.
- `.local/pusat-data-bantuan-PRD.md` — Product Requirements Document.
