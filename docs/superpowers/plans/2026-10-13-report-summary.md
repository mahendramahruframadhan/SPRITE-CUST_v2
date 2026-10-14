# Report Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman frontend `/report` yang merecap kasus tervalidasi (Billing + Finance) jadi summary manajemen dengan filter periode, cetak/PDF, dan export CSV — tanpa menyentuh backend.

**Architecture:** Frontend-only. Satu fungsi murni `buildReportSummary()` agregasi data dari hook yang sudah ada (`useRangedCases` + `getAuditMap` + `getInvoiceMap` + `useFinanceTax`), satu halaman `ReportSummaryPage.jsx` ikut pola `BillingPage.jsx`/`FinanceAuditPage.jsx`, satu builder CSV ikut pola `billingExport.js`. Wiring menu + izin frontend-only.

**Tech Stack:** React 18 + Vite 5 + Tailwind 3, `fetch` via `src/lib/api.js`, test murni `node --test "test/**/*.test.mjs"`.

**Spec:** `docs/superpowers/specs/2026-10-13-report-summary-design.md`

## Global Constraints

- Backend TIDAK disentuh: tidak ada endpoint, migrasi, enum, atau seed baru (`backend/` off-limits).
- Hitungan wajib konsisten dengan `frontend/src/lib/taxSummary.js`: `subtotal = totalCharges + totalPpn`, PPh hanya count (bukan rupiah).
- Pool hanya `VALID - SIAP INVOICE` + `billingStatus` ON-CALL/MONTHLY; FREE dikecualikan.
- Hero halaman besar `rounded-[28px]` (keputusan DESIGN.md), satu animasi mount per section (`Reveal`, tanpa cascade delay), kontrol sentuh `min-h-[44px]`, dark mode + `prefers-reduced-motion` ikut token existing.
- CSV: escape `"` ganda ikut pola `billingExport.js`, tanpa BOM (keterbatasan Excel yang sama, dicatat).
- Setiap task diakhiri commit terpisah; pesan commit Bahasa Indonesia ringkas ikut gaya repo.

## Review Focus

- Periode `from > to` harus menampilkan pesan kosong yang jelas, bukan tabel nol diam — butuh test di Task 1 + penanganan di Task 3.
- `taxMap` berisi outbox pending (offline): angka report adalah gabungan server+outbox terakhir, bukan murni server — butuh badge "menunggu sinkron" bila `pendingUuids.length > 0` (Task 3).
- User tanpa modul `report` yang membuka `/report` langsung harus kembali ke dashboard, bukan halaman kosong — butuh cek manual + e2e bila ada (Task 4).
- Print harus menyembunyikan sidebar/topbar/tombol dan menampilkan kop periode — butuh cek print-preview manual (Task 3).
- `iconNav('report')` saat ini mengembalikan `'report'` yang belum ada di `PATHS` Icon.jsx — ikon sidebar hilang bila tidak ditambah (Task 4).

---

### Task 1: Fungsi agregasi murni `reportSummary.js` + unit test

**Files:**
- Create: `frontend/src/lib/reportSummary.js`
- Test: `frontend/test/reportSummary.test.mjs`

**Interfaces:**
- Consumes: `sumPpn(rows, taxMap)`, `pphActiveCount(rows, taxMap)`, `computeSubtotal({total, ppn})`, `isTaxableRow(status)` dari `../src/lib/taxSummary.js` (tanda tangan persis seperti di file tersebut).
- Produces: `buildReportSummary(rows, taxMap, invoiceStatus, defaultInvoiceStatus) -> Summary` untuk Task 3. Bentuk `Summary`: `{ count, charges, ppn, subtotal, pphCount, byInvoice: {STATUS: {count, charges, ppn, subtotal}}, byBilling: {'ON-CALL': {...}, 'MONTHLY': {...}}, paid: {...}, outstanding: {...} }` — tiap sub-objek berbentuk `{count, charges, ppn, subtotal}`.

- [ ] **Step 1: Write the failing test**

```js
// frontend/test/reportSummary.test.mjs — ikut gaya taxSummary.test.mjs (node:test + assert)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportSummary } from '../src/lib/reportSummary.js';

test('pool tervalidasi: charges + PPN persen, PPh hanya count', () => {
  const rows = [
    { recordUuid: 'a', charges: 1000000, billingStatus: 'ON-CALL' },
    { recordUuid: 'b', charges: 2000000, billingStatus: 'MONTHLY' },
  ];
  const taxMap = { a: { ppn: { enabled: true, mode: 'percent', percent: 11, amount: 0 }, pph: true } };
  const s = buildReportSummary(rows, taxMap, {}, 'MENUNGGU INVOICE');
  assert.equal(s.charges, 3000000);
  assert.equal(s.ppn, 110000);
  assert.equal(s.subtotal, 3110000);
  assert.equal(s.pphCount, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "test/reportSummary.test.mjs"` dari `frontend/`
