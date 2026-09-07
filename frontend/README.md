# Pusat Data Bantuan — Frontend (React + Vite)

Terintegrasi penuh dengan backend NestJS (`http://localhost:5005/api`).
Semua halaman baca/tulis via API — file `src/data/*.js` tinggal sebagai
fallback offline + sumber seed backend.

## Tech Stack

- **React 18** + **Vite 5** + **React Router v6**
- **Tailwind CSS 3**, **Chart.js 4** via `react-chartjs-2`
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
    │   └── RolesPage.jsx             # /roles (masih localStorage — tanpa endpoint backend)
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
| `/roles` | Hak Akses & Role | localStorage + `POST /api/auth/sign-up/email` (password user baru) |
