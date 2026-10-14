# Design: Backend Analitik (overview + drilldown Brand/Module)

Tanggal: 2026-10-14
Status: approved per-section (chat 2026-10-14), menunggu review file ini
Scope: `GET /analytics/overview` + `GET /analytics/drilldown`, frontend `AnalyticsPage.jsx` pakai backend baru
Non-goal: export Excel/PDF, YoY/MoM, cache/cron, ubah halaman lain

## 1. Latar & temuan

- `frontend/src/pages/AnalyticsPage.jsx:22` — "Read-only, tanpa backend baru".
- Agregasi 100% di browser: `useRangedCases(from,to)` → `fetchCasesRange` (`frontend/src/lib/api.js:102-114`)
  → `GET /cases?page&limit&from&to` (N halaman paralel, limit 100) + `getAuditMap/getInvoiceMap` (`billing.controller.ts:23,47`)
  + `taxMap` (`billing.controller.ts:60-76`) → `buildMonthlyTrend` (`lib/analyticsSummary.js:22-44`)
  + `buildReportSummary` (`lib/reportSummary.js:38-70`).
- Backend `cases.controller.ts:13-26` hanya punya `list`, `stats/summary`, `group-kpis`. Tidak ada `/analytics`.
- Masalah yang disepakati: fitur baru drill-down + filter Brand/Module tidak scalable bila harus unduh semua rows.

## 2. Arsitektur

- Modul baru `backend/src/analytics/`:
  - `analytics.controller.ts` — 2x GET, `SessionGuard` + `PermGuard`.
  - `analytics.service.ts` — raw SQL parametrized (`$n`, pola `cases.service.ts:findAll:24-53`).
  - Daftarkan di `app.module.ts`. Tidak ubah `cases`/`billing` existing.
- Kontrak:
  - `GET /analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD`
    → `{ kpis: {count, charges, ppn, subtotal, paid:{count,subtotal}, outstanding:{count,subtotal}, pphCount}, trend: [{key,label,count,charges,ppn,subtotal}], byInvoice: {STATUS:{count,charges,ppn,subtotal}}, byBrand: [{brand,count,subtotal}], byModule: [{module,count,subtotal}] }`
  - `GET /analytics/drilldown?dim=brand|module&key=NAMA&from&to&q&page&limit`
    → `{ data: [row camelCase sama seperti /cases], total, page, limit, totalPages, subtotal }`
- Frontend `AnalyticsPage.jsx`:
  - Tambah `fetchAnalyticsOverview/fetchAnalyticsDrilldown` di `lib/api.js`.
  - `trend/distData/kpis/kolektibilitas` dari `/overview`; tabel detail dari `/drilldown` (server-side `q/page/limit`).
  - Hapus di halaman ini saja: `useRangedCases`, `buildMonthlyTrend`, `buildReportSummary`, `getAuditMap/getInvoiceMap` sync.
    Lib lama tetap untuk halaman lain. Hapus komentar `tanpa backend baru`.
  - Skeleton/loading, banner error, paginasi, varian kartu HP tidak berubah.

## 3. Logika agregasi SQL (sama persis dengan frontend)

- Pool: `billing_status` normalisasi `replace(spasi/dash).upper IN ('ONCALL','MONTHLY')` (ikut `isTaxableRow` `taxSummary.js:109-112`
  + `isMonthly` `reportSummary.js:15-18`) + `JOIN audit_status WHERE action='VALID - SIAP INVOICE'`. FREE dikecualikan.
- JOIN: `assistance_records r LEFT JOIN audit_status a USING(record_uuid) LEFT JOIN invoice_status i USING(record_uuid) LEFT JOIN case_tax t USING(record_uuid)`.
- Filter tanggal: `WHERE date_issue BETWEEN from AND to` (`YYYYMMDD`, strip `-`, ikut `cases.service.ts:41-42`).
- PPN per baris (port `taxSummary.js:23-27,68-73`): hanya ON-CALL;
  `ppn_mode='percent'` → `ROUND(charges*ppn_percent/100)` (`amountFromPercent`);
  `'rupiah'` → `ppn_amount`; else 0. `subtotal = charges + ppn` (`computeSubtotal`).
  MONTHLY kontribusi PPN 0. PPh hanya `COUNT WHERE pph=1`, tanpa potongan rupiah.
- Invoice: `COALESCE(i.status,'MENUNGGU INVOICE')`; `paid` = `PAID`, `outstanding` = bukan PAID.
- `byBrand GROUP BY client`, `byModule GROUP BY module`: `COUNT`, `SUM(charges)`, `SUM(ppn per rumus)`.
- `trend`: grup bulan dari `date_issue YYYYMMDD → YYYY-MM` (ikut `monthKeyOf` `analyticsSummary.js:14-19`), label ID (`monthKeyToLabel`).
- Search drilldown: `lower(client||' '||issue||' '||coalesce(pic_name,'')) LIKE $n` (ikut `findAll:43-46`).
- Semua filter sebagai parameter `$n`; `page/limit` clamp max 100.

## 4. Guard, error, performa

- `SessionGuard` selalu → 401 tanpa `x-auth-token` + redirect login sekali (pola `api.js:28-44`).
- `PermGuard('analytics')`; bila key belum ada di matriks `/roles`, fallback sementara `Perm('finance')` agar tidak 403 massal.
  Menu hilang otomatis bila tak diizinkan.
- Validasi: `from/to YYYY-MM-DD`, `from>to` → 422 `ANALYTICS_INVALID_RANGE` (ganti `invalidRange` client);
  `dim` hanya `brand|module` → else 422 `ANALYTICS_INVALID_DIM`.
- Error bentuk `{code,message}` konsisten dengan backend (`SESSION_EXPIRED`, `ANALYTICS_*`).
- Performa: overview 1x agregasi + drilldown paginated; tanpa `fetchAllCases` N-paralel untuk halaman ini. Target <500ms / 2k rows lokal. Tanpa tabel/cache baru tahap ini.

## 5. Testing

- Unit backend: pool VALID (ON-CALL+MONTHLY saja), PPN percent vs rupiah, MONTHLY PPN=0, PPh flag, byBrand/byModule sum, range invalid.
- Manual e2e: login `admin@revota.id` → `/analytics` bandingkan tren/KPI vs versi lama (periode 6 bulan);
  klik Brand/Module → drilldown rows + subtotal benar; search + paginasi server-side;
  tanpa token → 401; tanpa izin → 403/menu hilang; `from>to` → 422.
- Regression: halaman lain (`/report`, `/billing`, `/finance`) tidak berubah karena lib lama tidak dihapus.

## 6. Backlog (di luar scope)

Export Excel/PDF, perbandingan YoY/MoM, top-N/ranking/insight otomatis, rollup cron `analytics_monthly`.

## Self-review

- [x] Tanpa placeholder/TBD; semua referensi file:line terverifikasi baca langsung.
- [x] Konsisten: pool/PPN/invoice/guard sama di semua section; tidak kontradiksi dengan `cases`/`billing` existing.
- [x] Scope tunggal: 2 endpoint + 1 halaman; tidak merembet ke report/billing/finance.
- [x] Tidak ambigu: rumus PPN, JOIN, guard fallback, dan non-goal eksplisit.