Expected: FAIL (`reportSummary.js` belum ada)

- [ ] **Step 3: Implement `buildReportSummary(rows, taxMap, invoiceStatus, defaultInvoiceStatus)` di `frontend/src/lib/reportSummary.js`**

Fungsi murni tanpa React: filter `rows` ke pool (`billingStatus` ON-CALL/MONTHLY — bandingkan via `isTaxableRow` untuk ON-CALL, samakan normalisasi untuk MONTHLY — dan bukan FREE), hitung `charges`/`ppn`/`subtotal`/`pphCount` via helper `taxSummary.js`, pecah `byInvoice` per status invoice (`invoiceStatus[uuid] || defaultInvoiceStatus`), pecah `byBilling` ON-CALL vs MONTHLY, turunkan `paid` (status PAID) dan `outstanding` (selain PAID). Tambah test untuk: PPN rupiah, MONTHLY PPN 0, FREE dikecualikan, pecahan PAID vs outstanding, `from > to` → pool kosong menghasilkan semua nol.

- [ ] **Step 4: Run full unit tests**

Run: `npm test` dari `frontend/`
Expected: PASS semua (termasuk 24 test `taxSummary` existing + test baru)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/reportSummary.js frontend/test/reportSummary.test.mjs
git commit -m "feat: agregasi report summary tervalidasi + unit test"
```

### Task 2: Builder CSV `reportExport.js` + unit test

**Files:**
- Create: `frontend/src/lib/reportExport.js`
- Test: `frontend/test/reportExport.test.mjs`

**Interfaces:**
- Consumes: tipe `Summary` dari Task 1 (import tipe saja, tanpa dependensi runtime ke halaman).
- Produces: `buildReportCsv(summary, { periode }) -> string` dan `reportCsvFilename(periode) -> string` untuk Task 3.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportCsv } from '../src/lib/reportExport.js';

test('csv memuat kop periode + baris TOTAL per status invoice', () => {
  const summary = { count: 1, charges: 1000000, ppn: 110000, subtotal: 1110000, pphCount: 0,
    byInvoice: { PAID: { count: 1, charges: 1000000, ppn: 110000, subtotal: 1110000 } },
    byBilling: {}, paid: {}, outstanding: {} };
  const csv = buildReportCsv(summary, { periode: '2026-10-01 s.d. 2026-10-31' });
  assert.match(csv, /2026-10-01 s\.d\. 2026-10-31/);
  assert.match(csv, /PAID/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "test/reportExport.test.mjs"` dari `frontend/`
Expected: FAIL

- [ ] **Step 3: Implement `buildReportCsv` + `reportCsvFilename` di `frontend/src/lib/reportExport.js`**

Ikut pola `billingExport.js`: escape `"`, baris kop periode, seksi per-status-invoice (kasus, charges, PPN, subtotal + TOTAL), seksi ON-CALL vs MONTHLY + TOTAL, footer count PPh. `reportCsvFilename(periode)` → `report-summary-YYYYMMDD.csv` (dari tanggal akhir periode, fallback hari ini).

- [ ] **Step 4: Run full unit tests**

