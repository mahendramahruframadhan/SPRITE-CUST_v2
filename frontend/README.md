# Pusat Data Bantuan — Frontend (React + Vite)

Porting dari mockup HTML di `.local/` ke React.js dengan best practice.
Backend (NestJS) **belum** dibuat — auth, data kasus, master, dan konfigurasi
masih memakai mock/localStorage, siap diganti API NestJS nanti.

## Tech Stack

- **React 18** + **Vite 5**
- **React Router v6** — route terpisah per modul
- **Tailwind CSS 3** (konfigurasi terpisah: `tailwind.config.js`, `postcss.config.js`, style kustom di `src/styles/index.css`)
- **Chart.js 4** via `react-chartjs-2`

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # produksi ke dist/
```

## Struktur

```
frontend/
├── index.html
├── vite.config.js
├── tailwind.config.js          # warna brand, font Inter, animasi fade-in
├── postcss.config.js
└── src/
    ├── main.jsx
    ├── App.jsx                 # definisi semua route
    ├── styles/index.css        # @tailwind + komponen kustom (scrollbar, shell-nav)
    ├── config/modules.js       # konfigurasi menu/sidebar modul
    ├── context/AuthContext.jsx # auth mock (ganti API NestJS nanti)
    ├── hooks/useAuditState.js  # status validasi billing ↔ finance (localStorage)
    ├── utils/format.js         # fmtDate8, fmtMoney, statusMeta, dll
    ├── data/
    │   ├── cases.js            # 2036 data kasus (dulu data-cases.js)
    │   ├── masters.js          # master data & price list (dulu tertanam di main-support)
    │   └── sheetConfig.js      # DEFAULT_CONFIG konfigurasi sheet
    ├── components/
    │   ├── AppLayout.jsx       # shell: sidebar, header, auth guard, redirect legacy
    │   └── Icon.jsx            # ikon SVG modul
    └── pages/                  # satu file per route
        ├── LoginPage.jsx           # /login
        ├── DashboardPage.jsx       # /dashboard
        ├── DataKasusPage.jsx       # /kasus (detail: semua kolom, scroll kiri→kanan)
        ├── MockupPage.jsx          # /mockup
        ├── FormKasusPage.jsx       # /form
        ├── HrReportPage.jsx        # /hrreport
        ├── SheetConfigPage.jsx     # /cfg (master & pricelist lama diarahkan ke sini)
        ├── BillingPage.jsx         # /billing
        ├── FinanceAuditPage.jsx    # /finance
        └── RolesPage.jsx           # /roles
```

## Route

| Path | Halaman |
| --- | --- |
| `/login` | Login (mock, 5 akun demo) |
| `/dashboard` | Dashboard (Chart.js) |
| `/kasus` | Data Kasus — filter, paginasi, export CSV, detail semua kolom horizontal |
| `/mockup` | Dashboard Mockup |
| `/form` | Form Kasus (dropdown master data + preview JSON) |
| `/hrreport` | HR Report |
| `/cfg` | Konfigurasi Sheet (9 tab, tersimpan di localStorage) |
| `/billing` | Billing & Audit (status validasi) |
| `/finance` | Finance Audit (status invoice) |
| `/roles` | Hak Akses & Role |
| `/master`, `/pricelist` | → redirect ke `/cfg` |

## Catatan untuk integrasi NestJS nanti

- `AuthContext.jsx` → ganti `login()` dengan `POST /auth/login` (JWT).
- `src/data/*.js` → ganti dengan `fetch` ke endpoint NestJS (kasus, master, config).
- `useAuditState.js` (billing) & `caseInvoiceStatus` (finance) → pindah ke tabel database.
- Konfigurasi sheet sudah punya tombol **Export JSON (Backend)** di halaman `/cfg`.
