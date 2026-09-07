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

## Yang kamu butuhkan

| Kebutuhan | Keterangan |
| --- | --- |
| Node.js 20+ | `node -v` (repo ini dipakai via nvm) |
| Docker Desktop | Harus **running** (daemon mati = DB mati) |
| Container `asten-pg` | Postgres 16 milikmu yang sudah ada — dipakai bersama, **DB `asten` tidak disentuh** |
| Port bebas | `5173` (frontend), `5005` (backend), `5433` (postgres) |

## Cara menjalankan (urutan penting)

### 1. Database — start Postgres yang sudah ada

```powershell
docker start asten-pg
docker exec asten-pg pg_isready -U postgres   # → accepting connections
```

Database `sprite_cust` sudah dibuat di server yang sama (satu server,
beda database dengan `asten`). Buat ulang kalau hilang:

```powershell
docker exec asten-pg psql -U postgres -c "CREATE DATABASE sprite_cust;"
```

Koneksi yang dipakai backend:

```
postgresql://postgres:postgres@localhost:5433/sprite_cust
```

### 2. Backend

```powershell
cd backend
npm install
copy .env.example .env   # sudah berisi DATABASE_URL postgres di atas
npm run dev              # → http://localhost:5005/api/health
```

Boot pertama agak lama (±1 menit): backend membuat 11 tabel lalu seed
**2034 kasus + 5 user** (`[db] seeded …` di log). Cek:

```powershell
Invoke-RestMethod http://localhost:5005/api/health
Invoke-RestMethod "http://localhost:5005/api/cases?limit=1"
```

### 3. Frontend

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

## Login

| Email | Role | Password |
| --- | --- | --- |
| `rani@revota.id` | Super Admin | `password123` |
| `budi.cs@revota.id` | Admin CS | `password123` |
| `sari@revota.id` | Support | `password123` |
| `finance@revota.id` | Finance | `password123` |
| `vina@revota.id` | Viewer | `password123` |

## Alur data

- Semua halaman baca kasus via `GET /api/cases` (hook `useCases`, cache 1x).
- Validasi billing (`/billing`) → `PATCH /api/cases/:uuid/audit`.
- Status invoice (`/finance`) → `PATCH /api/cases/:uuid/invoice`.
- Form kasus (`/form`) → master dari `GET /api/masters`, simpan via `POST /api/cases`.
- Konfigurasi (`/cfg`) → `GET/PUT /api/config` (DB, fallback file lokal).
- `SHEETS_MOCK=true` = tanpa Google API (sinkron manual: `POST /api/sync/trigger`).

## Troubleshooting

| Gejala | Solusi |
| --- | --- |
| `failed to connect to the docker API` | Start **Docker Desktop**, lalu `docker start asten-pg` |
| Frontend: "Backend tidak terjangkau" | Backend belum jalan → `cd backend; npm run dev` |
| Login "Email atau password salah" padahal benar | Restart backend (pernah ada bug handler auth, sudah fix di `main.ts`) |
| Boot backend lama / tabel kosong | Tunggu seed selesai; cek `docker exec asten-pg psql -U postgres -d sprite_cust -c "\dt"` (harus 11 tabel) |
| Port bentrok (`5433`/`5005`/`5173` dipakai) | `netstat -ano \| Select-String "5433"` → `taskkill /PID <id> /F`, atau sesuaikan port |

## Dokumentasi lanjutan

- [`backend/README.md`](backend/README.md) — API, env, dan Google Sheets live.
- [`frontend/README.md`](frontend/README.md) — struktur, route, lapisan API.
- `.local/pusat-data-bantuan-PRD.md` — Product Requirements Document.
