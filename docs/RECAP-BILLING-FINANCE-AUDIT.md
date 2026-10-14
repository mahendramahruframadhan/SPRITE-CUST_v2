# Recap: Halaman Billing & Audit dan Finance Audit

> **Status dokumen:** 2026-10-12 · Branch `dev/refactor-ppn&pph-20261012` · commit `27f9d86`
> **Sumber:** `README.md`, `CLAUDE.md`, `DESIGN.md`, `frontend/src/pages/BillingPage.jsx`,
> `frontend/src/pages/FinanceAuditPage.jsx`, `backend/src/billing/`, `backend/src/pdf/`,
> plus hooks/lib frontend yang relevan.
> **Dasar fakta:** semua klaim di bawah diverifikasi langsung ke kode pada commit di atas.
> Yang tidak ada di kode dinyatakan eksplisit "tidak ada".

---

## Daftar Isi

1. [Garis Besar — Peta Sistem](#1-garis-besar--peta-sistem)
2. [Alur Utama: Kasus → Validasi → Invoice](#2-alur-utama-kasus--validasi--invoice)
3. [Halaman `/billing` — Billing & Audit](#3-halaman-billing--billing--audit)
4. [Halaman `/finance` — Finance Audit](#4-halaman-finance--finance-audit)
5. [Backend: Modul Billing & Invoice](#5-backend-modul-billing--invoice)
6. [Backend: Modul PDF (R2)](#6-backend-modul-pdf-r2)
7. [Otorisasi & Matriks Izin](#7-otorisasi--matriks-izin)
8. [Skema Database](#8-skema-database)
9. [Status PPN / PPH / Subtotal](#9-status-ppn--pph--subtotal)
10. [Ringkasan Endpoint](#10-ringkasan-endpoint)
11. [Temuan, Inkonsistensi & Risiko](#11-temuan-inkonsistensi--risiko)

---

## 1. Garis Besar — Peta Sistem

SPRITE-CUST v2 adalah sistem terpadu untuk mengelola data kasus support, billing,
invoice, finance, dan HR report. Dua halaman yang direcap di sini adalah **dua tahap
berikutan dari satu rantai operasional uang**.

```
┌──────────────┐
│ Google Sheet │  ──sync satu arah (upsert by recordUuid)──▶  ▼
└──────────────┘                                            ┌─────────────┐
                                                           │  Postgres   │
  /form ──POST /api/cases──▶  assistance_records ──────────▶│  :5433      │
                                                           └─────────────┘
                                                                    │
                          ┌─────────────────────────────────────────┤
                          ▼                                         ▼
              ┌───────────────────────┐                 ┌────────────────────┐
              │  /billing             │                 │  /finance          │
              │  Billing & Audit      │ ──────────────▶ │  Finance Audit     │
              │  modul: billing       │  gate: status    │  modul: finance    │
              │  "apakah ini sah?"    │  validasi =      │  "terbitkan &      │
              │                       │  VALID - SIAP    │   tagih"           │
              │                       │    INVOICE       │                    │
              └───────────────────────┘                 └────────────────────┘
                       writes: audit_status                      writes: invoice_status
                                                              uploads: invoice_pdfs → Cloudflare R2
```

**Inti bisnisnya:**

- **`/billing` = gerbang mutu.** Tim CS/Finance memeriksa tagihan sebelum uang
  benar-benar keluar. Tidak ada satu rupiah pun yang terbit invoice dari sini —
  halaman ini hanya memberi *status validasi* pada kasus `ON-CALL`.
- **`/finance` = loket pencairan.** Hanya kasus berstatus validasi
  `VALID - SIAP INVOICE` yang boleh muncul di sini. Tim Finance mengunggah PDF
  invoice, menandai pengiriman, lalu menandai lunas.

**Kunci arsitektural yang harus dipahami:**

| Prinsip | Implementasi |
|---|---|
| **Sync satu arah** | Google Sheets → DB saja. Tidak pernah menulis balik. (`CLAUDE.md` §5.1) |
| **Kosakata enum tidak boleh di-rename** | Nilai DB/logika tetap `DIKIRIM`/`PAID`; yang berubah hanya label tampilan lewat `invLabel()` (`utils/tones.js:8`) |
| **Otorisasi berbasis token server** | `x-auth-token` (token sesi), **bukan** `x-user-email`. Email hanya informasi tampilan. (`CLAUDE.md` §5.3) |
| **Escape SQL tunggal** | Semua SQL mentah wajib lewat `esc()` dari `backend/src/db/sql.ts` (`CLAUDE.md` §5.4) |
| **localStorage = cache, DB = kebenaran** | Halaman frontend menyimpan state di `localStorage` supaya instan, tapi selalu sinkron ulang dari backend saat mount + saat `window` regain focus |

**Teknologi yang relevan untuk kedua halaman:**

- Frontend: React 18 + Vite 5 + Tailwind 3 + Chart.js, request via `src/lib/api.js`
- Backend: NestJS 10 + Drizzle + Postgres, fallback `pg-mem` bila `DATABASE_URL` kosong
- Penyimpanan PDF: Cloudflare R2 (S3-compatible) via **presigned URL** — file
  **tidak pernah melewati server Nest**

---

## 2. Alur Utama: Kasus → Validasi → Invoice

### 2.1 Status validasi (Billing) — daftar dinamis

Status validasi **bukan enum tertutup**. Default-nya tiga, tapi Super Admin bisa
menambah, me-rename, dan menghapus lewat tombol "Master Status Validasi".

```js
// frontend/src/hooks/useAuditState.js:6-7
export const DEFAULT_ACTIONS = ['BELUM DIVALIDASI', 'VALID - SIAP INVOICE', 'PERLU DICEK ULANG'];
export const DEFAULT_AUDIT_STATUS = 'BELUM DIVALIDASI';
```

Ada migrasi kosakata lama yang otomatis (`useAuditState.js:8-13`):

| Nilai lama | → Nilai baru |
|---|---|
| `BELUM DI AUDIT` | `BELUM DIVALIDASI` |
| `DONE BLM DI AUDIT` | `VALID - SIAP INVOICE` |
| `FOLLOW UP FINANCE` | `PERLU DICEK ULANG` |
| `PAID` | `VALID - SIAP INVOICE` |

### 2.2 Status invoice (Finance) — alur terkunci 4 status

```js
// frontend/src/hooks/useInvoiceState.js:8-9
export const DEFAULT_INVOICE = ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'DIKIRIM', 'PAID'];
export const DEFAULT_INVOICE_STATUS = 'MENUNGGU INVOICE';
```

**Diagram alur + siapa yang boleh memicu:**

```
                    ┌──────────────────────────────┐
                    │   MENUNGGU INVOICE           │  ← label amber (read-only)
                    │   (status awal setiap kasus)  │
                    └───────────┬──────────────────┘
                                │
                    upload PDF pertama sukses (backend otomatis)
                    pdf.service.ts:137-143
                                ▼
                    ┌──────────────────────────────┐
                    │   INVOICE TERBIT              │  ← label violet (klik-able)
                    │   (invoice sudah diterbitkan)  │
                    └───────────┬──────────────────┘
                                │
                    user klik badge → patchInvoice(uuid,'DIKIRIM')
                    FinanceAuditPage.jsx:563-574
                                ▼
                    ┌──────────────────────────────┐
                    │   DIKIRIM  →  label "TERKIRIM"│  ← label sky (klik-able)
                    │   (menunggu pembayaran client)│
                    └───────────┬──────────────────┘
                                │
                    user klik tombol PAID + isi keterangan (WAJIB)
                    FinanceAuditPage.jsx:591-614
                                ▼
                    ┌──────────────────────────────┐
                    │   PAID → label "SUDAH DIBAYAR"│  ← label emerald (undo)
                    │   (lunas, tersimpan bukti bayar)│
                    └──────────────────────────────┘

  Jalur mundur (revisi, satu tingkat):
    PAID ──klik badge + "Ya, urungkan"──▶ DIKIRIM
    DIKIRIM ──klik badge (ikon undo)─────▶ INVOICE TERBIT
    INVOICE TERBIT ──hapus PDF terakhir──▶ MENUNGGU INVOICE  (backend otomatis)
```

**Dua status terkunci total** — tidak bisa diubah manual, hanya oleh sistem:

| Status | Kenapa terkunci | Diterangkan oleh |
|---|---|---|
| `MENUNGGU INVOICE` | Hanya otomatis dari hapus PDF terakhir | `billing.controller.ts:81-83` → 422 `INVOICE_AUTO_LOCKED` |
| `INVOICE TERBIT` | Maju hanya dari upload PDF; mundur hanya dari `DIKIRIM` | `billing.controller.ts:97-101` → 422 `INVOICE_AUTO_LOCKED` |

### 2.3 Pondasi: `charges`

Semua angka uang di kedua halaman berasal dari **satu kolom**:
`assistance_records.charges` (INTEGER, default 0, `backend/src/db/init.ts:31`).
Nilai ini masuk dari Google Sheets saat sync. Tidak ada kolom mata uang, tidak ada
rincian pajak — lihat §9.

---

## 3. Halaman `/billing` — Billing & Audit

### 3.1 Identitas

| Aspek | Nilai | Sumber |
|---|---|---|
| Route | `/billing` | `App.jsx:60` |
| Lazy import | `lazy(() => import('./pages/BillingPage.jsx'))` | `App.jsx:24` |
| Module permission | `billing` → `<RequirePerm module="billing">` | `App.jsx:60`, `config/permissions.js:22` |
| File | `frontend/src/pages/BillingPage.jsx` | — |
| Ukuran | **1.030 baris** (57 KB) | `wc -l` |
| Judul di sidebar | **Billing & Audit** — "Validasi tagihan sebelum diterbitkan invoice" | `config/modules.js:15` |
| Role default berizin | Super Admin ✅ · Admin CS ✅ · Finance ✅ · Support ❌ · Viewer ❌ | `db/init.ts:11-16` |
| Tanpa izin | redirect `<Navigate to="/dashboard" />` | `App.jsx:73-87` |

### 3.2 Tujuan

Workbench validasi tagihan. User memilih periode (bulan/rentang tanggal) dan brand,
memantau agregasi nominal lewat 5 KPI + 3 chart, lalu memberi **status validasi
satu klik** pada tiap kasus `ON-CALL`. Tidak ada pembuatan, edit, atau hapus kasus
di halaman ini.

### 3.3 State

**State lokal:**

| Baris | Variabel | Awal | Pemicu |
|---|---|---|---|
| 72 | `filters` | `{month, from, to, brand}` — default **bulan berjalan** | `setFilter` / `setManyFilters` / `resetFilterValues` |
| 81 | `cat` | `'ON-CALL'` | klik kartu kategori |
| 82 | `q` | `''` | input "Cari kasus…" |
| 83 | `page` | `1` | paginator; reset otomatis saat filter berubah |
| 84 | `perPage` | `10` | select (10/50/100) |
| 85 | `masterOpen` | `false` | tombol "Master Status Validasi" |
| 86 | `newAction` | `''` | form tambah status |
| 87 | `detailUuid` | `null` | "Lihat Detail" |
| 92-95 | `editingAction`, `editValue`, `editBusy`, `editErr` | — | form rename inline |
| 99 | `exportPop` | `usePopover({width:300})` | dropdown Export CSV |
| 37 | `open` (dalam `ExpandableText`) | `false` | "Selengkapnya"/"Tutup" |

**Dari hook:**

| Hook | Yang dipakai |
|---|---|
| `useAuditState()` (61) | `auditActions`, `caseAuditStatus`, `defaultAuditStatus`, `updateAudit`, `syncAuditStatus`, `addAction`, `removeAction`, `renameAuditAction` |
| `useRangedCases(from, to)` (76) | `allCases`, `loading` — **`error` tidak dipakai** |
| `useTheme()` (120) | `theme` untuk palet chart |
| `useConfirm()` (96) | konfirmasi hapus status master |
| `usePopover()` (99) | `open`, `pos` |

**Derived (`useMemo`):** `brands` (129) · `filtered` (134) · `catStats` (147) ·
`catItems` (163) · `stats` (168) · `items` (265) · `grandTotal` (268) ·
`totalPages`/`safePage`/`paged`/`pageNums` (291-300)

> ⚠️ `kpi` (189) dan ketiga dataset chart (205-237) **bukan** `useMemo` —
> dihitung ulang tiap render.

### 3.4 Alur data

```
useRangedCases(from, to)                    BillingPage.jsx:76
  └─ fetchCasesRange({from, to})            useCases.js:54
      └─ GET /api/cases?page=1&limit=100&from=YYYY-MM-DD&to=YYYY-MM-DD
         (+ halaman 2..N paralel via Promise.all)
         backend: SELECT … WHERE date_issue BETWEEN … ORDER BY date_issue DESC
  └─ guard stale-response via sequence counter (useCases.js:48,51,56,62)

Status validasi:
  GET /api/billing/audit-map    → syncFromServer() saat mount + tiap window focus
                                  (BillingPage.jsx:276-289)
  PATCH /api/cases/:uuid/audit  → handleAudit() (302) → updateAudit()
                                  state lokal diperbarui optimistis dulu, lalu PATCH
```

**Catatan penting:** `/billing` mengambil kasus **server-side per rentang tanggal**
(`useRangedCases`), berbeda dari `/finance` yang ambil **semua kasus sekali** lalu
filter di client.

### 3.5 Filter

| Kontrol | Field | Opsi / Default | Server/Client |
|---|---|---|---|
| **Bulan** | `month` | `<input type="month">`, default bulan berjalan | trigger server |
| **Bulan ini** | `month` | tombol, kembali ke bulan berjalan | trigger server |
| **Date From** | `from` | `<input type="date">`, default tgl 1 | server + client |
| **Date Until** | `to` | `<input type="date">`, default tgl akhir | server + client |
| **Brand** | `brand` | `BrandCombobox`, opsi = brand unik **dalam periode** | client only |
| **Reset** | — | kembali ke bulan berjalan | — |
| **Cari kasus…** | `q` | teks bebas, cocok ke 4 field | client only |
| **Tab kategori** | `cat` | `['ON-CALL','MONTHLY','FREE']` hardcode (145) | client only |
| **Rows per page** | `perPage` | 10 / 50 / 100 | client |

**Mekanisme:**
- `month → from/to` via `applyMonth()` (77) + `rangeOfMonth()` (65). Bulan kosong
  → `{from:'', to:''}` = semua tanggal.
- Ubah `Date From`/`Date Until` **mengosongkan `month`** (596, 600) → mode rentang bebas.
- Pencarian `q` mencocokkan 4 field (265-267): `client`, `issue`,
  `billingCategory`, `picName` — `includes()` case-insensitive.
- Tanggal dibandingkan sebagai **string `YYYYMMDD`** (`from.replace(/-/g,'')` vs
  `c.dateIssue`) — bukan objek Date.
- **Tidak ada validasi `from > to`** — hasilnya tabel kosong tanpa pesan.

### 3.6 Tabel — 12 kolom

`min-w-[1240px]`, wrapper `overflow-x-auto`, header uppercase 11px.

| # | Header | Baris th | Yang dirender | Baris td |
|---|---|---|---|---|
| 1 | No | 654 | `c.no \|\| '-'` | 671 |
| 2 | Tgl Issue | 655 | `fmtDate8(c.dateIssue)` → `9 Okt 2026` | 672 |
| 3 | Brand | 656 | avatar inisial 2 huruf + nama | 673-680 |
| 4 | Issue | 657 | `line-clamp-2`, max-w-320px, + tombol "Lihat Detail" | 681-696 |
| 5 | PIC Name | 658 | `picName \|\| assignTo` | 697 |
| 6 | Module | 659 | `Pill(moduleTone)` + `subModule` | 698-701 |
| 7 | Status Billing | 660 | `Pill dot billingTone` | 702-704 |
| 8 | Billing Category | 661 | span kapsul slate (bukan `Pill`) | 705-707 |
| 9 | Support Type | 662 | teks | 708 |
| 10 | Charges | 663 | `fmtMoney`, kanan, `tabular-nums`; amber tebal bila >0 | 709 |
| 11 | **Status Validasi** | 664 | badge + tombol siklus (khusus ON-CALL) | 710-744 |
| 12 | Completion Notes | 665 | `ExpandableText` (clamp-2, tombol bila >120 char) | 745 |

**Paginator:** `‹` / `›` + maksimal **5 nomor** halaman tanpa elipsis (294-300).
Footer: "Menampilkan X–Y dari Z data" + "{n} kasus · Total: {grandTotal}".

### 3.7 Aksi per baris

| Aksi | Label | Baris | Efek |
|---|---|---|---|
| Buka detail | **"Lihat Detail"** | 685-694 | `openDetail(uuid)` (90) → `withViewTransition` → `CaseDetailModal` |
| Ubah validasi | isi = **nama status berikutnya** + ikon panah | 726-737 | `handleAudit(uuid, next)` (302) → `updateAudit` + `recordActivity` kategori "Validasi" |

**Siklus status satu klik** (713-716):

```js
const current = caseAuditStatus[c.recordUuid] || defaultAuditStatus;
const idx  = auditActions.indexOf(current);
const next = auditActions[(idx + 1) % auditActions.length] || current;
const isDefault = idx <= 0;              // amber bila belum maju, emerald bila sudah
```

**Hanya baris `billingStatus === 'ON-CALL'`** punya kontrol status (711). Selain
itu kolomnya menampilkan `-` (742).

> ⚠️ **Tidak ada** checkbox baris, aksi massal, ubah massal, sortable kolom,
> hapus kasus, atau edit kasus di halaman ini.

### 3.8 KPI (5 kartu) — baris 189-203

| Judul | Nilai | Sub-teks | Warna |
|---|---|---|---|
| Total Kasus | `filtered.length` | "dalam periode" | brand (ungu) |
| Total Tagihan | `fmtMoney(totalAmount)` | "ON-CALL + MONTHLY" | emerald |
| ON-CALL | `fmtMoney(oncall.amount)` | "{n} kasus" | amber |
| MONTHLY | `fmtMoney(monthly.amount)` | "{n} kasus" | sky |
| Valid — Siap Invoice | `auditCounts['VALID - SIAP INVOICE']` | "{n} kasus perlu dicek ulang" | emerald |

Perhitungan `stats` (168-187):
- `totalAmount` = Σ charges **ON-CALL + MONTHLY saja** (183-184) — FREE tidak masuk.
- `free.amount` **dipatok 0** (180).
- `auditCounts` dihitung dari `oncall.concat(monthly)` (172).

Ukuran angka uang adaptif lewat `moneySize` (28-33): >16 char → 17px,
>13 → 20px, else 22px; non-uang 28px.

### 3.9 Chart (3) — baris 205-523

| Chart | Jenis | Data | Palet |
|---|---|---|---|
| Distribusi Billing | Doughnut | count per kategori | `['#f59e0b','#0ea5e9','#10b981']` |
| Total Tagihan per Kategori | Bar | amount per kategori | sama |
| Distribusi Status Validasi | Pie | `auditCounts` per `auditActions` | 6 warna (231) |

Semua pakai tooltip gelap monospace (`cornerRadius: 0`, `displayColors: false`,
239-246) dan palet ikut `theme` terang/gelap (120-126).

### 3.10 Modal

**A. Master Status Validasi** (808-945)
- Trigger: tombol hero (408-416). Panel `max-w-md rounded-3xl`, header gradien amber.
- Isi: daftar semua `auditActions`. Setiap baris menampilkan nama + meta
  "{Default|Kustom} · dipakai {used} kasus" (885-889).
- **Edit** (893-899) → form inline: `<input autoFocus maxLength={40} class="uppercase">`
  + "Simpan" / "Batal" (865-881). Submit → `renameAuditAction()` → `PATCH
  /config/status-options/rename` → backend **memigrasi semua kasus** yang memakai
  nama lama dalam satu transaksi.
- **Hapus** (902-907) — hanya status non-default (900). Konfirmasi via
  `useConfirm` dengan `variant: 'danger'` (105-117): "{n} kasus yang menggunakannya
  akan kembali ke status default."
- **Tambah** (917-941): input + tombol "Tambah". Normalisasi: trim, collapse spasi,
  `slice(0,40)`, uppercase (`useAuditState.js:80`).
- ⚠️ **Tidak ada handler Escape / focus-trap** di modal ini — berbeda dari
  `ConfirmModal` dan `CaseDetailModal`.

**B. Popover Export CSV** (442-477)
- `createPortal` ke `document.body` agar tidak terpotong `overflow-hidden` hero.
- Dua item: **"Kategori ini ({cat})"** dan **"Semua kategori"**.
- Tutup otomatis klik luar / Escape; item pertama auto-focus (101-103).

**C. CaseDetailModal** (948-979)
- `kicker` = `Detail Kasus #N`, `title` = brand.
- Chips: module, billingStatus, dan status validasi (hanya bila bukan FREE).
- Dua seksi: *Informasi Kasus* (7 baris) dan *Billing & Validasi* (4 baris).
- Buka/tutup dibungkus `withViewTransition` + shared element `case-title-vt`.
- ⚠️ Fallback status validasi di baris 974 memakai **string hardcode
  `'BELUM DIVALIDASI'`**, bukan `defaultAuditStatus` reaktif.

### 3.11 Export CSV

```js
function exportData(scope) {          // BillingPage.jsx:309-325
  const rows = scope === 'all' ? filtered : catItems;
  const csv = buildBillingCsv(rows, caseAuditStatus);   // lib/billingExport.js
  …
}
```

- **13 kolom header:** NO, DATE ISSUE, CLIENT, ISSUE, PIC NAME, MODULE,
  BILLING STATUS, BILLING CATEGORY, SUPPORT TYPE, CHARGES, STATUS VALIDASI,
  COMPLETION NOTES, RECORD_UUID (`lib/billingExport.js:3-7`).
- **Nama file:** `billing-audit-semua-kategori.csv` atau `billing-audit-{cat}.csv`
  (`billingExport.js:25-28`).
- **Cakupan:** "semua kategori" = `filtered` (tanggal+brand, **tanpa** `q`);
  "kategori ini" = `catItems` (juga tanpa `q`).
- ⚠️ Tanpa BOM UTF-8 → Excel Windows bisa salah baca karakter non-ASCII.

---

## 4. Halaman `/finance` — Finance Audit

### 4.1 Identitas

| Aspek | Nilai | Sumber |
|---|---|---|
| Route | `/finance` | `App.jsx:61` |
| Lazy import | `lazy(() => import('./pages/FinanceAuditPage.jsx'))` | `App.jsx:25` |
| Module permission | `finance` | `App.jsx:61`, `RolesPage.jsx:41` |
| File | `frontend/src/pages/FinanceAuditPage.jsx` | — |
| Ukuran | **1.116 baris** (64 KB) | `wc -l` |
| Judul di sidebar | **Finance Audit** — "Penerbitan invoice kasus tervalidasi" | `RolesPage.jsx:41` |
| Role default berizin | Super Admin ✅ · Finance ✅ · **Admin CS ❌** · Support ❌ · Viewer ❌ | `db/init.ts:11-16` |
| Link masuk | Dari DashboardPage (kartu & CTA) | `DashboardPage.jsx:364, 636` |
| Link keluar | Ke `/billing` (strip alur + empty state) | `FinanceAuditPage.jsx:703, 982` |

### 4.2 Tujuan

Workstation tim Finance. Halaman ini adalah **recipient** dari output `/billing`:
hanya kasus `VALID - SIAP INVOICE` dengan billing `ON-CALL`/`MONTHLY` yang tampil
(`validatedPool`, 497-505). Dari sini tim Finance mengunggah PDF invoice, menandai
terkirim, lalu menandai lunas — sambil mencatat nomor invoice, keterangan, dan
menyimpan jejak audit lengkap per kasus.

### 4.3 State

**State lokal komponen utama:**

| Baris | Variabel | Awal | Fungsi |
|---|---|---|---|
| 449 | `detailUuid` | `null` | buka `CaseDetailModal` |
| 451 | `payNotes` | `{}` | bukti bayar dari `invoice-map.notes` + patch lokal setelah PAID |
| 453 | `paidTarget` | `null` | `{uuid, label, amount}` target modal PAID |
| 454 | `payNote` | `''` | isi textarea keterangan pembayaran |
| 455 | `payBusy` | `false` | disable tombol saat PATCH berjalan |
| 457 | `undoPaidFor` | `null` | konfirmasi inline urungkan PAID |

**State komponen `PdfCell` (91-436) — dirender per baris:**

| Baris | Variabel | Fungsi |
|---|---|---|
| 95 | `files` | daftar file PDF kasus |
| 98 | `gate` | `{canDownload, canDelete}` dari server |
| 99-100 | `busy`, `pct` | status + persen upload |
| 209-216 | `deleteTarget`, `deleteBusy`, `downloadBusy`, `histOpen`, `hist`, `histBusy` | hapus/unduh/riwayat |
| 244 | `previewBusy` | id file yang dibuka ke tab baru |
| 93-94 | `fileRef`, `seq` | ref file + guard stale-response |

**Dari hook:** `useAuditState` (444), `useCases` (445, **hanya** `cases`+`loading`),
`useInvoiceState` (446: `invoiceActions`, `invoiceStatus`, `defaultInvoiceStatus`,
`syncInvoiceStatus`, `ensureDefaults`, `invoiceMeta`, `updateInvoiceMeta`).

**Derived:** `brands` (491) · `validatedPool` (497) · `stats` (507) · `filtered` (531)
· `total` (546 — **const biasa, bukan `useMemo`**) · `kpi` (522 — **juga bukan `useMemo`**)

### 4.4 Alur data & sinkronisasi lintas-browser

```
useCases()                         FinanceAuditPage.jsx:445
  └─ fetchAllCases()               api.js:74-93
      GET /api/cases?page=1&limit=100, lalu halaman 2..N PARALEL
      cache modul global allCache — semua halaman berbagi 1× fetch

Per baris, PdfCell mount:
  GET /api/pdf/by-case/:uuid       baris 104  (daftar file)
  GET /api/pdf/state/:uuid         baris 110  (gate tombol)

Sinkron status (menutup celah antar-tab):
  syncFromServer()                 baris 469-483
    GET /api/billing/invoice-map   → syncInvoiceStatus(uuid, st) + setPayNotes(r.notes)
    GET /api/billing/audit-map     → syncAuditStatus(uuid, st)
  dipanggil: saat mount (486) + tiap window 'focus' (487)
  ⚠️ .catch(() => {}) — senyap, tanpa toast/retry
```

**Perbedaan penting dari `/billing`:**
- Status invoice **tidak diubah optimistis** — `syncInvoiceStatus` dipanggil
  *setelah* `await patchInvoice` sukses (komentar 550: "sinkron, bukan optimistic").
- Sebaliknya, status validasi di `/billing` **bersifat optimistis** (state lokal
  dulu, PATCH setelahnya, `useAuditState.js:66-69`).

### 4.5 Pool & filter — 100% client-side

```js
// FinanceAuditPage.jsx:497-505
const validatedPool = useMemo(
  () => allCases.filter((c) =>
    (c.billingStatus === 'ON-CALL' || c.billingStatus === 'MONTHLY') &&
    caseAuditStatus[c.recordUuid] === VALID_TAG      // 'VALID - SIAP INVOICE'
  ), [allCases, caseAuditStatus]);
```

| Kontrol | Field | Opsi / Default | Baris |
|---|---|---|---|
| Date From | `from` | `DatePickerInput`, placeholder "Semua tanggal", default `''` | 751-756 |
| Date Until | `to` | idem | 757-762 |
| Brand | `brand` | `BrandCombobox` + item virtual "Semua Brand" | 763-768 |
| Status Invoice | `invFilter` | `<select>`: "Semua" + `invoiceActions.map()` berlabel `invLabel(a)` | 769-781 |
| Reset Filter | — | tombol | 742-748 |

Semua diterapkan di `filtered` (531-544) dengan perbandingan string `YYYYMMDD`.
**Setiap perubahan filter dicatat** ke `recordActivity` kategori "Filter" lewat
wrapper `setLogged` (648-655). `setFilter` mengembalikan `null` bila nilai sama —
tidak spam saat mengetik (`useFilters.js:18`).

⚠️ **Tidak ada validasi `from > to`** dan **tidak ada paginasi** — `filtered.map()`
merender seluruh hasil (823). Untuk ribuan kasus DOM bisa berat.

### 4.6 Tabel — 13 kolom

| # | Header | Baris th | Yang dirender | Baris td |
|---|---|---|---|---|
| 1 | No | 807 | `c.no` | 828 |
| 2 | Tanggal | 808 | `fmtDate8(c.dateIssue)` | 829 |
| 3 | Brand | 809 | `c.client` | 830-832 |
| 4 | PIC | 810 | `picName` | 833 |
| 5 | Issue | 811 | `line-clamp-2` + tombol **"Lihat Detail"** | 834-848 |
| 6 | Module | 812 | `Pill(moduleTone)` + subModule | 849-852 |
| 7 | Billing Status | 813 | `Pill dot billingTone(bs)` | 853-855 |
| 8 | Billing Category | 814 | `Pill` slate hardcoded | 856-858 |
| 9 | Charges | 815 | `fmtMoney` kanan; amber tebal bila >0 | 859 |
| 10 | **Status Invoice** | 816 | blok 4 cabang (lihat §4.7) | 860-951 |
| 11 | **Upload PDF** | 817 | `<PdfCell>` | 952-954 |
| 12 | No. Invoice | 818 | `<input>` mono 130px → `updateInvoiceMeta({no})` | 955-963 |
| 13 | Keterangan | 819 | `<input>` 160px → `updateInvoiceMeta({note})` | 964-973 |

Footer (990-997): "Hanya kasus **VALID - SIAP INVOICE** dari Billing & Audit yang
tampil di halaman ini" + "{n} kasus · **Total: {fmtMoney(total)}**".

### 4.7 Kolom Status Invoice — 4 cabang render (860-951)

Semua badge punya dot status `w-1.5 h-1.5 rounded-full bg-current` (mewarisi warna
teks). Lebar kontainer tetap `w-[180px]`.

| Status Enum | Label Tampil | Warna | Render | Aksi klik |
|---|---|---|---|---|
| `MENUNGGU INVOICE` | MENUNGGU INVOICE | amber | `<span>` baca-saja (924) | — |
| `INVOICE TERBIT` | INVOICE TERBIT | violet | `<button>` + ikon paper-plane (867-878) | `markDikirim()` → `DIKIRIM` |
| `DIKIRIM` | **TERKIRIM** | sky | `<button>` + ikon undo (879-890) | `undoStatus(→ INVOICE TERBIT)` |
| `PAID` | **SUDAH DIBAYAR** | emerald | `<button>` + ikon undo (911-921) | buka konfirmasi inline |

**Tambahan per status:**
- `DIKIRIM` → teks "Menunggu pembayaran…" (931) + tombol hijau penuh **"PAID"**
  (932-940) → `openPaidModal()`.
- `PAID` → baris "Lunas: {note}" (943-947) dari `payNotes`, dengan tooltip berisi
  note + tanggal + siapa yang bayar.
- Konfirmasi inline PAID (892-909): "Urungkan SUDAH DIBAYAR? Status kembali ke
  TERKIRIM (revisi)." + tombol **"Ya, urungkan"** / **"Batal"**.

Mapping label & warna terpusat di `utils/tones.js:8` dan `:40-53`:

```js
export const invLabel = (s) => (s === 'DIKIRIM' ? 'TERKIRIM' : s === 'PAID' ? 'SUDAH DIBAYAR' : s);
```

### 4.8 Tiga fungsi status utama

**`markDikirim(uuid)`** (563-574) — `INVOICE TERBIT` → `DIKIRIM`
```js
await patchInvoice(uuid, 'DIKIRIM');
syncInvoiceStatus(uuid, 'DIKIRIM');
notify(…)  + recordActivity(…, 'Invoice');
```

**`undoStatus(uuid, to, fromLabel)`** (578-589) — mundur satu tingkat
```js
await patchInvoice(uuid, to);        // DIKIRIM → INVOICE TERBIT, atau PAID → DIKIRIM
syncInvoiceStatus(uuid, to);
```
Backend mengunci urutan, jadi undo selalu tepat satu tingkat.

**`confirmPaid()`** (591-614) — `DIKIRIM` → `PAID`, keterangan wajib
```js
if (!note) { notify('Keterangan pembayaran wajib diisi…', 'err'); return; }
const invNo = (invoiceMeta[uuid]?.no || '').trim();
const r = await patchInvoice(uuid, 'PAID', { paymentNote: note, ...(invNo ? { invoiceNo: invNo } : {}) });
syncInvoiceStatus(uuid, 'PAID');
setPayNotes(prev => ({...prev, [uuid]: {note, paidAt: new Date().toISOString(), paidBy: user?.name || user?.email}}));
```

**Kunci desain (komentar 69-74, 616-618):** **tidak ada dropdown ubah status
manual.** Status murni dikendalikan alur — upload/hapus PDF otomatis + tombol PAID.
Ini berbeda dari halaman lama yang punya dropdown.

**Peta error backend → toast** (`INV_ERR_MSG`, 75-82):
`INVOICE_AUTO_LOCKED` · `INVOICE_NEED_PDF` · `NOT_TERBIT_YET` · `NOT_DIKIRIM_YET` ·
`PAYMENT_NOTE_REQUIRED`.

### 4.9 Komponen `PdfCell` — penanganan lampiran invoice

**Alur upload 3 langkah** (122-171):
```
pilih file
  └─ validasi klien: gate (129) → PDF? (135) → ukuran ≤ 10 MB? (140)
     └─ POST /api/pdf/upload-url     → dapat {id, url} presigned
        └─ XHR PUT langsung ke R2     putXhr() (38-50) + progress bar (316-320)
           └─ POST /api/pdf/confirm   → backend verifikasi & naikkan status
              └─ reload() + sinkron invoiceStatus dari response
```

**Self-healing:** bila upload gagal, baris `uploading` yang nyangkut dihapus via
`deletePdf(uid)` (162-165) — komentar 160-161 mencatat bahwa cron server baru
membersihkannya setelah >30 menit.

**Progress bar** (316-320): `role="progressbar"`, `aria-valuenow={pct}`,
gradient emerald→teal, lebar `style={{width: pct%}}`. Teks tombol berubah jadi
`{pct}%` saat upload (294).

**Status file PDF** (`PDF_STATUS_LABEL`, 67):

| Status DB | Label | Ikon file | Tombol Lihat/Unduh | Tombol Hapus |
|---|---|---|---|---|
| `completed` | (tanpa label) | rose | ✅ aktif | ✅ aktif |
| `uploading` | "mengupload…" | amber | ❌ disabled | ✅ aktif |
| `failed` | "gagal" | amber | ❌ disabled | ✅ aktif |

Gate tombol (328-330):
```js
const ready  = isPdfReady(f.status);                    // status === 'completed'
const canDl  = ready && (!gate || gate.canDownload);    // AND gate server
const hint   = ready ? 'Belum dikonfirmasi server — muat ulang halaman.'
                   : 'Tersedia setelah upload selesai dikonfirmasi';
```
**Hapus sengaja SELALU aktif** termasuk baris macet (komentar 326-327) agar user
bisa membersihkan sendiri. Server `/pdf/state/:uuid` mengembalikan
`canUpload: !can` sehingga tombol upload terbuka lagi otomatis setelah dihapus.

**Empat aksi per file:**

| Aksi | Label/ikon | Fungsi | Baris |
|---|---|---|---|
| Unduh | ikon panah-down sky | `requestPdfDownloadUrl(id)` → `<a download>` | 173-191, 372-391 |
| Lihat | ikon mata emerald | `window.open('', '_blank')` sinkron → arahkan ke presigned `?inline=1` | 250-271, 351-371 |
| Hapus | ikon tong sampah | buka `DeleteConfirmModal` → `DELETE /api/pdf/:id` | 232-241, 392-402 |
| Riwayat | ikon jam | `GET /api/pdf/history/:uuid` → `InvoiceHistoryModal` | 218-230, 296-314 |

**Pratinjau tanpa CORS** (komentar 246-249): tab dibuka **sinkron** (tanpa
`noopener`, agar bisa ditulis dari sini & anti popup-blocker), diisi placeholder
"Memuat pratinjau PDF…", lalu `tab.location.href = r.url` diarahkan **langsung**
ke presigned URL inline — tanpa `fetch`/blob, jadi bebas CORS dan tidak memicu
download. Kalau terblokir → toast "Tab baru diblokir browser…".

### 4.10 KPI (6 kartu) — baris 522-529

| Kartu | Nilai | Sub-teks | Warna |
|---|---|---|---|
| Siap Invoice | `stats.total` | `{fmtMoney(totalAmount)} tervalidasi` | brand |
| Menunggu Invoice | `stats.menunggu` | "kasus" | amber |
| Invoice Terbit | `stats.terbit` | "kasus" | violet |
| Terkirim | `stats.dikirim` | "menunggu pembayaran" | sky |
| Sudah Dibayar | `stats.paid` | "dari {total} kasus tervalidasi" | emerald |
| **Total Outstanding** | `fmtMoney(outstandingAmount)` | "{n} kasus belum dibayar" | rose (`text-[19px]`) |

Semua dihitung dari `validatedPool` (bukan `filtered`) — jadi KPI **tidak
ikut berubah saat filter tanggal/brand/status diterapkan**. Perbandingan
`stats` (507-520):

```js
const outstanding = validatedPool.filter((c) => (invoiceStatus[c.recordUuid] || defaultInvoiceStatus) !== 'PAID');
// outstandingAmount = Σ charges kasus !PAID
```

**Hero** (666-698): gradien emerald `from-[#064e3b] via-[#059669] to-[#10b981]`,
badge `[ FINANCE /// INVOICE ]`, ringkasan `{total} kasus tervalidasi siap invoice ·
outstanding {…} · {paid} sudah dibayar` (683), tombol **"Export CSV"** (687-695).

**Strip alur kerja** (701-712): `Billing & Audit → Menunggu Invoice → Invoice Terbit
→ Terkirim → Sudah Dibayar` — **`Reveal` dipakai untuk hero/KPI/filter/tabel**,
strip alur cukup `animate-fade-in-fast`.

### 4.11 Di mana `total` (Σ charges hasil filter) tampil — 4 lokasi

| Lokasi | Baris | Isi |
|---|---|---|
| Sub-header tabel (kiri) | 796 | "{n} kasus · total {fmtMoney(total)}" |
| Badge header tabel (kanan) | 799-801 | pill emerald "Total filter: {fmtMoney(total)}" |
| Footer tabel (kanan) | 994-996 | "{n} kasus · **Total: {fmtMoney(total)}**" |
| Hero | 683 | outstanding (dari pool, bukan filter) |

⚠️ `total` (546) adalah `const` biasa — **bukan** `useMemo`, dihitung ulang tiap render.

### 4.12 Export CSV

`exportData()` (619-644), file `finance-audit.csv`.

- **16 kolom:** NO, DATE ISSUE, CLIENT, PIC NAME, ISSUE, MODULE, BILLING STATUS,
  BILLING CATEGORY, SUPPORT TYPE, CHARGES, STATUS VALIDASI, STATUS INVOICE,
  NOMOR INVOICE, KETERANGAN, COMPLETION NOTES, RECORD_UUID (620).
- Cakupan: `filtered` (ikut filter aktif).
- ⚠️ Kolom STATUS INVOICE menulis **`invLabel(...)`** — jadi nilai di file adalah
  `TERKIRIM`/`SUDAH DIBAYAR`, bukan enum mentah `DIKIRIM`/`PAID` (628).
- ⚠️ Tanpa dropdown opsi export (berbeda dari `/billing` yang punya dua opsi).
- ⚠️ Tanpa BOM UTF-8.

### 4.13 Modal

| Modal | Pemicu | Isi | Catatan |
|---|---|---|---|
| `CaseDetailModal` (1001-1040) | "Lihat Detail" | 2 seksi: Informasi Kasus (7 baris) + Billing & Invoice (8 baris) | ⚠️ chip status invoice **selalu amber** (1013), tidak mengikuti `invoiceTone` |
| **Modal PAID** (1043-1093) | tombol "PAID" | header gradien emerald + nominal; 1 textarea "Keterangan pembayaran *" | ⚠️ **inline di file, bukan komponen**; **tidak punya handler Escape** dan **tidak mengunci scroll body** — berbeda dari 3 modal komponen lain |
| `DeleteConfirmModal` (418-425) | ikon hapus | nama + ukuran file; "Batal" / "Ya, Hapus" | ganti `confirm()` bawaan browser (komentar 193) |
| `InvoiceHistoryModal` (426-433) | ikon jam | timeline dari `HistoryTracking` | subtitle "{n} aktivitas tercatat"; `who === 'Sistem'` → "Sistem · otomatis" |

---

## 5. Backend: Modul Billing & Invoice

File tunggal: **`backend/src/billing/billing.controller.ts`** (130 baris).
`@UseGuards(SessionGuard)` di level kelas + `@UseGuards(PermGuard) @Perm(...)` per method.

### 5.1 `PATCH /api/cases/:uuid/audit` — modul `billing` (58-67)

```js
const action = body.action || body.status;
if (!action) return {ok:false, error:'action required'};        // ← HTTP 200, bukan 400
await db.pq(`INSERT INTO audit_status (record_uuid,action,updated_at) VALUES ($1,$2,$3)
             ON CONFLICT (record_uuid) DO UPDATE SET action=EXCLUDED.action, …`);
await logActivity(…, { category: 'Validasi', action: `mengubah status validasi ${label}`,
                       detail: `menjadi ${action}` });
```

**Karakteristik penting:**

| Aspek | Status quo |
|---|---|
| Field yang bisa diubah | **hanya `action`** |
| Validasi enum di server | **tidak ada** — string apa pun tersimpan apa adanya |
| Validasi keberadaan kasus | **tidak ada** — uuid asing → pelanggaran FK → 500 `INTERNAL` |
| Efek samping | upsert `audit_status` + 1 baris `activity_logs` |
| Kolom `updated_by` | **ada di skema tapi tidak pernah ditulis** — provenance harus dibaca dari `activity_logs` |
| Kontrak error | **penyimpangan**: tanpa `action` balas HTTP **200** `{ok:false,error:…}`, bukan 400 dengan envelope standar |

**Kontrak error standar** (`common/http-exception.filter.ts:34`):
```json
{ "ok": false, "code": "KODE", "message": "pesan Bahasa Indonesia", "statusCode": 422 }
```

### 5.2 `PATCH /api/cases/:uuid/invoice` — modul `finance` (68-129)

Mesin status lengkap dengan validasi transisi:

| `canon` | `_FROM_` yang diterima | `_KE_` | Error bila dilanggar |
|---|---|---|---|
| `MENUNGGU INVOICE` | — | — | 422 `INVOICE_AUTO_LOCKED` (81-83) |
| `INVOICE TERBIT` | hanya `DIKIRIM` | `INVOICE TERBIT` | 422 `INVOICE_AUTO_LOCKED` (97-101) |
| `DIKIRIM` | `INVOICE TERBIT`, `UNPAID`(legacy), `DIKIRIM`, `PAID` | `DIKIRIM` | 422 `NOT_TERBIT_YET` (87-90) |
| `PAID` | `DIKIRIM`, `PAID` | `PAID` | 422 `NOT_DIKIRIM_YET` (108-110)<br>422 `INVOICE_NEED_PDF` bila 0 PDF completed (111-114)<br>422 `PAYMENT_NOTE_REQUIRED` bila `paymentNote` kosong (115-118) |
| selain 4 di atas | apa pun | status itu | lolos sebagai **status kustom** (125-128) |

**Detail:**
- Status **disimpan apa adanya** (kasar/casing dari client); hanya `canon`
  (`status.toUpperCase()`) yang dipakai untuk percabangan (74).
- `PAID` menyimpan bukti bayar ke `payment_note`, `paid_at`, `paid_by` (120).
  `paymentNote` dipotong 500 char (115).
- ⚠️ **`invoiceNo` tidak disimpan ke kolom mana pun** — hanya masuk ke teks
  `activity_logs.detail` (121-122, 126-127). Tidak ada kolom `invoice_no` di skema.
- ⚠️ `invoice_status.updated_by` juga tidak pernah diisi.

### 5.3 Endpoint peta (sinkronisasi lintas-browser)

| Endpoint | Guard | Response |
|---|---|---|
| `GET /api/billing/audit-map` (47-57) | `@Perm('billing')` | `{ok:true, map:{recordUuid: action}}` |
| `GET /api/billing/invoice-map` (23-43) | `@Perm('billing')` | `{ok:true, map:{…}, notes:{recordUuid:{note,paidAt,paidBy}}}` |
| `GET /api/billing/stats` (11-19) | `@Perm('billing')` | `{auditCounts, invoiceCounts, totalCharges}` |

`invoice-map` query kedua (bukti bayar `status='PAID'`) dibungkus `try/catch`
untuk DB lama sebelum kolom `payment_*` ada (33-41).

⚠️ **`GET /billing/stats` tidak dipakai kedua halaman** — semua KPI dihitung
di client dari array kasus.

---

## 6. Backend: Modul PDF (R2)

File: `backend/src/pdf/pdf.controller.ts` + `pdf.service.ts`. Semua `@Perm('finance')`.

### 6.1 Konfigurasi

| Item | Nilai |
|---|---|
| Penyimpanan | Cloudflare R2 (S3-compatible), bucket sama dengan audit shots |
| Env | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_REGION` (default `auto`) |
| Batas ukuran | `R2_MAX_MB` default **10 MB** |
| TTL presigned URL | **300 detik** |
| `PDF_STUCK_MINUTES` | default **30 menit** |
| Tanpa kredensial | semua endpoint balas **503 `R2_NOT_CONFIGURED`** |
| Opsi khusus | `forcePathStyle: true`; `requestChecksumCalculation/responseChecksumValidation: 'WHEN_REQUIRED'` (hotfix presigned PUT dari browser) |

### 6.2 Alur lengkap

**1. Presigned upload-url** — `POST /api/pdf/upload-url` → `createUploadUrl`
- Nama file disanitasi: basename, karakter non-`[A-Za-z0-9._-]` → `_`, maks 120 char.
- Validasi: ekstensi `.pdf` → `NOT_PDF`; ukuran 1..MAX → `BAD_SIZE`; kasus harus
  ada → `CASE_NOT_FOUND` 404.
- Key objek: `invoices/<recordUuid>/<epochMs>-<namaBersih>`.
- Tulis baris `invoice_pdfs` status **`'uploading'`**, lalu preset presigned PUT.

> ⚠️ Browser melakukan `PUT` **langsung ke R2** — file tidak melewati server Nest.

**2. Confirm** — `POST /api/pdf/confirm` → `confirmUpload`
- Baris tidak ada → `PDF_NOT_FOUND` 404. Sudah `completed` → idempoten.
- **Verifikasi ganda**: `HeadObject` → `ContentLength` harus >0 dan ≤MAX;
  lalu `GetObject Range bytes=0-4` → magic bytes harus diawali `%PDF-`.
- Gagal → hapus objek di R2 (best-effort), set `'failed'`, lempar **`VERIFY_FAILED` 400**.
- Sukses → `'completed'` + `logActivity` kategori `'Invoice'`.

**⭐ Otomatisasi status (kunci alur):**
```js
// pdf.service.ts:137-143
if (invoiceStatus !== 'PAID' && !== 'DIKIRIM' && !== 'INVOICE TERBIT' && !== 'UNPAID') {
  await this.setInvoiceStatus(record_uuid, 'INVOICE TERBIT');
  await logActivity(…, { who: 'Sistem', action: 'status invoice otomatis menjadi INVOICE TERBIT karena PDF terupload' });
}
```

**3-7. Endpoint lain**

| Endpoint | Fungsi | Gate |
|---|---|---|
| `GET /api/pdf/by-case/:uuid` | array `{id,filename,sizeBytes,status,createdAt}` ORDER BY created_at DESC | — |
| `GET /api/pdf/state/:uuid` | `{total, completed, pending, canDownload, canDelete, canUpload}` | `canDownload = canDelete = completed > 0`; `canUpload = !can` |
| `GET /api/pdf/:id/download-url[?inline=1]` | presigned GET, TTL 300s | status ≠ completed → `NOT_READY` 400 |
| `DELETE /api/pdf/:id` | hapus objek + baris | **fail-closed**: R2 gagal → 502 `R2_DELETE_FAILED`, baris DB **dipertahankan** |
| `GET /api/pdf/history/:uuid` | `activity_logs` kategori `('Invoice','Validasi')`, `LIMIT 50` | — |

**⭐ Otomatisasi status saat hapus:**
```js
// pdf.service.ts:258-267
const downgradeable = invoiceStatus === 'INVOICE TERBIT' || invoiceStatus === 'UNPAID';
if (downgradeable && (await this.countCompleted(record_uuid)) === 0) {
  await this.setInvoiceStatus(record_uuid, 'MENUNGGU INVOICE');
  await logActivity(…, { who: 'Sistem' });
}
```
`DIKIRIM`/`PAID` **tidak pernah diturunkan** — invoice yang sudah dikirim/dibayar
tidak berubah hanya karena file dihapus.

### 6.3 Cron

| Jadwal | Service | Pekerjaan |
|---|---|---|
| `*/5 * * * *` | `sync/sync.service.ts:32-36` | sync Google Sheets (dilewati bila mode mock) |
| `*/10 * * * *` | `pdf/pdf.service.ts:273-303` | hapus baris `uploading` > 30 menit + baris `failed` > 24 jam (+ objek R2-nya) |
| `*/10 * * * *` | `shots/shots.service.ts:196-220` | identik untuk audit shots |

Semua query cron dibungkus `try/catch` senyap karena pg-mem tidak mendukung penuh
`INTERVAL`/`RETURNING` (300-302).

⚠️ **Tidak ada cron** untuk rekonsiliasi status invoice/audit, ageing invoice,
atau pengingat jatuh tempo. Sinkronisasi status invoice↔PDF bersifat event-driven.

---

## 7. Otorisasi & Matriks Izin

### 7.1 Dua lapis guard — keduanya berbasis token, bukan email

1. **`SessionGuard`** (`auth/session.guard.ts:8-18`) — dipasang di level `@Controller`
   kelas billing/pdf/cases. Cek `resolveSessionUser`; gagal → **401** `SESSION_EXPIRED`.
2. **`PermGuard` + `@Perm(module)`** (`auth/perm.guard.ts:6,24-42`) — per method.
   Tanpa sesi → 401; sesi valid tapi modul tidak diizinkan → **403**.

`hasModulePerm`: **Super Admin selalu lolos**; selain itu
`SELECT allowed FROM role_permissions WHERE role=$1 AND module=$2` harus bernilai 1.

### 7.2 Matriks default (`db/init.ts:11-16`)

| Role | `billing` | `finance` |
|---|---|---|
| Super Admin | ✅ | ✅ |
| Admin CS | ✅ | ❌ |
| Support | ❌ | ❌ |
| **Finance** | ✅ | ✅ |
| Viewer | ❌ | ❌ |

> ⚠️ **Izin tidak simetris.** Ubah status **validasi** butuh `billing`; ubah status
> **invoice** butuh `finance`. Role Finance boleh keduanya; **Admin CS hanya yang
> pertama** — meski `PATCH /cases/:uuid/invoice` adalah endpoint yang dipakai
> halaman `/finance`.

### 7.3 Endpoint yang dilindungi

| Modul | Endpoint |
|---|---|
| `billing` | `GET /billing/stats`, `/billing/invoice-map`, `/billing/audit-map`, `PATCH /cases/:uuid/audit`, `PUT /config/status-options`, `PATCH /config/status-options/rename` |
| `finance` | seluruh `pdf/*` + `PATCH /cases/:uuid/invoice` |
| **tanpa `@Perm`** (hanya sesi) | `GET /cases*`, `GET /config/status-options`, `GET /brand-status`, `GET /sync/logs` |

> ⚠️ `GET /config/status-options` — daftar master status — hanya dijaga `SessionGuard`,
> sehingga **role apa pun yang login bisa membacanya**, walau menuliskannya butuh `billing`.

### 7.4 Token di frontend

```
POST /api/auth/sign-in/email → { user, token }
  → setAuthToken() → storage            (api.js:13-14)
  → header 'x-auth-token' di SEMUA request (api.js:20-22)
```
TTL sesi 7 hari; satu user = satu sesi aktif; login baru menghapus sesi lama.
Saat 401: frontend membersihkan storage dan mengarahkan ke `/login` sekali saja
(`api.js:28-44`). Header `x-user-email` **masih dikirim** tapi tidak dipercaya
untuk otorisasi.

---

## 8. Skema Database

DDL resmi: `backend/src/db/init.ts:25-65` (dijalankan sekali saat boot via `main.ts:15`).
⚠️ Tidak ada folder migrasi dan tidak ada pemanggilan `migrate()` — indeks yang
hanya dideklarasikan di `db/schema.pg.ts:38-40` kemungkinan **tidak pernah dibuat**.

### 8.1 Tabel inti kedua halaman

**`assistance_records`** (`init.ts:26-33`) — sumber semua baris kasus
```
record_uuid TEXT PK · no · date_issue TEXT NOT NULL · client TEXT NOT NULL
pic_name · module · sub_module · issue · assign_to · status
billing_status · billing_category · support_type
charges INTEGER DEFAULT 0          ← satu-satunya kolom uang
completion_notes · channel_ticket · location · ref_price_list · group_kpi
Index: idx_date_issue, idx_client
```

**`audit_status`** (`init.ts:40`) — ditulis oleh `/billing`
```
record_uuid TEXT PK (FK → assistance_records, CASCADE)
action TEXT NOT NULL DEFAULT 'BELUM DIVALIDASI'
updated_by TEXT          ← ada tapi tidak pernah ditulis
updated_at TEXT
```

**`invoice_status`** (`init.ts:41`) — ditulis oleh `/finance`
```
record_uuid TEXT PK (FK, CASCADE)
status TEXT NOT NULL DEFAULT 'MENUNGGU INVOICE'
updated_by TEXT          ← ada tapi tidak pernah ditulis
updated_at TEXT
payment_note TEXT · paid_at TEXT · paid_by TEXT   ← bukti bayar PAID
```

**`invoice_pdfs`** (`init.ts:49`)
```
id TEXT PK · record_uuid TEXT NOT NULL (FK, CASCADE)
filename TEXT NOT NULL · storage_key TEXT NOT NULL UNIQUE
size_bytes INTEGER DEFAULT 0
status TEXT NOT NULL DEFAULT 'uploading'   ← uploading | completed | failed
uploaded_by TEXT · created_at TEXT · updated_at TEXT
```

### 8.2 Tabel pendukung

| Tabel | Peran untuk kedua halaman |
|---|---|
| `activity_logs` (48) | sumber `GET /pdf/history/:uuid` — `who`, `action`, `category`, `detail`, `record_uuid`, `created_at` |
| `app_config` (43) | tempat master `auditActions` / `invoiceActions` |
| `role_permissions` (47) | matriks izin modul |
| `brand_statuses` (52) | kontrak brand; punya `monthly_fee INTEGER` — **satu-satunya "tarif" yang mirip pajak, tanpa konsep pajak sama sekali** |

---

## 9. Status PPN / PPH / Subtotal

### 9.1 Status quo — diverifikasi

| Artefak | Status | Bukti |
|---|---|---|
| `frontend/src/lib/taxSummary.js` | ✅ **ADA** (57 baris, 1.636 byte) | commit `a92c5bd` |
| `frontend/test/taxSummary.test.mjs` | ✅ **ADA** — **24 test, 24 pass** | dijalankan `node --test` |
| `frontend/src/components/TaxSummaryPanel.jsx` | ❌ **TIDAK ADA** | `ls` → No such file or directory |
| Mount `<TaxSummaryPanel>` di `FinanceAuditPage.jsx` | ❌ **TIDAK ADA** | 0 import `taxSummary`, 0 panel |
| `frontend/tests/finance-tax.e2e.ts` | ❌ **TIDAK ADA** | — |
| Backend dukungan pajak | ❌ **TIDAK ADA** | `grep -rniE "\b(ppn\|pph\|tax\|pajak)\b" backend/src` → **0 hasil** |

`FinanceAuditPage.jsx` mtime masih **2026-09-25** — belum pernah disentuh fitur ini.

### 9.2 Isi `taxSummary.js` (sudah ada, belum ter-wire)

Fungsi murni tanpa React — sengaja dipisah agar bisa diuji unit tanpa DOM:

| Fungsi | Baris | Tanggung jawab |
|---|---|---|
| `amountFromPercent(total, percent)` | 8-13 | `Math.round(total × percent / 100)`; 0 bila total atau persen ≤ 0 |
| `computeSubtotal({total, ppn, pph})` | 15-17 | **`total + ppn − pph`** |
| `resolveTaxAmount(entry, total)` | 19-23 | 0 bila non-aktif; persen → diturunkan dari `total`; rupiah → nilai tersimpan |
| `sanitizeTaxState(raw)` | 36-49 | parse terjaga: JSON rusak / hilang → kedua pajak non-aktif |
| `validateRpInput(str)` | 51-53 | hanya digit bulat |
| `validatePercentInput(str)` | 55-57 | digit, boleh desimal |

Internal: `toNum` (3), `nonNeg` (4), `NON_AKTIF` (6), `sanitizeEntry` (25-34).

### 9.3 Rencana (spec + implementation plan)

Spec: `docs/superpowers/specs/2026-10-12-finance-ppn-pph-design.md` (223 baris, status DRAFT).
Plan: `docs/superpowers/plans/2026-10-12-finance-ppn-pph.md`.

**Delapan keputusan desain:**

| No | Keputusan |
|---|---|
| D1 | `Subtotal = Total + PPN − PPH` (PPH mengurangi) |
| D2 | PPN dua mode di modal: **Persen** (default) atau **Rupiah** |
| D3 | PPH dua mode: Persen (default) atau Manual |
| D4 | Base persen PPH = **Total Charges** (filter aktif) |
| D5 | Persistensi `localStorage` key `finance-tax-v1` |
| D6 | Nilai pajak **level-halaman**, bukan per baris |
| D7 | Footer tabel **tetap** Total Charges murni — panel subtotal satu-satunya tempat akumulasi |
| D8 | Subtotal negatif tampil apa adanya, tanpa clamp |

**Rencana task breakdown (4 task TDD):**
1. Lib + unit test → ✅ **SELESAI** (commit `a92c5bd`, 24/24 hijau)
2. `TaxSummaryPanel.jsx` + PPN (rincian, dropdown, modal dua mode) + mount di halaman
3. PPH (dropdown & modal, perhitungan turunan)
4. Persistensi localStorage + Delivery Gate antislop

> **Catatan fase 2:** sinkronisasi ke backend/API/DB adalah fase 2 — artinya
> selama fase 1 nilai pajak **hanya ada di browser user**, tidak terbawa ke tab
> lain atau perangkat lain.

### 9.4 Dampak ke backend bila fase ini selesai

Backend **tidak memodelkan pajak sama sekali**. Yang akan diperlukan:
kolom `dpp`, `ppn`, `pph` bertipe `numeric` (bukan `integer` seperti `charges`
sekarang), kolom mata uang, dan aturan perhitungan di `billing.controller.ts` /
`pdf.service.ts`. Perubahan itu **tidak ada** di branch sekarang.

---

## 10. Ringkasan Endpoint

### 10.1 Dipakai `/billing`

| Method | Path | Permission | Baris pemanggil |
|---|---|---|---|
| GET | `/api/cases?page=N&limit=100&from=&to=` | session | 76 |
| GET | `/api/billing/audit-map` | `billing` | 277 |
| PATCH | `/api/cases/:uuid/audit` | `billing` | 728 → 302 |
| GET | `/api/config/status-options` | session | `useAuditState.js:54` |
| PUT | `/api/config/status-options` | `billing` | 927, 114 |
| PATCH | `/api/config/status-options/rename` | `billing` | 839 |
| POST | `/api/roles/logs` | `logs` | 306, 841, 928, 115 |

### 10.2 Dipakai `/finance`

| Method | Path | Permission | Baris pemanggil |
|---|---|---|---|
| GET | `/api/cases?page=N&limit=100` | session | 445 |
| GET | `/api/config/status-options` | session | 446, 444 |
| GET | `/api/billing/invoice-map` | `billing` | **470** |
| GET | `/api/billing/audit-map` | `billing` | **477** |
| PATCH | `/api/cases/:uuid/invoice` | `finance` | 567, 582, 603 |
| GET | `/api/pdf/by-case/:uuid` | `finance` | 104 |
| GET | `/api/pdf/state/:uuid` | `finance` | 110 |
| POST | `/api/pdf/upload-url` | `finance` | 149 |
| POST | `/api/pdf/confirm` | `finance` | 153 |
| GET | `/api/pdf/history/:uuid` | `finance` | 222 |
| GET | `/api/pdf/:id/download-url[?inline=1]` | `finance` | 177, 263 |
| DELETE | `/api/pdf/:id` | `finance` | 197, 163 |
| POST | `/api/roles/logs` | `logs` | 570, 585, 608, 650, 658 |
| **PUT** | **presigned URL R2** (langsung ke storage) | — | **152** |

### 10.3 Permission anomali

⚠️ `/finance` memanggil `GET /api/billing/invoice-map` dan `/api/billing/audit-map`,
keduanya dijaga `@Perm('billing')`. Role dengan akses `finance` tapi **tidak**
`billing` akan menerima 403 → `.catch(() => {})` senyap → status tidak pernah
sinkron. Matriks default Music aman (Finance punya keduanya), tapi matriks yang
diubah Super Admin di `/roles` bisa memunculkan celah ini.

---

## 11. Temuan, Inkonsistensi & Risiko

Dikelompokkan: **(A)** perilaku yang berpotensi salah, **(B)** inkonsistensi
kode/komentar, **(C)** keputusan yang sudah sengaja dibuat.

### A. Perilaku berisiko

| # | Temuan | Lokasi | Dampak |
|---|---|---|---|
| A1 | **`error` dari `useCases`/`useRangedCases` tidak dipakai di kedua halaman** | Billing 76, Finance 445 | Backend mati / 401 → **tidak ada banner error sama sekali**. User melihat "Belum ada kasus tervalidasi" atau "Tidak ada data … yang cocok dengan filter" — sangat menyesatkan |
| A2 | **Nomor invoice tidak pernah sampai ke server** | Finance 956-962 | `updateInvoiceMeta` hanya tulis localStorage. `meta.no` hanya terkirim sebagai `invoiceNo` **saat** `confirmPaid` (600-603). Nomor yang diketik hilang bila kasus tidak pernah di-POID, dan tidak ada di tab/perangkat lain |
| A3 | **`invoiceMeta` per-browser tanpa resync** | `useInvoiceState.js:182-184` | Tidak konsisten dengan `invoiceStatus` yang punya `getInvoiceMap()` dari server |
| A4 | **Dua tempat untuk data mirip** | Finance 965 (`meta.note`) vs 605 (`payNotes[uuid].note`) | Kolom "Keterangan" tidak pernah terisi otomatis saat PAID dikonfirmasi |
| A5 | **`stats.free.amount` dipatok 0** | Billing 180 | Bar chart "Total Tagihan per Kategori" **selalu menunjukkan FREE = 0**, padahal kartu kategori FREE (561) menjumlahkan `Σ charges` sebenarnya (`catStats`, 157). Dua implementasi berbeda untuk agregat yang sama |
| A6 | **KPI audit menghitung lebih dari yang bisa diedit** | Billing 172 | `auditCounts` dihitung dari `ON-CALL + MONTHLY`, tapi **hanya `ON-CALL`** yang punya tombol status (711). KPI menghitung kasus yang tak bisa diubah dari halaman ini |
| A7 | **`PATCH /cases/:uuid/audit` tanpa validasi enum & keberadaan kasus** | `billing.controller.ts:61-64` | String bebas tersimpan; uuid asing → 500 `INTERNAL` |
| A8 | **`GET /config/status-options` hanya dijaga SessionGuard** | `config.controller.ts:82` | Role apa pun yang login bisa membaca master status, walau menulis butuh `billing` |
| A9 | **`/finance` butuh endpoint ber-`@Perm('billing')`** | Finance 470, 477 | Lihat §10.3 — 403 senyap bila matriks diubah |
| A10 | **Tidak ada paginasi di `/finance`** | Finance 823 | Ribuan kasus → DOM sangat berat |
| A11 | **Tidak ada validasi `from > to`** di kedua halaman | Billing 134, Finance 531 | Hasil filter kosong tanpa pesan penjelas |
| A12 | **Validasi duplikat status tidak konsisten** | Billing 923 vs `useAuditState.js:83` | Halaman pakai `includes()` case-**sensitive**, hook pakai case-**insensitive**. Mengetik `valid - siap invoice` lolos validasi halaman, lalu `addAction` menolak diam-diam — **toast "ditambahkan" tetap muncul padahal status tidak bertambah** (929) |
| A13 | **`removeAction` diam-diam menolak** | `useAuditState.js:92` | Guard `prev.length <= 1` tanpa umpan balik — user tetap melihat toast "dihapus" (116) meski tidak ada yang berubah |
| A14 | **`window.open('', '_blank')` tanpa `noopener`** | Finance 252 | Tab baru punya `window.opener`. Risiko rendah (kebijakan browser modern mem-blockir setelah navigasi cross-origin), tapi tetap layak dicatat |
| A15 | **`payNotes` memakai jam klien** | Finance 605 | Sampai `window focus` berikutnya memicu resync (474), tooltip "Lunas:" bisa meleset dari yang tercatat di DB |

### B. Inkonsistensi kode / komentar

| # | Temuan | Lokasi |
|---|---|---|
| B1 | Komentar menyatakan `invLabel()` ada di `utils/format.js` — **salah**, ada di `utils/tones.js:8` | Finance 73-74 |
| B2 | **Dua implementasi `fmtMoney`**: lokal (`'Rp 0'` untuk nol, 1098-1100) vs `utils/format.js:20-22` (`'-'`). Halaman ini tidak mengimpor yang bersama | Finance 1098 |
| B3 | Chip status invoice di `CaseDetailModal` **selalu amber**, tidak mengikuti `invoiceTone` | Finance 1013 |
| B4 | Fallback status validasi di modal detail pakai string hardcode `'BELUM DIVALIDASI'`, bukan `defaultAuditStatus` reaktif | Billing 974 |
| B5 | `Bar` dari `react-chartjs-2` **di-import tapi tidak pernah dipakai** — halaman ini tidak punya chart sama sekali | Finance 4 |
| B6 | `SummaryBox` **didefinisikan tapi tidak pernah dipanggil** — dead code | Billing 1023-1030 |
| B7 | `validatedPool` dipakai di `useEffect` **sebelum dideklarasikan** (461 vs 497) — bukan TDZ error, tapi pola stale-closure | Finance 460-463 |
| B8 | `downloadBusy` dideklarasikan setelah fungsi `download` memakainya (212 vs 174-175) — aman, tapi membingungkan pembaca | Finance 173-191 |
| B9 | `recordActivity` di Finance 585 memakai enum mentah `'INVOICE TERBIT'` sementara toast 584 memakai `invLabel(to)` — beda untuk `DIKIRIM`/`TERKIRIM` | Finance 584-585 |
| B10 | `CAT_META.gradient` (tab kategori) **berbeda** dari `HERO_THEME` (hero) — dua palet terpisah untuk hal yang sama | Billing 327-343 vs 349-371 |
| B11 | 7+ `eslint-disable react/forbid-elements` di `BillingPage`, blok di `FinanceAuditPage:26-31` — disengaja, dijelaskan di komentar, tapi luas | Billing 543, 684, 725, 864, 892, 901 |
| B12 | `auditData.backgroundColor` hanya **6 warna** (231) sementara `auditActions` bisa ditambah tanpa batas → warna melingkar/berubah untuk status ke-7+ | Billing 231 |

### C. Keputusan yang sudah sengaja dibuat (bukan bug)

| # | Keputusan | Alasan |
|---|---|---|
| C1 | `updateAudit` bersifat **optimistis**, `confirmPaid` **tidak** | Komentar eksplisit; inkonsistensi ini disengaja per konteks risiko |
| C2 | Semua `.catch(() => {})` senyap | Dipilih agarcea fallback lokal tidak hilang karena satu request gagal |
| C3 | Hapus tombol PDF **selalu aktif** termasuk baris macet | Komentar 326-327 — agar user bisa membersihkan sendiri |
| C4 | Pratinjau PDF via `window.open` sinkron + arahkan langsung ke presigned inline | Komentar 246-249 — bebas CORS, anti popup-blocker, tidak memicu download |
| C5 | File PDF **tidak melewati server** (PUT langsung ke R2) | Presigned URL, skalabilitas |
| C6 | Status `MENUNGGU` & `INVOICE TERBIT` terkunci | Kunci integritas alur invoice |
| C7 | `DELETE /pdf/:id` **fail-closed** | Komentar M5 — R2 gagal → data dipertahankan, retry tetap mungkin |
| C8 | Enum `DIKIRIM`/`PAID` **tidak di-rename**, hanya label tampilan | `CLAUDE.md` §3.4 + §5.2 |
| C9 | **Tidak ada dropdown ubah status invoice manual** | Komentar 69-74 — status murni hasil alur, bukan input user |

### D. Aksesibilitas — ringkasan

| Komponen | Escape | Focus trap | Scroll lock |
|---|---|---|---|
| `ConfirmModal` | ✅ | ✅ fokus ke Batal (variant danger) | ✅ |
| `CaseDetailModal` | ✅ | ✅ fokus ke tombol tutup | ✅ |
| `DeleteConfirmModal` | ✅ | ✅ | ✅ |
| `InvoiceHistoryModal` | ✅ | ✅ | ✅ |
| **Modal PAID** (inline, Finance 1043-1093) | ❌ **tidak ada** | ❌ | ❌ **tidak ada** |
| **Modal Master Status** (Billing 808-945) | ❌ **tidak ada** | ❌ | ❌ |

---

## Lampiran A — Ringkasan Anti-Pola yang Harus Dijaga

Dari `CLAUDE.md` §5 dan temuan di atas:

1. **Jangan rename enum** `DIKIRIM`/`PAID`/`MENUNGGU INVOICE`/`INVOICE TERBIT` —
   ubah hanya label tampilan lewat `invLabel()`.
2. **Jangan percaya `x-user-email`** untuk otorisasi — tulis wajib lewat `x-auth-token`.
3. **Jangan tulis SQL tanpa `esc()`** dari `backend/src/db/sql.ts`; jangan definisikan
   `esc` lokal/inline.
4. **Jangan tulis balik ke Google Sheets** — sync satu arah.
5. **Jangan tambah fitur di luar PRD** tanpa persetujuan: bulk read status,
   export server-side, Redis cache, partisi tabel per bulan, tulis balik ke Sheets.
6. **Jangan kosongkan/reset DB** tanpa izin eksplisit; instance uji selalu di port
   `:5006` dengan `DATABASE_URL=` kosong.

## Lampiran B — Verifikasi CLI

```bash
# unit test pajak (pernyata §9.1)
cd frontend && node --test test/taxSummary.test.mjs     # 24 pass

# TaxSummaryPanel (pernyata §9.1)
ls frontend/src/components/TaxSummaryPanel.jsx          # No such file

# nol dukungan pajak di backend
grep -rniE "\b(ppn|pph|tax|pajak)\b" backend/src         # 0 hasil

# status branch
git -C /home/revota/Desktop/project-work/SPRITE-CUST_v2 \
  log --oneline main..HEAD
# a92c5bd ✅ test(frontend): lib taxSummary …  ← hanya lib + test
# baaf146 📝 docs(superpowers): implementation plan …
# 27f9d86 📝 docs(superpowers): revisi spec …
# 2c37ac4 📝 docs(superpowers): spec PPN/PPH & subtotal …
```
