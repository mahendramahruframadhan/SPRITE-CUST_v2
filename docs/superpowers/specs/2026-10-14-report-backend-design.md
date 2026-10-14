# Design: Backend Report (perpanjang /analytics) — 2026-10-14

Status: disetujui per-section di chat 2026-10-14. Menunggu review file ini sebelum implementation plan.
Jalur: architectural. Keputusan kunci: perpanjang `/analytics` (aditif, backward-compatible),
bukan endpoint `/report/*` baru — pool, pajak, guard, byBrand/byModule sudah persis kebutuhan report.

## 1. Tujuan & success criteria

Halaman `/report` pindah dari agregasi browser ke backend, plus section baru (aging, top-10,
breakdown, filter brand/module — frontend-nya sudah ada di `f465847`, dihitung client-side)
tetap berfungsi dengan angka yang SAMA.

- Success: untuk periode + brand + module yang sama, KPI/rekap/aging/top/breakdown versi
  backend == versi browser (toleransi 0); suite backend 180+/180, frontend 168+/168;
  halaman `/analytics` tidak berubah perilaku (respons aditif).
- Non-goal: endpoint `/report/*` baru; ubah aturan pool/pajak/guard; Excel; chart lib;
  ubah CSV/print/filter UI (perilaku tetap).

## 2. Aturan hitungan (sumber kebenaran, sama dengan AnalyticsPage)

- Pool: `billing_status` normalisasi `ONCALL`/`MONTHLY` + `audit_status.action =
  'VALID - SIAP INVOICE'`; FREE dikecualikan. Filter tanggal `date_issue BETWEEN from AND to`
  (format `YYYYMMDD`, strip `-`).
- PPN hanya baris ON-CALL: `percent` → `ROUND(charges*ppn_percent/100)`,
  `rupiah` → `ppn_amount`, else 0. `subtotal = charges + ppn`. PPh hanya count.
- Invoice: `COALESCE(status,'MENUNGGU INVOICE')`; `paid` = `PAID`, `outstanding` = bukan PAID.
- Brand/module: pencocokan persis case-sensitive (cermin `===` frontend).
- Aging: umur = tanggal server WIB (Asia/Jakarta, offset +7, tanpa DST) − `dateIssue`;
  bucket 0-30 Baik, 31-60 Normal, 61-90 Perhatian, 91-180 Risiko, >180 Risiko;
  tanggal tak valid dikecualikan + dihitung `invalid` (cermin `reportAging.js`).
- Top: 10 `subtotal` terbesar dari pool outstanding, desc; tiap baris membawa
  `recordUuid,no,client,module,dateIssue,charges,ppn,subtotal,invoiceStatus,ageDays`.

## 3. Kontrak API (aditif)

- `GET /analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&brand=&module=`
  → respons lama + `aging {buckets[{key,label,count,subtotal,percentage,status}], total{count,subtotal}, invalid}`
  + `top [{...10 baris...}]`. `brand/module` kosong = tanpa penyempitan.
- `GET /analytics/drilldown?dim&key&from&to&q&page&limit&brand&module`
  → `brand/module` menyempitkan pool; komposisi dengan `dim/key` secara AND.
  Bentuk baris + paginasi tidak berubah.
- Guard: `SessionGuard` selalu (401 tanpa `x-auth-token`); `PermGuard('analytics')`
  (403 tanpa izin; matriks sudah punya key `analytics` untuk Super Admin + Finance).
- Error: `{code,message}` existing + validasi tanggal existing; tanpa kode error baru
  (param baru opsional, tanpa validasi selain pencocokan).

## 4. Migrasi /report (ikut pola AnalyticsPage)

- `ReportSummaryPage.jsx`: `fetchAnalyticsOverview({from,to,brand,module})` untuk
  KPI/rekap/aging/top/breakdown; `fetchAnalyticsDrilldown({from,to,brand,module,q,page,limit})`
  (debounce 300ms, paginasi server) untuk tabel detail.
- Lepas di halaman ini: `useRangedCases`, `useAuditState`, `useInvoiceState`,
  `getAuditMap/getInvoiceMap`, `buildReportSummary`, mapping manual charges/ppn.
  Lib `reportAging.js`/`reportSummary.js` tetap (dipakai definisi + halaman lain tidak ada —
  tidak dihapus).
- Tetap: badge `pendingUuids` (outbox), filter UI + CSV + print + tombol Cetak detail +
  `CaseLink` deep-link `/finance?uuid=`.
- `lib/api.js`: `fetchAnalyticsOverview/Drilldown` terima `brand,module` opsional.

## 5. Testing

- Unit backend baru: bucket batas dengan today injeksi (30/31/60/61/90/91/180/181),
  narrowing brand/module (AND), top sort desc + limit 10 + outstanding-only,
  MONTHLY PPN 0 di aging/top, `invalid` count, WIB deterministik.
- Suite penuh backend + frontend; `vite build`; e2e boot bandingkan angka overview vs
  halaman (nol selisih); regresi `/analytics` (respons aditif, snapshot bentuk lama).

## Self-review

- [x] Tanpa placeholder/TBD; file:line acuan terverifikasi baca langsung.
- [x] Konsisten: pool/PPN/guard/bucket identik dengan `reportAging.js`, `cases.service.ts`,
  `analytics.service.ts`, spec analitik 2026-10-14.
- [x] Scope tunggal: 2 endpoint diperpanjang + 1 halaman migrasi; tanpa tabel/cache baru.
- [x] Tidak ambigu: komposisi AND, WIB +7, limit 10, pencocokan persis — eksplisit.
