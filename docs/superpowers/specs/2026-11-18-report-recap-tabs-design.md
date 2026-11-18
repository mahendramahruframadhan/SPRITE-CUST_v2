# Spec: Report Summary — 10 Tab Rekap Ringkas — 2026-11-18

> Status: menunggu review user sebelum implementation plan.
> Jalur: architectural (endpoint rekap baru + struktur tab di `/report`).
> Brainstorming: user memilih semua 10 judul dari `docs/RECAP-MENU-IDEAS.md`,
> bentuk tiap tab = kartu KPI + tabel ringkas + ekspor CSV, antislop DURING.
> Halaman tetap read-only; tidak menulis ke kasus, billing, audit, invoice,
> POPI NAVA, kontrak, atau Google Sheets.

## 1. Latar & kondisi saat ini

- `/report` (`frontend/src/pages/ReportSummaryPage.jsx`) sudah berisi rekap
  operasional semua billing status, per user, per brand/module, detail kasus,
  dan bagian finansial ON-CALL tervalidasi yang saat ini disembunyikan
  (`SHOW_FINANCIAL_SECTION = false`).
- Agregasi memakai `GET /analytics/overview`, `GET /analytics/workload`, dan
  `GET /analytics/drilldown` (`backend/src/analytics/analytics.controller.ts`).
- `AnalyticsService` sudah punya aturan normalisasi billing/user, PPN ON-CALL,
  DONE/open, tervalidasi, aging, dan invoice status.
- Sumber data lain sudah tersedia di backend: `brand_statuses`, `clients`,
  `popinava_outlets`, `audit_schedule`, `audit_shots`, `audit_history`,
  `followups`, `activity_logs`, `sync_logs`, `invoice_pdfs`.
- Daftar 10 judul sudah dicatat user di `docs/RECAP-MENU-IDEAS.md`.

## 2. Tujuan & success criteria

Menambah menu tab di `/report` berisi 10 rekap ringkas:

1. Beban Kerja User
2. Brand 360
3. Billing & Revenue
4. Audit & Validasi
5. POPI NAVA
6. Modul, Issue & Channel
7. SLA & Follow-up
8. Kontrak Maintenance
9. Aktivitas & Produktivitas
10. Data Quality & Sync

Setiap tab wajib punya:

- 3–5 kartu KPI.
- Tabel ringkas maksimal 8 baris (kecuali Data Quality: 10 baris temuan).
- Tombol `Cetak` (A4 satu section) dan `Export CSV`.
- Empty state dan error state yang jelas.
- Basis waktu yang terlihat (periode kasus, bulan POPI NAVA, atau snapshot hari ini).

Success criteria:

- Manajemen bisa berpindah tab tanpa reload halaman; filter periode/brand/module
  berlaku ke semua tab berbasis kasus.
- Tab `Ringkasan` (isi lama) tetap tampil dan angkanya tidak berubah.
- Tidak ada request tulis; tidak ada perubahan skema DB.
- Backend dan frontend lolos typecheck/test/build yang sudah ada.

## 3. Non-goals

- Tidak membuat route/menu sidebar baru; tetap `/report`.
- Tidak mengubah kontrak respons endpoint analytics yang sudah ada.
- Tidak menambah chart, library baru, atau grafik tren.
- Tidak memperbaiki anomali data historis (mis. `date_issue` 7 digit).
- Tidak menambah editor/edit aksi dari tab rekap.
- Tidak menjadikan `activity_logs` sebagai penilaian kinerja tunggal.
- Tidak mengubah perilaku print halaman `Ringkasan` yang sudah ada.

## 4. Arsitektur

### 4.1 Backend

- Tambah `backend/src/analytics/recap.service.ts` (`RecapService`).
- Daftarkan `RecapService` di `providers` `backend/src/app.module.ts`.
- Tambah route di `analytics.controller.ts`:

```text
GET /analytics/recap?from=YYYY-MM-DD&to=YYYY-MM-DD&brand=&module=
```

- Route dijaga `SessionGuard` + `PermGuard` dengan `@Perm('analytics')`, sama
  seperti endpoint analytics lain. Halaman `/report` memang sudah memanggil
  endpoint analytics; role yang bisa membuka `/report` saat ini (Finance,
  Super Admin) sudah punya izin `analytics`.
