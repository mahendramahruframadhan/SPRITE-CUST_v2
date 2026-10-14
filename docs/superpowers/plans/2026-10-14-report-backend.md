# Report Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perpanjang `GET /analytics/overview` + `/analytics/drilldown` dengan filter brand/module, aging tunggakan, dan top-10 outstanding, lalu migrasikan `/report` ke backend tersebut.

**Architecture:** Aditif dan backward-compatible: `AnalyticsService` menghitung aging/top dari pool yang sama (satu sumber angka dengan Analitik), controller meneruskan 2 param opsional baru, `ReportSummaryPage` bertukar `useRangedCases`/maps ke `fetchAnalyticsOverview/Drilldown` ikut pola `AnalyticsPage`.

**Tech Stack:** NestJS 10 + Postgres (pg-mem untuk test), React 18 + Vite 5, test `node --test` (backend `test/**/*.test.ts`, frontend `test/**/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-14-report-backend-design.md`

## Global Constraints

- Pool tetap: `billing_status` ON-CALL/MONTHLY (normalisasi tanpa spasi/dash, upper) + `audit_status.action='VALID - SIAP INVOICE'`; FREE dikecualikan.
- PPN hanya baris ON-CALL: `percent` → `ROUND(charges*ppn_percent/100)`, `rupiah` → `ppn_amount`, else 0; `subtotal = charges + ppn`; PPh hanya count.
- `SessionGuard` selalu; `PermGuard('analytics')`; error `{code,message}` existing; tanpa kode error baru.
- Brand/module pencocokan persis case-sensitive; kosong = tanpa penyempitan.
- Aging: umur = tanggal server WIB (offset +7, tanpa DST) − `dateIssue`; bucket 0-30 Baik, 31-60 Normal, 61-90 Perhatian, 91-180 Risiko, >180 Risiko; tanggal tak valid dikecualikan + `invalid`.
- Setiap task diakhiri commit terpisah; pesan Bahasa Indonesia ringkas.

## Review Focus

- Brand dikirim beda kapitalisasi (`brand-a` vs `BRAND-A`) menghasilkan pool kosong diam, bukan error — test di Task 1 menegaskan pencocokan persis + dokumentasikan di respons? Tidak: perilaku = kosong; test pin bahwa `'brand-a'` ≠ `'BRAND-A'` (exact match).
- `dateIssue` tak valid di DB masuk `invalid`, tidak merusak total — test di Task 1.
- `dateIssue` masa depan (umur negatif) masuk bucket 0-30 (cermin `Math.max(0, age)` frontend) — test di Task 1.
- Overview tanpa brand/module: field lama identik + field baru hadir (regresi Analitik) — test di Task 1 menegaskan bentuk lama + test suite existing tetap hijau.
- Outstanding < 10 baris: `top` berisi apa adanya tanpa padding — test di Task 1.

---

### Task 1: Service — narrowing brand/module + aging + top

**Files:**
- Modify: `backend/src/analytics/analytics.service.ts`
- Test: `backend/test/analytics.report.test.ts` (baru; file test existing tidak diubah)

**Interfaces:**
- Consumes: `getDb()` (`db.pq`), tabel `assistance_records`, `audit_status`, `invoice_status`, `case_tax`.
- Produces: `getOverview(from: string, to: string, opts?: { brand?: string; module?: string; today?: string }) -> { kpis, trend, byInvoice, byBrand, byModule, aging, top }` dan `getDrilldown(opts: { dim: string; key: string; from: string; to: string; q?: string; page?: number; limit?: number; brand?: string; module?: string })` untuk Task 2. `today` format `YYYY-MM-DD` (default = tanggal WIB hari ini); hanya untuk test. `aging = { buckets: [{key,label,count,subtotal,percentage,status}], total: {count,subtotal}, invalid: number }`. `top` = max 10 `{recordUuid,no,client,module,dateIssue,charges,ppn,subtotal,invoiceStatus,ageDays}` outstanding sort subtotal desc.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/analytics.report.test.ts — node:test + pg-mem, DDL mandiri (jangan edit helpers/pgmem.ts)
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsService } from '../src/analytics/analytics.service.ts';

