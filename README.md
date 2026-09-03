# SPRITE-CUST v2

Aplikasi **Pusat Data Bantuan** — sistem terpadu untuk pengelolaan data kasus,
billing, finance audit, HR report, dan konfigurasi sheet.

## Struktur Project

```
SRPITE-CUST/
├── frontend/     # Aplikasi utama (React 18 + Vite 5 + Tailwind CSS 3)
│   └── src/
│       ├── components/   # AppLayout, Icon
│       ├── config/       # modules.js
│       ├── context/      # AuthContext
│       ├── data/         # cases, masters, sheetConfig
│       ├── hooks/        # useAuditState
│       ├── pages/        # Dashboard, DataKasus, FormKasus, Billing,
│       │                 # FinanceAudit, HrReport, Roles, SheetConfig,
│       │                 # Login, Mockup
│       ├── styles/       # index.css
│       └── utils/        # format.js
└── .local/       # Mockup HTML statis (versi awal / referensi)
```

## Tech Stack

- **React 18** + **React Router 6**
- **Vite 5** (dev server & build)
- **Tailwind CSS 3** + PostCSS + Autoprefixer
- **Chart.js** + react-chartjs-2 (grafik dashboard)

## Menjalankan Frontend

> ⚠️ **Penting:** Baca dulu [`frontend/NOTE-VITE-PATH.md`](frontend/NOTE-VITE-PATH.md).
> Path asli project mengandung karakter `#` yang merusak URL resolution Vite,
> sehingga dev server dijalankan melalui junction `C:\sprite-cust-link`.

```bash
cd frontend
npm install
npm run dev
```

Buka http://localhost:5173

## Build

```bash
cd frontend
npm run build     # output di frontend/dist
npm run preview   # preview hasil build
```

## Dokumentasi

- [`frontend/NOTE-VITE-PATH.md`](frontend/NOTE-VITE-PATH.md) — penjelasan masalah
  path `#` pada Vite dan solusinya.
- `.local/pusat-data-bantuan-PRD.md` — Product Requirements Document.