- `checkRange` yang sudah ada dipakai ulang; `from`/`to` default
  `1970-01-01` / `2999-12-31` bila kosong.
- `AnalyticsService` mendapat method publik `getRangeRows(from, to)` yang
  membungkus query `fetchRows` yang sudah ada. `RecapService` menyuntik
  `AnalyticsService` dan memakai method itu, sehingga join
  `assistance_records` + `audit_status` + `invoice_status` + `case_tax`
  tidak diduplikasi.
- Helper murni yang sudah ada (`norm`, `billingKeyOf`, `billingOf`, `isDone`,
  `userOf`, `ppnOf`, `VALID_TAG`) diekspor dari `analytics.service.ts` agar
  aturan hitung tidak diduplikasi.
- Query tambahan hanya untuk data non-kasus: kontrak, POPI NAVA, follow-up,
  activity log, sync log, dan master brand/user.
- Tidak ada perubahan skema; semua query read-only.

### 4.2 Frontend

- `ReportSummaryPage.jsx` tetap memegang filter periode/brand/module dan data
  `Ringkasan` lama.
- Tambah state tab aktif dari query string `?tab=<id>` (`useSearchParams`),
  default `ringkasan`; id tidak dikenal → `ringkasan`.
- Tambah `frontend/src/config/recapTabs.js` berisi metadata 10 tab:
  `{ id, label, description, basis, kpis, columns, empty }`.
- Tambah `frontend/src/components/report/RecapTabs.jsx` (tab bar aksesibel).
- Tambah `frontend/src/components/report/RecapPanel.jsx` (kartu + tabel +
  cetak + ekspor untuk tab aktif).
- Tambah `frontend/src/lib/recapExport.js` untuk CSV per tab.
- Fetch memakai `fetchAnalyticsRecap` baru di `frontend/src/lib/api.js`.
- Isi `Ringkasan` lama dibungkus fragment dan hanya dirender saat
  `tab === 'ringkasan'`; tidak ada perubahan logika/angka di dalamnya.
- Data 10 tab di-fetch sekali saat periode/brand/module berubah, lalu dipakai
  ulang saat berpindah tab (tidak fetch per klik tab).

## 5. Aturan hitung bersama

### 5.1 Pool kasus

- Semua baris `assistance_records` pada `from..to` berdasarkan `date_issue`.
- Filter opsional `brand` (exact `client`) dan `module` (exact `module`).
- Billing dinormalisasi seperti existing: `ONCALL` → `ON-CALL`,
  `MONTHLY`, `FREE`, selain itu `LAINNYA`.
- `done` = `UPPER(TRIM(status)) = 'DONE'`; `open = count - done`.
- `validated` = `audit_status.action = 'VALID - SIAP INVOICE'`.
- Uang hanya untuk ON-CALL; PPN mengikuti `ppnOf` existing; `subtotal =
  charges + ppn`; PPh hanya info.
- User dinormalisasi `TRIM` + `UPPER`; kosong → `TANPA USER`.
- Brand kosong → `-`; module kosong → `-`.

### 5.2 Basis waktu

- Tab 1–4, 6–8, 10: basis kasus `date_issue` sesuai filter.
- Tab POPI NAVA: bulan dari `to` (`YYYY-MM`); bila `to` kosong, tidak valid,
  atau default sentinel `2999-12-31`, pakai bulan berjalan WIB.
- Tab Kontrak Maintenance: daftar kontrak = kondisi per hari ini; jumlah kasus
  per brand = periode filter.
- Tab Aktivitas: `activity_logs.created_at` dalam rentang filter.
- Tab Data Quality: pemeriksaan kasus memakai periode filter; status sync
  memakai log terakhir (global). Basis ditampilkan di UI.

### 5.3 Pembulatan & angka kosong

- Persentase `Math.round(total > 0 ? bagian/total*100 : 0)`.
- Nilai uang integer rupiah; format frontend `Rp 1.234.567`.
- Semua angka non-finite/kosong → `0` (kecuali tanggal/teks).

## 6. Definisi tiap tab

Format respons: `{ kpis: {...}, rows: [...], note?: string }`.

### 6.1 `workload` — Beban Kerja User

KPI:

