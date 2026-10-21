# Pusat Data Bantuan — Frontend (React + Vite)

Terintegrasi penuh dengan backend NestJS (`http://localhost:5005/api`).
Semua halaman baca/tulis via API — file `src/data/*.js` tinggal sebagai
fallback offline + sumber seed backend.

## Tech Stack

- **React 18** + **Vite 5** + **React Router v6**
- **Tailwind CSS 3**, **Chart.js 4** via `react-chartjs-2`
- **motion** (animasi shell + reveal section)
- Tanpa HTTP lib tambahan — `fetch` biasa via `src/lib/api.js`

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173 — /api di-proxy ke :5005
npm run build    # produksi ke dist/
```

Backend di host/port lain? Buat `.env` (lihat `.env.example`):

```
VITE_API_URL=http://host:5005/api
```

## Lapisan API

```
src/lib/api.js       # API_BASE, fetchAllCases (paginasi+cache), masters,
                     # config, createCase, patchAudit/Invoice, auth, sync
src/hooks/useCases.js # { cases, loading, error, reload } — dipakai 6 halaman
```

## Struktur

```
frontend/
├── vite.config.js                # proxy /api → http://localhost:5005
└── src/
    ├── main.jsx / App.jsx        # definisi semua route
    ├── components/AppLayout.jsx  # AppShell: sidebar collapsible + drawer swipe + topbar
    ├── components/DataTable.jsx  # Pill/Dot/EmptyRow/LoadingRow (primitif tabel bersama)
    ├── styles/tokens.css         # token 3 lapis + token motion shell
    ├── styles/index.css          # .page/.stat-grid/.panel-grid/.skeleton + guard fokus & reduced-motion
    ├── context/AuthContext.jsx   # login via POST /api/auth/sign-in/email
    ├── hooks/useAuditState.js    # status validasi → PATCH audit (localStorage = cache)
    ├── pages/
    │   ├── LoginPage.jsx             # /login (5 akun demo, password password123)
    │   ├── DashboardPage.jsx         # /dashboard
    │   ├── DataKasusPage.jsx         # /kasus (filter, paginasi, CSV, modal detail)
    │   ├── MockupPage.jsx            # /mockup
    │   ├── FormKasusPage.jsx         # /form (master API + POST /api/cases)
    │   ├── HrReportPage.jsx          # /hrreport
    │   ├── SheetConfigPage.jsx       # /cfg (GET/PUT /api/config, autosave debounce)
    │   ├── BillingPage.jsx           # /billing (PATCH audit)
    │   ├── FinanceAuditPage.jsx      # /finance (PATCH invoice)
    │   ├── FollowupsPage.jsx         # /followups (modul Client Follow-Up Reminder)
    │   └── RolesPage.jsx             # /roles (endpoint backend: users, permissions, logs)
    └── data/                     # fallback offline (cases, masters, sheetConfig)