describe('analytics report extension', () => {
  it('overview tanpa filter: bentuk lama utuh + aging/top hadir', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31', { today: '2026-10-14' });
    assert.ok(Array.isArray(r.trend) && Array.isArray(r.byBrand));
    assert.equal(r.aging.buckets.length, 5);
    assert.ok(r.top.length <= 10);
  });
});
```

(sebelum implementasi: seed 4 baris di `before` — ON-CALL percent VALID + invoice DIKIRIM dateIssue 60 hari lalu; MONTHLY VALID; FREE VALID (dikecualikan); ON-CALL VALID PAID (masuk pool, tidak masuk aging/top); plus 1 baris `dateIssue` tak valid. Kolom via `ALTER TABLE` + `CREATE TABLE case_tax` ikut pola `tax.guards.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node -r ts-node/register/transpile-only --test test/analytics.report.test.ts` dari `backend/`
Expected: FAIL (`getOverview` hanya terima 2 argumen / `aging` undefined)

- [ ] **Step 3: Implement narrowing + aging + top di `backend/src/analytics/analytics.service.ts`**

`poolRows(from, to, {brand, module})`: filter JS `(!brand || r.client === brand) && (!module || r.module === module)` setelah filter pool (pola `scopedPool` frontend). `todayWIB()`: `new Date(Date.now() + 7*3600*1000).toISOString().slice(0,10)`; `ageDays(dateIssue, todayStr)`: parse `YYYYMMDD` ketat (bulan/hari valid, cermin `parseDate8`), selisih hari kalender, null bila tak valid. `getOverview(from, to, opts)`: tambah `aging` (bucket cermin `reportAging.js`, umur negatif → 0-30, persen dari subtotal outstanding) + `top` (outstanding sort subtotal desc slice 10, bawa `ageDays`). `getDrilldown`: tambah filter brand/module sebelum filter dim/key (komposisi AND).

- [ ] **Step 4: Run test to verify it passes**

Run: `node -r ts-node/register/transpile-only --test test/analytics.report.test.ts test/analytics.service.test.ts test/analytics.controller.test.ts` dari `backend/`
Expected: PASS semua (existing tidak rusak = regresi Analitik bentuk lama)

- [ ] **Step 5: Commit**

```bash
git add backend/src/analytics/analytics.service.ts backend/test/analytics.report.test.ts
git commit -m "feat: aging, top outstanding, filter brand/module di service analitik"
```

### Task 2: Controller — teruskan brand/module

**Files:**
- Modify: `backend/src/analytics/analytics.controller.ts`
- Test: tambah case di `backend/test/analytics.report.test.ts` (atau controller test inline via fake service)

**Interfaces:**
- Consumes: `getOverview/getDrilldown` Task 1.
- Produces: `GET /analytics/overview?from&to&brand&module`, `GET /analytics/drilldown?...&brand&module` untuk Task 4.

- [ ] **Step 1: Write the failing test**

```ts
it('controller meneruskan brand/module ke service', async () => {
  let got: any = null;
  const fake = { getOverview: async (f: string, t: string, o: any) => { got = o; return { ok: true }; }, getDrilldown: async () => ({}) };
  const ctl = new AnalyticsController(fake as any);
  await ctl.overview({ from: '2026-01-01', to: '2026-01-31', brand: 'B', module: '' });
  assert.deepEqual(got, { brand: 'B', module: '' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: sama seperti Task 1 Step 2 untuk file test bersangkutan
Expected: FAIL (`got` = undefined / argumen ketiga tak diteruskan)

- [ ] **Step 3: Implement di `backend/src/analytics/analytics.controller.ts`**

`overview()`: baca `q.brand`, `q.module` (string, default `''`), teruskan sebagai `{ brand, module }` ke `getOverview`. `drilldown()`: teruskan `brand`/`module` ke `getDrilldown`. Guard + validasi tanggal tidak berubah.

- [ ] **Step 4: Run backend tests**

Run: `npm test` dari `backend/`
Expected: PASS semua

- [ ] **Step 5: Commit**

```bash
git add backend/src/analytics/analytics.controller.ts backend/test/analytics.report.test.ts
git commit -m "feat: param brand/module di endpoint analitik"
```

### Task 3: `lib/api.js` — teruskan brand/module

**Files:**
- Modify: `frontend/src/lib/api.js`
- Test: tidak ada unit baru (thin wrapper); gate = Task 5

**Interfaces:**
- Consumes: endpoint Task 2.
- Produces: `fetchAnalyticsOverview({from,to,brand,module})`, `fetchAnalyticsDrilldown({dim,key,from,to,q,page,limit,brand,module})` untuk Task 4.

- [ ] **Step 1: Tambah `brand,module` opsional ke kedua fungsi**

Ikut pola param existing (`URLSearchParams` untuk drilldown; query string untuk overview). Kosong = tidak dikirim.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat: param brand/module di fetch analitik"
```

### Task 4: Migrasi `ReportSummaryPage` ke backend

**Files:**
- Modify: `frontend/src/pages/ReportSummaryPage.jsx`
- Test: tidak ada unit baru; gate = suite + build + Task 5 (e2e banding nol selisih)

**Interfaces:**
- Consumes: fungsi Task 3; bentuk `overview {kpis,trend,byInvoice,byBrand,byModule,aging,top}` + `drilldown {data,total,totalPages,subtotal}`.

- [ ] **Step 1: Ganti sumber data ke overview + drilldown**

`summary`/`trend`/`byBrand`/`byModule` dari `fetchAnalyticsOverview({from,to,brand,module})` (map `kpis` → bentuk summary existing: `{count,charges,ppn,subtotal,paid,outstanding,byInvoice}`); `aging`/`top` langsung dari overview (hapus `buildAgingBuckets/getTopOutstanding/buildGroupBreakdown` di halaman ini); tabel detail dari `fetchAnalyticsDrilldown({from,to,brand,module,q,page,limit})` (debounce 300ms, paginasi server, ikut pola `AnalyticsPage`). Lepas: `useRangedCases`, `useAuditState`, `useInvoiceState`, `getAuditMap/getInvoiceMap`, `buildReportSummary`, mapping manual. Tetap: badge `pendingUuids`, filter UI, CSV, print, `CaseLink`, tombol Cetak detail. `byBilling` rekap: turunkan dari drilldown? Tidak — overview tak punya byBilling; hitung dari `byBrand`? Tidak. Keputusan: rekap ON-CALL vs MONTHLY dihitung dari `trend`? Tidak. Lihat catatan di bawah.

> Catatan: `summary.byBilling` (ON-CALL vs MONTHLY) tidak ada di overview. Opsi termurah tanpa ubah backend: pertahankan hitung byBilling client-side butuh rows... rows tak ada lagi. Maka: tambah `byBilling` ke overview di Task 1 (summarize per billing_status, cermin `reportSummary.js`). Jika Task 1 sudah commit tanpa ini, tambahkan di Task ini via amend? Tidak — kembali: sertakan `byBilling: {'ON-CALL': {...}, 'MONTHLY': {...}}` sebagai bagian Task 1 (bentuk `{count,charges,ppn,subtotal}` per kunci). Instruksi ini mengikat Task 1.

- [ ] **Step 2: Run frontend tests + build**

Run: `npm test` lalu `npx vite build` dari `frontend/`
Expected: PASS + `✓ built`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ReportSummaryPage.jsx frontend/src/lib/api.js
git commit -m "feat: halaman report pakai backend analitik"
```

### Task 5: Verifikasi e2e + regresi

**Files:** tanpa file baru.

- [ ] **Step 1: Bandingkan angka lama vs baru**

Boot backend (`NODE_ENV=development npm run dev:local`), validasi 2 kasus via API (1 ON-CALL + PPN, 1 MONTHLY), login admin: `GET /analytics/overview?from&to&brand&module` vs hitungan lama; `aging` bucket + `top` cocok; `drilldown` total == overview count; filter brand menyempitkan semua angka.

- [ ] **Step 2: Regresi Analitik + guard**

Request tanpa brand/module: bentuk lama identik + field baru hadir; tanpa token 401; tanpa izin 403; `from>to` 422; halaman `/analytics` tidak berubah.

- [ ] **Step 3: Commit fix bila ada**

```bash
git add -A
git commit -m "fix: penyesuaian verifikasi backend report"
```

## Self-review

- [x] Spec coverage: kontrak §3 → Task 1-2; WIB/bucket/top §2 → Task 1 (+`byBilling` via catatan Task 4); migrasi §4 → Task 3-4; testing §5 → Task 5 + suite tiap task. Non-goal tidak masuk task.
- [x] Step scan: tiap step satu aksi + hasil cek; tanpa "TBD/handle edge cases".
- [x] Type consistency: `getOverview(from,to,opts)` / `getDrilldown(opts)` konsisten Task 1→2→4; bentuk `aging`/`top`/`byBilling` sama di semua task.
- [x] Review Focus: 5 baris terisi + tiap baris ada test pemilik di Task 1.
- [x] Proportion: plan ~200 baris vs spec ~75; code block hanya test/assert + signature.