- `total`: jumlah kasus.
- `activeUsers`: user unik selain `TANPA USER`.
- `onCall`: jumlah ON-CALL.
- `open`: jumlah open.
- `validated`: jumlah tervalidasi.

Rows (maks 8, urut `count` desc lalu nama):

- `user`, `count`, `onCall`, `monthly`, `free`, `lainnya`, `done`, `open`,
  `validated`, `onCallSubtotal`, `brandCount`, `moduleCount`.

Empty: tidak ada kasus pada periode.

### 6.2 `brands` — Brand 360

Sumber: agregasi kasus per `client` + `brand_statuses` (match nama
`TRIM` + `UPPER`; duplikat kontrak → ambil `updated_at` terbaru).

KPI:

- `brands`: jumlah brand pada periode.
- `withContract`: brand yang punya baris kontrak.
- `noContract`: brand tanpa kontrak.
- `monthly`, `free`, `expiring30`: jumlah kontrak Monthly, Free/GRATIS, dan
  yang expired ≤30 hari.

Rows (maks 8, urut `count` desc):

- `brand`, `count`, `onCall`, `validated`, `onCallSubtotal`,
  `contractType` (`MONTHLY` / `GRATIS` / `BARU` / `-`), `expiredAt`,
  `daysLeft`, `contractStatus` (`Aktif` / `Segera habis` / `Expired` /
  `Tanpa kontrak` / `Tanpa tanggal`).

Catatan: nilai ON-CALL memakai pool finansial tervalidasi (sama dengan
`overview`), bukan semua ON-CALL.

### 6.3 `billing` — Billing & Revenue

Sumber: pool finansial existing (ON-CALL tervalidasi).

KPI:

- `charges`, `ppn`, `subtotal`.
- `paid`: subtotal invoice PAID.
- `outstanding`: subtotal invoice selain PAID.
- `avgPerCase`: `subtotal / count` (0 bila count 0).

Rows (maks 8, urut `subtotal` desc):

- `brand`, `count`, `charges`, `ppn`, `subtotal`, `paid`, `outstanding`.
- `outstanding = subtotal - paid` per brand.

Catatan UI: “Hanya ON-CALL tervalidasi.”

### 6.4 `audit` — Audit & Validasi

Sumber: semua baris kasus pada periode (bukan hanya ON-CALL).

KPI funnel:

- `total`: semua kasus.
- `onCall`: ON-CALL.
- `validated`: audit `VALID - SIAP INVOICE` (semua billing).
- `invoiceIssued`: invoice `INVOICE TERBIT`.
- `invoiceSent`: invoice `DIKIRIM`.
- `paid`: invoice `PAID`.
- `needCheck`: `audit != VALID` tetapi invoice bukan `MENUNGGU INVOICE`.

Rows (maks 8 per brand, urut `total` desc):

- `brand`, `total`, `validated`, `invoiceIssued`, `invoiceSent`, `paid`,
  `needCheck`.

### 6.5 `popinava` — POPI NAVA

Sumber: `popinava_outlets`, `audit_schedule` bulan terkait, `audit_history`,
`audit_shots` bulan terkait.

KPI:

- `outlets`: total outlet.
- `active`, `inactive`: status outlet.
- `scheduled`: jumlah item jadwal pada bulan terkait.
- `audited`: item jadwal dengan `audited = true` atau punya riwayat `mark`
  pada bulan terkait.
- `pending`: `scheduled - audited` (minimum 0).
- `shots`: jumlah `audit_shots` dengan `created_at` pada bulan terkait.

Rows (maks 8 brand, urut outlet desc):

- `brand`, `outlets`, `active`, `audited`, `pending`, `shots`.
- Item jadwal tipe `brand` dihitung ke brand tersebut; item tipe `outlet`
  dipetakan lewat `popinava_outlets.uuid`.

Basis UI: “Bulan <label bulan>”.

### 6.6 `modules` — Modul, Issue & Channel

Sumber: baris kasus periode, agregasi per `module`.

KPI:

- `modules`: jumlah module unik.
- `subModules`: jumlah sub-module unik.
- `categories`: jumlah support category unik.
- `channels`: jumlah channel tiket unik.
- `topModule`: module dengan kasus terbanyak.
- `topChannel`: channel dengan kasus terbanyak.

Rows (maks 8, urut count desc):

