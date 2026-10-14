# Spec: Report Summary (Billing + Finance, tervalidasi) — 2026-10-13

> Status: DRAFT (menunggu review user sebelum implementation plan).
> Jalur: architectural — pendekatan A Frontend-only (disetujui user 2026-10-13).
> Brainstorming: tujuan laporan manajemen, cakupan hanya tervalidasi,
> pajak ikut aturan Finance sekarang, filter periode saja, output layar + cetak/PDF + CSV.

## 1. Tujuan & success criteria

Halaman khusus `/report` ("Report Summary") yang merecap Billing & Audit (`/billing`)
dan Finance Audit (`/finance`) dalam satu summary read-only untuk manajemen.

* Menjawab "summary-nya hitungannya gimana": satu angka yang sama dengan Finance,
  bukan hitungan baru yang selisih.
* Success: user manajemen buka 1 halaman, pilih periode, lihat Total Charges,
  Total PPN, Subtotal Akhir, info PPh, Outstanding vs Paid, pecahan per status
  invoice + per billing status, lalu print/PDF atau export CSV.
* Non-goal: tidak ada edit pajak / validasi / invoice dari halaman ini.
  Tidak ada perubahan backend, skema, atau enum (`DIKIRIM`/`PAID` tetap).

## 2. Aturan hitungan (sumber kebenaran)

Ikut `frontend/src/lib/taxSummary.js` + perilaku Finance sekarang:

* Pool: `billingStatus IN (ON-CALL, MONTHLY)` AND
  `auditStatus == 'VALID - SIAP INVOICE'`. FREE dikecualikan walau tervalidasi.
* `totalCharges = Σ charges` pool periode aktif.
* `totalPpn = sumPpn(rows, taxMap)` — hanya baris ON-CALL yang bisa punya PPN
  (`isTaxableRow`); MONTHLY kontribusi 0. PPN per baris: persen dari charges
  baris itu (`amountFromPercent`) atau nominal rupiah (`resolveTaxAmount`).
* `subtotal = computeSubtotal({total: totalCharges, ppn: totalPpn})`
  = charges + PPN. PPh TIDAK mengurangi.
* `pphCount = pphActiveCount(rows, taxMap)` — jumlah kasus flag PPh, info saja.
* Pecahan per `invoiceStatus` (MENUNGGU INVOICE / INVOICE TERBIT / DIKIRIM / PAID):
  masing-masing count + charges + ppn + subtotal.
* Pecahan per `billingStatus` (ON-CALL vs MONTHLY + TOTAL).
* `paid = subtotal(status PAID)`, `outstanding = subtotal(status != PAID)`.

Contoh: 10 kasus tervalidasi charges 100jt, PPN 11jt, 3 flag PPh →
Total Charges 100jt, Total PPN 11jt, Subtotal 111jt,
"3 kasus ber-flag PPh (tanpa potongan)", Outstanding vs Paid dari subtotal.

## 3. Arsitektur & data flow

* Route baru `/report`, lazy di `App.jsx`, dijaga `RequirePerm module="report"`.
* Menu: grup Keuangan setelah Finance Audit (`config/modules.js`).
  Modul izin baru `report`; default ikut `finance` (Finance + Super Admin ✅,
  Admin CS / Support / Viewer ❌ kecuali diatur di `/roles`).
* Data (tanpa endpoint baru):
  `useRangedCases(from, to)` → filter periode server-side via `date_issue`
  + `getAuditMap()` + `getInvoiceMap()` (sync saat mount + `window focus`,
  ikut pola Billing/Finance) + `useFinanceTax()` (`getTaxMap`, outbox merge).
* Satu fungsi murni baru `src/lib/reportSummary.js`:
  `buildReportSummary(rows, taxMap, invoiceStatus, defaultInvoiceStatus)`
  → objek summary di §2. Murni tanpa React agar bisa unit-test
  (ikut pola `taxSummary.js`).
* Filter: `month` + `from/to` saja (copy pola `BillingPage.jsx`
  `rangeOfMonth`/`applyMonth`). Tanpa filter brand, tanpa search `q`,
  tanpa paginasi (yang ditabelkan hanya baris rekap, bukan ribuan kasus).