```

## Route

| Path | Halaman | Sumber data |
| --- | --- | --- |
| `/login` | Login | `POST /api/auth/sign-in/email` |
| `/signup` | Daftar akun (role Viewer) | `POST /api/auth/sign-up/email` |
| `/dashboard` | Dashboard | `GET /api/cases` |
| `/kasus` | Data Kasus | `GET /api/cases` |
| `/mockup` | Dashboard Mockup | `GET /api/cases` |
| `/form` | Form Kasus | `GET /api/masters` + `POST /api/cases` |
| `/hrreport` | HR Report | `GET /api/cases` |
| `/cfg` | Konfigurasi Sheet | `GET/PUT /api/config` |
| `/billing` | Billing & Audit | `GET /api/cases` + `PATCH …/audit` |
| `/finance` | Finance Audit | `GET /api/cases` + `PATCH …/invoice` |
| `/followups` | Client Follow-Up | `GET/POST/PATCH/DELETE /api/followups*, notes, export CSV` (offline: localStorage) |
| `/roles` | Hak Akses & Role | `GET/PATCH/DELETE /users`, `POST /users/:id/password`, `GET/PUT /roles/permissions`, `GET/POST /roles/logs` |
| `/settings` | Pengaturan (tab Akun/Tampilan/Master/Akses/Hak Akses/Logs/Sesi) | `GET/PATCH /users`, `POST /users/:id/password`, `GET/PUT /status-options` |
| `/logs` | Logs Aktivitas | `GET /api/logs` + aktivitas lokal |

## Client Follow-Up Reminder (2026-10-21)

Halaman `/followups` — modul pengingat follow-up issue client
(PRD + desain: `feature_client_followup_clientfrindly.html`).

- **Sumber data:** API `/api/followups` via `hooks/useFollowups.js`
  (server utama; saat offline → cache localStorage + banner "Coba lagi").
- **Komponen:** `components/followups/FollowupFormModal.jsx` (tambah/ubah,
  datalist client dari modal, autocomplete modul dari nilai sebelumnya),
  `FollowupDetailModal.jsx` (detail + ganti status cepat + riwayat catatan).
- **Aturan tampil:** baris overdue merah "Overdue N hari" (status ≠ Selesai dan
  tanggal follow-up < hari ini, zona Asia/Jakarta dari server); status
  Selesai mengisi tanggal penyelesaian otomatis; ganti status selalu tercatat
  sebagai catatan riwayat.
- **Ekspor CSV:** via `GET /api/followups/export` (server); gagal jaringan →
  builder lokal `lib/followupsExport.js`.
- **Izin:** modul `followups` di matriks `/roles` (default Super Admin & Admin CS).
- **Tab Kanban** (`components/followups/FollowupKanban.jsx`, adaptasi prototipe
  Trello dari owner): 4 kolom status, drag kartu antar kolom = ganti status
  (lewat hook yang sama: riwayat catatan + `resolved_at` otomatis; di layar
  sentuh, ganti status lewat modal detail), urutan kartu overdue dulu lalu
  tanggal follow-up, kolom Selesai hanya 30 hari terakhir. Kartu: badge
  prioritas (Urgent/rose, Tinggi/orange, Sedang/amber, Rendah/emerald, pill
  pastel+border STATUS_PILL), chip follow-up semantik (telat=merah, hari
  ini=amber, selesai=emerald, default netral), tag modul/client netral,
  avatar inisial PIC. **Mode layar penuh** (permintaan owner: tanpa judul/
  filter/tambah): `createPortal` fixed `z-[45]` di atas AppLayout (header
  z-30, sidebar z-40, modal z-50), ganti ke gaya kontainer `.page`
  (max-w-1440, px-4/6/8, py-5), keluar lewat ikon kembali atau Escape
  (abaikan saat modal terbuka; fokus awal ke ikon kembali). Di tampilan
  dalam tab, papan memakai baris filter client/modul + tombol "Tambah
  Issue" (prop `bare=false`); layar penuh menyembunyikan keduanya
  (`bare=true`, permintaan owner).
- **Tab Report** (`components/followups/FollowupsReport.jsx`): dihitung
  murni dari data yang sudah dimuat (tanpa endpoint baru): chip periode
  7/30/90/Semua (basis = tanggal issue), sebaran status
  (bar bertumpuk + chip), tren masuk vs selesai (masuk = tanggal issue,
  selesai = `resolved_at`; bucket harian/mingguan maks 12), rata-rata hari
  penyelesaian, per client/modul (bar merah = bagian overdue), dan aging
  keterlambatan (1–7/8–14/15–30/31+ hari). Semua kartu bisa diklik untuk
  drill-down ke tab Daftar dengan filter terpasang (client/modul/status,
  termasuk view "Overdue"). Angka hanya dari data nyata (`items`).

## Revamp Frontend (Tahap 1–4, 2026-09)

Seluruh frontend dirombak bertahap per halaman (logic & data tidak disentuh).
Arah desain: `DESIGN.md` (brand ungu Revota, dial ENERGY 2 / RHYTHM 2 / MOTION 2);
filter antislop dipakai DURING + Delivery Gate tiap tahap.

| Tahap | Isi | Status |
| --- | --- | --- |
| 1. Audit & Planning | Inventaris 14 route, temuan responsivitas, urutan kerja | ✅ |
| 2. Foundation | AppShell (sidebar `w-64↔w-20` + drawer swipe + persist), `.page/.stat-grid/.panel-grid`, token motion, dep `motion` | ✅ |
| 3.1 Dashboard | Grid bertahap, Reveal per grup, tabel + varian kartu mobile | ✅ |
| 3.2 Data Kasus | Filter `1→2→3→5`, tabel + kartu mobile, pagination 44px | ✅ |
| 3.3 Form Kasus | Judul grup section, grid bertahap, autofill jadi `<button>`, status simpan | ✅ |
| 3.4 Client & Brand | Grid `md:2`, Reveal, input 44px | ✅ |
| 3.5 HR Report | Kolom Assign To sticky, kontrol 44px, Reveal | ✅ |
| 3.6 Konfigurasi Sheet | Reveal per tab (`key=tab`), tabel scroll-wrapper, hapus 44px, toggle hit-area | ✅ |
| 3.7 Billing & Audit | Hero crossfade utuh, Reveal, filter/pagination/modal 44px | ✅ |
| 3.8 Finance Audit | Alur dark, filter full-width HP, Reveal | ✅ |
| 3.9 Pengaturan + Logs | Dark fix 3 kartu + badge role, pil 44px, pagination 44px | ✅ |
| 3.10 Hak Akses | Stat tanpa delay, tab geser, tabel + matriks scroll, modal dark fix | ✅ |
| 3.11 Mockup + Login + SignUp | Baris keyboard-able, banner dark, stepper ringkas di HP | ✅ |
| 4. Polish | `LoadingRow` skeleton di 6 tabel, guard reduced-motion, jaring fokus global | ✅ |

Pola yang dipakai di tiap halaman (contoh di `DashboardPage.jsx`):

- `Reveal` — `motion.div` whileInView sekali (`viewport once`), tanpa cascade delay.
- `LoadingRow` (dari `DataTable.jsx`) saat `loading`, `EmptyRow` hanya bila benar kosong.
- Varian kartu `md:hidden` untuk tabel utama + tabel `hidden md:block`.
- Kontrol sentuh `min-h-[44px]`; pengecualian mikro yang tercatat: tombol × chip (32px),
  checkbox matriks (24px), tombol inline dalam baris tabel, pil demo login.

Cara cek acceptance: tiap halaman di HP + tablet + desktop, dark mode,
keyboard Tab/Escape, dan `prefers-reduced-motion` bila sempat.