- `module`, `count`, `onCall`, `done`, `open`, `topSubModule`,
  `topCategory`, `topChannel`.

`top*` dihitung dari nilai terbanyak di dalam module tersebut; `-` bila kosong.

### 6.7 `sla` — SLA & Follow-up

Sumber: baris kasus open periode + `followups` (global, mengikuti
`FollowupsService.summary`).

KPI:

- `open`: jumlah kasus open.
- `avgAgeDays`: rata-rata umur kasus open; hanya baris dengan `date_issue`
  valid; 0 bila tidak ada.
- `over3`, `over7`, `over14`, `over30`: jumlah kasus open dengan umur > 3/7/14/30 hari.
- `followupsTotal`, `followupsOverdue`, `followupsDueToday`,
  `followupsDone`: dari `followups/summary`.

Rows (maks 8, prioritas overdue lalu jatuh tempo, urut tanggal):

- `client`, `title`, `priority`, `status`, `followupDate`, `daysLate`
  (negatif = belum jatuh tempo), `pic`.

Basis UI: “Kasus open periode · follow-up per hari ini”.

### 6.8 `contracts` — Kontrak Maintenance

Sumber: seluruh `brand_statuses`; jumlah kasus dari periode.

KPI:

- `total`: jumlah kontrak.
- `monthly`, `gratis`, `baru`.
- `expiring30`: kontrak dengan 0 ≤ sisa hari ≤ 30.
- `expired`: sisa hari < 0.

Rows (maks 8, urut sisa hari ascending; tanggal kosong di akhir):

- `brand`, `type`, `startAt`, `expiredAt`, `daysLeft`, `status`
  (`Aktif` / `Segera habis` / `Expired` / `Tanpa tanggal`),
  `monthlyFee`, `pic`, `cases` (kasus periode untuk brand tersebut).

Basis UI: “Status kontrak per hari ini · kasus periode terpilih”.

### 6.9 `activity` — Aktivitas & Produktivitas

Sumber: `activity_logs` dalam rentang `created_at`.

KPI:

- `actions`: jumlah aktivitas.
- `users`: jumlah `who` unik (selain kosong).
- `inputCases`: aksi dengan kategori/aksi yang mengandung “tambah”, “input”,
  atau “baru”.
- `updateCases`: aksi dengan kategori/aksi yang mengandung “ubah”,
  “perbarui”, “update”, atau “perubahan”.
- `validation`: aksi yang mengandung “validasi” atau “audit”.

Rows (maks 8, urut jumlah desc):

- `user`, `actions`, `inputCases`, `updateCases`, `validation`,
  `lastAt` (timestamp terbaru user tersebut).

Basis UI: “Aktivitas pada periode terpilih”.

### 6.10 `quality` — Data Quality & Sync

Sumber: baris kasus periode + master + sync.

KPI:

- `findings`: total seluruh temuan (jumlah count di bawah).
- `checksFailed`: jumlah pemeriksaan dengan count > 0.
- `lastSyncStatus`, `lastSyncAt`: dari `sync_logs` terbaru.
- `missingTax`: shortcut ON-CALL tanpa data pajak.

Rows (selalu 10 pemeriksaan):

1. `Tidak ada billing status` — baris dengan billing mentah kosong.
2. `Tidak ada audit status` — tanpa baris `audit_status` / action kosong.
3. `ON-CALL tanpa data pajak` — `case_tax` tidak ada / `ppn_mode` kosong.
4. `Tervalidasi tanpa invoice` — validated dan invoice `MENUNGGU INVOICE`.
5. `PAID tanpa bukti pembayaran` — invoice PAID dan `payment_note` kosong.
6. `Brand tak ada di master` — `client` tidak ada di `clients` maupun
   `brand_statuses` (normalisasi nama).
7. `User tak ada di master` — `assign_to` tidak cocok dengan `user.name`
   (case-insensitive) dan bukan `TANPA USER`.
8. `Duplikat kasus` — kombinasi `no + client + date_issue` muncul >1;
   hitung baris berlebih; baris dengan `no` kosong diabaikan.
9. `Tanggal issue invalid` — bukan 8 digit tanggal kalender valid.
10. `Sync terakhir gagal` — count 1 bila status sync terakhir `failed`,
    selain itu 0 (`running` tidak dihitung gagal, ditampilkan di KPI status).