## 4. Komponen & tampilan

Ikut `DESIGN.md` (brand ungu Revota, ENERGY 2 / RHYTHM 2 / MOTION 2) + pola revamp:

* Hero primer `rounded-[28px]` gradien emerald→teal, badge
  `[ REPORT /// SUMMARY ]`, ringkasan periode, tombol Print + Export CSV.
* 6 kartu `.stat-grid` + `Reveal` sekali tanpa cascade: Total Kasus
  Tervalidasi | Total Charges | Total PPN | Subtotal Akhir | Kasus PPh (info)
  | Outstanding + Paid. Skeleton `LoadingRow` saat loading.
* Tabel rekap 1 — per Status Invoice (MENUNGGU/TERBIT/DIKIRIM/PAID + TOTAL):
  kolom kasus, charges, PPN, subtotal. Warna badge ikut `invoiceTone`/`invLabel`.
* Tabel rekap 2 — per Billing Status (ON-CALL vs MONTHLY + TOTAL).
* Varian kartu `md:hidden` untuk HP, kontrol `min-h-[44px]`, dark mode,
  `prefers-reduced-motion` via token existing. Satu transisi mount per section.

## 5. Output: cetak/PDF + CSV

* Print: tombol memanggil `window.print()` + `@media print` di
  `styles/index.css` (sembunyikan sidebar/topbar/tombol; tampilkan kop:
  judul, periode, tanggal cetak, pencetak). Tanpa lib baru; "Save as PDF"
  browser = PDF manajemen.
* CSV: `src/lib/reportExport.js` `buildReportCsv(summary, {periode})` ikut pola
  `billingExport.js` (escape `"`, tanpa BOM — catat keterbatasan Excel
  non-ASCII yang sama). Isi: kop periode + tabel per-invoice-status +
  tabel per-billing-status + footer. File `report-summary-YYYYMMDD.csv`.
  Scope = periode aktif (sudah satu-satunya filter).

## 6. Error handling & edge cases

* Backend mati / fetch gagal: ikut pola existing — tampilkan banner
  "Backend tidak terjangkau", KPI kosong, tidak crash.
* `from > to`: tabel rekap nol + pesan "Tidak ada data tervalidasi pada periode ini"
  (perbaikan kecil dari Billing/Finance yang diam).
* `taxMap` kosong / outbox pending: pakai merge `mergeTaxMaps` (server + outbox);
  baris pending ikut dihitung + badge kecil "menunggu sinkron" bila
  `pendingUuids.length > 0`.
* Tanpa izin modul: redirect dashboard via `RequirePerm` (ikut `App.jsx`).

## 7. Testing

* Unit baru `frontend/test/reportSummary.test.mjs` (node --test, ikut pola
  `taxSummary.test.mjs`): charges+PPN persen/rupiah, PPh hanya count,
  MONTHLY PPN 0, FREE dikecualikan, pecahan PAID vs outstanding,
  pool non-VALID dikecualikan.
* Manual: HP + tablet + desktop, dark mode, keyboard Tab/Escape,
  print preview (header kop muncul, tombol hilang), CSV dibuka di Excel.
* Delivery Gate antislop: cek DESIGN.md (radius 28px primer, badge hanya
  fungsional, blur hanya yang diizinkan, satu animasi mount per section).

## 8. File yang disentuh (rencana)

* Baru: `frontend/src/pages/ReportSummaryPage.jsx`, `src/lib/reportSummary.js`,
  `src/lib/reportExport.js`, `frontend/test/reportSummary.test.mjs`,
  CSS print di `src/styles/index.css`.
* Ubah: `src/App.jsx` (lazy + route), `src/config/modules.js` (menu),
  `src/pages/RolesPage.jsx` (daftar MODULES matriks izin — file punya list sendiri),
  seed `role_permissions` di backend (`db/init.ts`, modul `report`),
  `src/components/Icon.jsx` (ikon nav bila perlu).
* Tidak disentuh: backend, skema DB, enum, `taxSummary.js`, Billing/Finance pages.
