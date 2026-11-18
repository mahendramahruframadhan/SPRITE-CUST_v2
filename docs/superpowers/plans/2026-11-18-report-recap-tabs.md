# Report Summary 10 Tab Rekap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah 10 tab rekap ringkas (kartu KPI + tabel + CSV/print) di `/report` lewat satu endpoint read-only `GET /analytics/recap`.

**Architecture:** `RecapService` menghitung semua tab dari satu query rentang kasus (via `AnalyticsService.getRangeRows`) plus query tabel pendukung. Frontend menambah tab bar, panel generik dari konfigurasi `recapTabs.js`, dan ekspor CSV per tab.

**Tech Stack:** NestJS + pg-mem/Postgres, React 18 + Vite + Tailwind, node:test, vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-report-recap-tabs-design.md`

## Global Constraints

- Read-only: tidak ada INSERT/UPDATE/DELETE baru.
- Tidak ada perubahan skema DB.
- Uang hanya ON-CALL; PPN mengikuti `ppnOf`; PPh info saja.
- Normalisasi billing/user mengikuti helper `AnalyticsService`.
- Tanpa emoji di UI; tanpa chart/library baru; antislop DURING.
- CSV memakai `escapeCsvFormula`.
- Jangan commit file untracked lain (`docs/RECAP-MENU-IDEAS.md`, dokumen 2026-11-13).

## Review Focus

- Rentang tanggal invalid (`from > to`) harus 422, bukan hasil kosong.
- Baris tanpa `billing_status` masuk `LAINNYA` dan terdeteksi Data Quality.
- `assign_to` kosong jadi `TANPA USER` dan tidak dihitung user aktif.
- Brand beda kapital/spasi harus menyatu untuk kontrak, bukan memecah baris kasus.
- Tab non-periode (kontrak/quality) harus berlabel basis waktu yang benar.

---

### Task 1: Backend — helper bersama + `getRangeRows`

**Files:**
- Modify: `backend/src/analytics/analytics.service.ts`
- Test: `backend/test/analytics.recap.test.ts`

**Interfaces:**
- Produces: `export const VALID_TAG`, `norm`, `isOnCall`, `billingKeyOf`, `billingOf`, `isDone`, `userOf`, `ppnOf`; `AnalyticsService.getRangeRows(from: string, to: string): Promise<any[]>`.

- [ ] **Step 1: Tulis test gagal** — di `analytics.recap.test.ts`, import `AnalyticsService, VALID_TAG, billingOf, userOf`; seed 2 baris pg-mem; assert `getRangeRows` mengembalikan 2 baris, `billingOf('ONCALL') === 'ON-CALL'`, `billingOf('') === 'LAINNYA'`, `userOf(' rama ') === 'RAMA'`, `VALID_TAG === 'VALID - SIAP INVOICE'`.
- [ ] **Step 2: Jalankan test** — `cd backend && node -r ts-node/register/transpile-only --test test/analytics.recap.test.ts`; expected FAIL import/export tidak ada.
- [ ] **Step 3: Implementasi** — ubah deklarasi helper menjadi `export`; tambah method publik `getRangeRows` yang memanggil `this.fetchRows`.
- [ ] **Step 4: Jalankan test** — expected PASS.
- [ ] **Step 5: Commit** — `git add backend/src/analytics/analytics.service.ts backend/test/analytics.recap.test.ts && git commit -m "♻️ refactor(analytics): ekspor helper rekap dan getRangeRows"`.

---

### Task 2: Backend — `RecapService` tab berbasis kasus

**Files:**
- Create: `backend/src/analytics/recap.service.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/analytics.recap.test.ts`

**Interfaces:**
- Consumes: `AnalyticsService.getRangeRows`, helper Task 1.
- Produces: `RecapService.getRecap(from: string, to: string, opts?: { brand?: string; module?: string }): Promise<{ period; generatedAt; basis; tabs }>` dengan tab `workload`, `brands`, `billing`, `audit`, `modules`, `sla` minimal berisi `{ kpis, rows }`.

- [ ] **Step 1: Tulis test gagal** — seed 6 kasus (ON-CALL/MONTHLY/FREE/kosong, validasi campuran, invoice PAID/terbit, user `Rama`/`RAMA`/kosong, tanggal valid). Assert:
  - `tabs.workload.kpis.total === 6`, `activeUsers` tidak menghitung `TANPA USER`;
  - `tabs.billing.kpis.subtotal > 0` hanya dari ON-CALL tervalidasi;
  - `tabs.audit.kpis.validated` dan `paid` sesuai seed;
  - `tabs.modules.rows[0].module` sesuai module terbanyak.
- [ ] **Step 2: Jalankan test** — expected FAIL `RecapService` belum ada.
- [ ] **Step 3: Implementasi** — buat `RecapService`; satu pass agregasi `enriched`; helper `money`, `pct`, `sortRows`; hitung 6 tab; daftarkan provider di `app.module.ts`.
- [ ] **Step 4: Jalankan test** — expected PASS.
- [ ] **Step 5: Commit** — `git add backend/src/analytics/recap.service.ts backend/src/app.module.ts backend/test/analytics.recap.test.ts && git commit -m "✨ feat(analytics): service rekap beban kerja, brand, billing, audit, modul, SLA"`.

---

### Task 3: Backend — tab POPI NAVA, kontrak, aktivitas, quality + route

**Files:**
- Modify: `backend/src/analytics/recap.service.ts`
- Modify: `backend/src/analytics/analytics.controller.ts`
- Modify: `backend/test/analytics.recap.test.ts`

**Interfaces:**
- Produces: endpoint `GET /analytics/recap?from&to&brand&module`; tab `popinava`, `contracts`, `activity`, `quality`; controller `recap(@Query() q)`.

- [ ] **Step 1: Tulis test gagal** — seed `brand_statuses`, `popinava_outlets`, `audit_schedule`, `audit_shots`, `followups`, `activity_logs`, `sync_logs`, `clients`, `user`; assert:
  - `contracts.kpis.expired` menghitung kontrak lewat tanggal;
  - `popinava.kpis.outlets` dan `pending` benar;
  - `activity.kpis.actions` hanya dalam rentang;
  - `quality.rows` berisi 10 pemeriksaan dan mendeteksi billing kosong, ON-CALL tanpa pajak, tanggal invalid, sync failed.
- [ ] **Step 2: Jalankan test** — expected FAIL properti tab belum ada.
- [ ] **Step 3: Implementasi** — query pendukung + agregasi; tambah `@Get('recap')` di controller dengan `checkRange` dan `@Perm('analytics')`.
- [ ] **Step 4: Jalankan test** — expected PASS.
- [ ] **Step 5: Commit** — `git add ... && git commit -m "✨ feat(analytics): endpoint rekap 10 tab report summary"`.

---

### Task 4: Frontend — API, konfigurasi tab, ekspor CSV

**Files:**
- Modify: `frontend/src/lib/api.js`
- Create: `frontend/src/config/recapTabs.js`
- Create: `frontend/src/lib/recapExport.js`
- Test: `frontend/test/recapTabs.test.mjs`, `frontend/test/recapExport.test.mjs`

**Interfaces:**
- Produces: `fetchAnalyticsRecap({from,to,brand,module})`; `RECAP_TABS`, `RECAP_TAB_IDS`, `findRecapTab(id)`; `buildRecapCsv(tab, data, { periode, basis })`, `recapCsvFilename(tabId, to)`.

- [ ] **Step 1: Tulis test gagal** — assert 10 id urut sesuai spec; `findRecapTab('nope') === null`; CSV memuat judul tab, label KPI, label kolom, dan menetralkan nilai `=cmd`.
- [ ] **Step 2: Jalankan test** — `cd frontend && npm test`; expected FAIL modul belum ada.
- [ ] **Step 3: Implementasi** — definisi 10 tab (label, deskripsi, basis, KPI, kolom, empty); builder CSV memakai `escapeCsvFormula`; tambah fetch API.
- [ ] **Step 4: Jalankan test** — expected PASS.
- [ ] **Step 5: Commit** — `git add ... && git commit -m "✨ feat(report): konfigurasi 10 tab rekap dan ekspor CSV"`.

---

### Task 5: Frontend — tab bar, panel, integrasi halaman

**Files:**
- Create: `frontend/src/components/report/RecapTabs.jsx`
- Create: `frontend/src/components/report/RecapPanel.jsx`
- Modify: `frontend/src/pages/ReportSummaryPage.jsx`
- Test: `frontend/test-ui/report-recap.test.jsx`

**Interfaces:**
- Consumes: `RECAP_TABS`, `findRecapTab`, `fetchAnalyticsRecap`, `buildRecapCsv`, `recapCsvFilename`, `printSection`.
- Produces: `RecapTabs({ active, onChange })`, `RecapPanel({ tab, data, loading, error, periode, generatedAt })`.

- [ ] **Step 1: Tulis test gagal** — render `RecapTabs`, klik “Brand 360” → `onChange('brands')`; render `RecapPanel` tab workload dengan data → KPI dan baris user tampil; data kosong → teks empty.
- [ ] **Step 2: Jalankan test** — `cd frontend && npm run test:ui`; expected FAIL komponen belum ada.
- [ ] **Step 3: Implementasi** — komponen tab aksesibel, panel generik, state `?tab=`, fetch sekali per filter, bungkus konten `Ringkasan` lama tanpa mengubah isinya.
- [ ] **Step 4: Jalankan test** — expected PASS.
- [ ] **Step 5: Commit** — `git add ... && git commit -m "✨ feat(report): tab rekap ringkas di report summary"`.

---

### Task 6: Verifikasi penuh + push

- [ ] **Step 1:** `cd backend && npm run typecheck && npm test`
- [ ] **Step 2:** `cd frontend && npm test && npm run test:ui && npm run build`
- [ ] **Step 3:** Cek `git status`, `git diff --stat`; stage hanya file Task 1–5.
- [ ] **Step 4:** `git push origin main`
- [ ] **Step 5:** Laporkan hasil test + URL commit.