Kolom: `check`, `count`, `severity` (`Tinggi` / `Sedang` / `Rendah`),
`note` (penjelasan singkat).

Severity: Tinggi = audit/pajak/invoice/sync gagal; Sedang = billing, brand,
user, duplikat; Rendah = tanggal invalid.

## 7. API contract

```json
{
  "period": { "from": "2026-11-01", "to": "2026-11-30", "label": "2026-11-01 s.d. 2026-11-30" },
  "generatedAt": "2026-11-18T09:00:00.000Z",
  "basis": {
    "cases": "date_issue",
    "popinava": "2026-11",
    "contracts": "today",
    "activity": "created_at",
    "quality": "period+snapshot"
  },
  "tabs": {
    "workload": { "kpis": {}, "rows": [] },
    "brands": { "kpis": {}, "rows": [] },
    "billing": { "kpis": {}, "rows": [] },
    "audit": { "kpis": {}, "rows": [] },
    "popinava": { "kpis": {}, "rows": [] },
    "modules": { "kpis": {}, "rows": [] },
    "sla": { "kpis": {}, "rows": [] },
    "contracts": { "kpis": {}, "rows": [] },
    "activity": { "kpis": {}, "rows": [] },
    "quality": { "kpis": {}, "rows": [] }
  }
}
```

- Semua angka numerik (bukan string), kecuali tanggal/teks.
- `rows` selalu array; kosong bila tidak ada data.
- Tidak ada field yang boleh `undefined`; gunakan `0`, `''`, atau `null`
  untuk tanggal yang tidak tersedia.

## 8. UI/UX

### 8.1 Tab bar

- Posisi: setelah filter periode/brand/module.
- Urutan: `Ringkasan`, lalu 10 tab sesuai daftar.
- Gaya: garis bawah aktif, teks 12–13px, `overflow-x-auto` di mobile.
- Aksesibilitas: `role="tablist"`, tiap tombol `role="tab"`,
  `aria-selected`, `aria-controls`, panel `role="tabpanel"`; panah kiri/kanan
  memindah fokus dan tab.
- URL: `?tab=<id>`; klik tab memakai `setSearchParams` dengan `replace: true`
  agar history tidak penuh.

### 8.2 Panel tab

- Header: judul, deskripsi satu kalimat, basis waktu, tombol `Cetak` dan
  `Export CSV`.
- KPI: grid kartu mengikuti pola existing `report-card` / kartu KPI.
- Tabel: `overflow-x-auto`, header sticky bila lebih dari 8 baris; di mobile
  tabel tetap tabel (bukan kartu) agar angka bisa dibandingkan.
- Angka uang: `tabular-nums`; teks panjang `truncate` + `title`.
- Empty: baris tunggal “Tidak ada data pada periode ini” (atau pesan khusus
  tab di config).
- Loading: skeleton teks/`LoadingRow` existing; tidak ada spinner baru.
- Error: banner backend existing di atas panel + panel menampilkan empty
  state; tab lain tetap bisa dipakai.

### 8.3 Print & export

- Tombol cetak di `RecapPanel` memakai `printSection('recap-<id>')`
  (pola sama dengan `PrintBtn` existing; `PrintBtn` tidak perlu diekspor);
  panel aktif diberi `data-section="recap-<id>"`.