Run: `npm test` dari `frontend/`
Expected: PASS semua

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/reportExport.js frontend/test/reportExport.test.mjs
git commit -m "feat: export CSV report summary + unit test"
```

### Task 3: Halaman `ReportSummaryPage.jsx` (hero + KPI + 2 tabel rekap + print + export)

**Files:**
- Create: `frontend/src/pages/ReportSummaryPage.jsx`
- Modify: `frontend/src/styles/index.css` (tambah blok `@media print` untuk halaman report)

**Interfaces:**
- Consumes: `buildReportSummary` (Task 1), `buildReportCsv` + `reportCsvFilename` (Task 2), `useRangedCases(from, to)` dari `../hooks/useCases.js`, `useFilters` dari `../hooks/useFilters.js`, `getAuditMap` + `getInvoiceMap` dari `../lib/api.js`, `useAuditState` (untuk `caseAuditStatus` + `syncAuditStatus`), `useInvoiceState` (untuk `invoiceStatus` + `syncInvoiceStatus` + `defaultInvoiceStatus`), `useFinanceTax` (untuk `taxMap` + `pendingUuids`), `fmtMoney`/`fmtDate8`, `Pill`/`LoadingRow`, `Reveal`, `Button`, `FilterLabel`, `invoiceTone`/`invLabel`.
- Produces: komponen default `ReportSummaryPage` untuk Task 4 (route). Tidak mengekspor helper lain.

- [ ] **Step 1: Bangun halaman ikut kerangka `BillingPage.jsx` (filter bulan + `useRangedCases` + sync `audit-map`/`invoice-map` saat mount dan `window focus`)**

Filter hanya `month/from/to` via `useFilters` + `rangeOfMonth`/`applyMonth` (copy dari `BillingPage.jsx:64-80`); tanpa brand, tanpa search. Pool = `allCases` difilter `VALID - SIAP INVOICE` + ON-CALL/MONTHLY, lalu `buildReportSummary`. `from > to` → tampilkan `EmptyRow` "Tidak ada data tervalidasi pada periode ini".

- [ ] **Step 2: Tambah hero + 6 kartu KPI + 2 tabel rekap + tombol Print dan Export CSV**

Hero `rounded-[28px]` gradien emerald→teal, badge `[ REPORT /// SUMMARY ]`, ringkasan periode. KPI: Total Kasus Tervalidasi | Total Charges | Total PPN | Subtotal Akhir | Kasus PPh (info "tanpa potongan") | Outstanding + Paid. Tabel 1 per status invoice + TOTAL, tabel 2 ON-CALL vs MONTHLY + TOTAL (badge ikut `invoiceTone`/`invLabel`). Tombol Print → `window.print()`; tombol Export CSV → unduh via `Blob` ikut pola `BillingPage.jsx:309-325`. Badge "menunggu sinkron" bila `pendingUuids.length > 0`. `LoadingRow` saat loading, varian kartu `md:hidden` untuk HP.

- [ ] **Step 3: Tambah CSS `@media print` di `frontend/src/styles/index.css`**

Sembunyikan sidebar/topbar/tombol/filter (kelas `.no-print`), tampilkan kop cetak (judul, periode, tanggal cetak). Cek manual: print preview hanya menampilkan hero ringkas + KPI + 2 tabel rekap.

- [ ] **Step 4: Verifikasi manual + unit tetap hijau**

Run: `npm test` dari `frontend/` (PASS). Cek manual: `npm run dev`, buka `/report` (sementara via import langsung sebelum Task 4 bila perlu), HP + desktop + dark mode, print preview, unduh CSV dan buka di spreadsheet.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ReportSummaryPage.jsx frontend/src/styles/index.css
git commit -m "feat: halaman report summary tervalidasi + cetak"
```

### Task 4: Wiring route + menu + izin frontend + ikon

**Files:**
- Modify: `frontend/src/App.jsx` (lazy import + `<Route path="/report">` dibungkus `RequirePerm module="report"`, setelah `/finance`)
- Modify: `frontend/src/config/modules.js` (entri `{ path: '/report', id: 'report', title: 'Report Summary', sub: '...' }` di grup Keuangan setelah finance)
- Modify: `frontend/src/config/permissions.js` (`DEFAULT_PERMS` tambah `report` per role — cermin `finance`; `ROUTE_PERM` tambah `'/report': 'report'`)
- Modify: `frontend/src/pages/RolesPage.jsx` (tambah `{ id: 'report', name: 'Report Summary', desc: '...' }` ke MODULES matriks)
- Modify: `frontend/src/components/Icon.jsx` (tambah `PATHS.report` — ikon dokumen/laporan; `iconNav` sudah pass-through untuk id baru)

**Interfaces:**
- Consumes: komponen default dari Task 3.
- Produces: route `/report` hidup dengan guard izin. Tidak ada interface ke task lain.

- [ ] **Step 1: Tambah route + menu + entri izin + ikon report**

`menuPerm('report')` sudah mengembalikan `'report'` (identity), jadi hanya entri data yang ditambah. Default `report` = 1 untuk Super Admin + Finance, 0 untuk role lain (cermin `finance`).

- [ ] **Step 2: Verifikasi manual + test suite**

Run: `npm test` dari `frontend/` (PASS — termasuk test murni `permissions` bila ada). Cek manual: sidebar menampilkan Report Summary di grup Keuangan; user Viewer membuka `/report` langsung → kembali ke dashboard; user Finance bisa membuka; matriks `/roles` menampilkan modul Report Summary.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/config/modules.js frontend/src/config/permissions.js frontend/src/pages/RolesPage.jsx frontend/src/components/Icon.jsx
git commit -m "feat: route + menu + izin modul report summary"
```