- Kop cetak: “Report Summary — <label tab> · <periode>` dan timestamp data.
- CSV: `buildRecapCsv(tabId, tabData, { periode, basis })` di
  `frontend/src/lib/recapExport.js`, memakai `escapeCsvFormula`, tanpa BOM
  (konsisten dengan `reportExport.js`).
- Nama file: `recap-<id>-<stamp>.csv`; `<stamp>` dari `to` atau tanggal hari ini.
- CSV berisi: 1 baris judul tab, 1 baris periode/basis, blok KPI, lalu tabel.

### 8.4 Antislop (DURING)

- Tanpa emoji di UI, tanpa gradient baru, tanpa animasi dekoratif.
- Warna mengikuti token existing; tidak menambah palet.
- Copy pendek, faktual, tanpa superlatif.
- Angka kosong tidak diberi teks dramatis; gunakan `—` + empty state.

## 9. Permission & keamanan

- Endpoint read-only, sesi wajib, `@Perm('analytics')`.
- Semua nilai query di-bind sebagai parameter; tidak ada string SQL dari input.
- `brand`/`module` hanya memfilter exact match, bukan LIKE.
- Tidak ada data sensitif baru; `activity_logs.who` sudah dipakai halaman Logs.
- Tetap mengikuti aturan anti formula injection pada ekspor CSV.

## 10. Testing

### Backend

- `backend/test/analytics.recap.test.ts`:
  - default range & filter brand/module;
  - normalisasi billing `ONCALL`/kosong;
  - uang hanya ON-CALL dan PPN percent/rupiah;
  - funnel audit menghitung invoice terbit/kirim/paid/needCheck;
  - user TANPA USER tidak dihitung user aktif;
  - SLA aging memakai tanggal valid;
  - tab non-kasus (contracts/popinava/activity/quality) tidak terpengaruh
    filter brand/module kasus secara keliru;
  - quality mendeteksi billing/audit/pajak/invoice/tanggal invalid.
- `backend/test/analytics.controller.test.ts` atau test baru: route
  `/analytics/recap` menolak range invalid dan butuh izin.

### Frontend

- `frontend/test/recapExport.test.mjs`: header CSV, urutan kolom, escaping
  formula, nama file.
- `frontend/test/recapTabs.test.mjs`: 10 id unik, label sesuai, fallback tab
  tidak dikenal.
- `frontend/test-ui/report-recap.test.jsx`: render tab bar, pindah tab,
  loading/empty/error, tombol cetak/ekspor memanggil handler.

### Verifikasi manual

- `localhost:5173/report`:
  - semua tab bisa dibuka, filter periode/brand/module mengubah angka;
  - tab `Ringkasan` identik dengan sebelum perubahan;
  - print satu tab bersih (hanya section aktif);
  - CSV terbuka di spreadsheet dan angka/kolom benar;
  - mobile: tab bisa di-scroll, tabel tidak memotong layout.

### Perintah verifikasi

```bash
cd backend && npm run typecheck && npm test
cd frontend && npm test && npm run build
```

## 11. Risiko & catatan

- **Nama brand tidak konsisten** antara `assistance_records.client`,
  `clients.brand`, dan `brand_statuses.brand`. Recap memakai normalisasi
  `TRIM` + `UPPER`; brand yang hanya beda penulisan dianggap sama untuk
  kontrak, tetapi baris kasus tetap memakai nama asli.
- **`assign_to` teks bebas**; user master bisa tidak cocok. Ini justru
  ditampilkan sebagai temuan Data Quality, bukan disembunyikan.
- **`activity_logs` tidak menangkap semua aksi**; tab aktivitas adalah
  indikator tambahan, bukan penilaian kinerja tunggal.
- **SLA tidak punya field eksplisit**; semua umur dihitung dari tanggal.
- **POPI NAVA `audit_schedule` berbentuk JSON W1..W5**; rekap membaca item
  `audited` dan `audit_history` agar “sudah/belum” konsisten.
- **Satu request besar**: 2.452 baris saat ini masih ringan. Bila data tumbuh
  jauh, endpoint bisa dipecah per tab tanpa mengubah kontrak UI.
- **Tab non-periode** (Kontrak, Quality) harus diberi label basis waktu agar
  tidak disalahartikan sebagai angka periode.

## 12. File yang disentuh

Backend:

- `backend/src/analytics/recap.service.ts` (baru)
- `backend/src/analytics/analytics.controller.ts`
- `backend/src/analytics/analytics.service.ts` (ekspor helper murni)
- `backend/src/app.module.ts`
- `backend/test/analytics.recap.test.ts` (baru)

Frontend:

- `frontend/src/pages/ReportSummaryPage.jsx`
- `frontend/src/components/report/RecapTabs.jsx` (baru)
- `frontend/src/components/report/RecapPanel.jsx` (baru)
- `frontend/src/config/recapTabs.js` (baru)
- `frontend/src/lib/recapExport.js` (baru)
- `frontend/src/lib/api.js`
- `frontend/test/recapExport.test.mjs` (baru)
- `frontend/test/recapTabs.test.mjs` (baru)
- `frontend/test-ui/report-recap.test.jsx` (baru)

Dokumentasi:

- `docs/superpowers/specs/2026-11-18-report-recap-tabs-design.md` (file ini)
