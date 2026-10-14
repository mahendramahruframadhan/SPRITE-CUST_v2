# Analytics Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend analitik read-only (overview + drilldown Brand/Module) dan refactor AnalyticsPage memakai backend baru.

**Architecture:** Modul NestJS baru `analytics/` dengan raw SQL parametrized ikut pola `cases.service.ts:findAll` + `billing.controller.ts:taxMap`; frontend tambah 2 fetch di `lib/api.js` dan ganti agregasi client-side di `AnalyticsPage.jsx` saja.

**Tech Stack:** NestJS 10 + Postgres (pg-mem untuk test), React 18 + Vite 5, test `node --test` (backend `test/**/*.test.ts`, frontend `test/**/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-14-analytics-backend-design.md`

## Global Constraints

- Pool tetap: `billing_status` ON-CALL/MONTHLY (normalisasi tanpa spasi/dash, upper) + `audit_status.action='VALID - SIAP INVOICE'`; FREE dikecualikan.
- PPN hanya baris ON-CALL: `percent` → `ROUND(charges*ppn_percent/100)`, `rupiah` → `ppn_amount`, else 0; `subtotal = charges + ppn`; PPh hanya count.
- Read-only: tidak ada POST/PATCH/PUT/DELETE baru; `SessionGuard` selalu; `PermGuard('analytics')` dengan fallback `Perm('finance')` bila key belum ada.
- Semua filter SQL sebagai parameter `$n`; `page/limit` clamp max 100.
- Setiap task diakhiri commit terpisah; pesan Bahasa Indonesia ringkas.

## Review Focus

- `from > to` harus 422 `ANALYTICS_INVALID_RANGE`, bukan hasil kosong diam — test di Task 2, UI tampilkan banner.
- `ppn_mode` NULL/kosong harus PPN 0, bukan NaN/NULL merambat ke subtotal — test di Task 1.
- MONTHLY harus kontribusi PPN 0 walau `case_tax` ada barisnya — test di Task 1.
- User tanpa izin `analytics`/`finance` harus 403 + menu hilang, bukan 401 logout — test guard di Task 2.
- `dim` selain `brand|module` harus 422 `ANALYTICS_INVALID_DIM` — test di Task 2.

---

### Task 1: `AnalyticsService` — agregasi SQL overview + drilldown

**Files:**
- Create: `backend/src/analytics/analytics.service.ts`
- Test: `backend/test/analytics.service.test.ts`

**Interfaces:**
- Consumes: `getDb()` dari `../db/drizzle.service` (`db.pq(sql, params)` + `db.execute(sql)`), tabel `assistance_records`, `audit_status`, `invoice_status`, `case_tax`.
- Produces: `getOverview(from: string, to: string) -> { kpis, trend, byInvoice, byBrand, byModule }` dan `getDrilldown({dim, key, from, to, q, page, limit}) -> { data, total, page, limit, totalPages, subtotal }` untuk Task 2. Bentuk row `data` camelCase sama seperti `cases.service.ts:mapRow`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/analytics.service.test.ts — ikut gaya billing.flow.test.ts (node:test + pg-mem helpers)
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedCase, db } from './helpers/pgmem.ts';
import { AnalyticsService } from '../src/analytics/analytics.service.ts';

describe('analytics service', () => {
  it('overview: pool VALID saja, PPN percent ON-CALL, MONTHLY PPN 0', async () => {
    const svc = new AnalyticsService();
    const r: any = await svc.getOverview('2026-01-01', '2026-12-31');
    assert.equal(r.kpis.count, 2);
    assert.equal(r.kpis.subtotal, 3110000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/analytics.service.test.ts` dari `backend/`
Expected: FAIL (`analytics.service.ts` belum ada)

- [ ] **Step 3: Implement `AnalyticsService` di `backend/src/analytics/analytics.service.ts`**

JOIN `assistance_records r LEFT JOIN audit_status a USING(record_uuid) LEFT JOIN invoice_status i USING(record_uuid) LEFT JOIN case_tax t USING(record_uuid)`; WHERE pool VALID + `date_issue BETWEEN $from AND $to` (strip `-`); PPN per rumus spec; grup bulan (`substring(date_issue,1,6)`), brand (`client`), module, invoice (`COALESCE(i.status,'MENUNGGU INVOICE')`); drilldown tambah filter `dim/key` + search `lower(client||' '||issue||' '||coalesce(pic_name,'')) LIKE $n` + `LIMIT/OFFSET` + count terpisah. Tambah test untuk: FREE dikecualikan, PPN rupiah, `ppn_mode` NULL → 0, PPh count, `byBrand/byModule` sum.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/analytics.service.test.ts` dari `backend/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/analytics/analytics.service.ts backend/test/analytics.service.test.ts
git commit -m "feat: service agregasi analitik overview+drilldown"
```

### Task 2: `AnalyticsController` + guard + wiring `AppModule`

**Files:**
- Create: `backend/src/analytics/analytics.controller.ts`
- Modify: `backend/src/app.module.ts:28-31`
- Test: `backend/test/analytics.controller.test.ts`

**Interfaces:**
- Consumes: `getOverview`, `getDrilldown` dari Task 1; `SessionGuard` dari `../auth/session.guard`, `Perm, PermGuard` dari `../auth/perm.guard`.
- Produces: `GET /analytics/overview?from&to`, `GET /analytics/drilldown?dim&key&from&to&q&page&limit` untuk Task 3.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsController } from '../src/analytics/analytics.controller.ts';

describe('analytics controller guard', () => {
  it('from > to ditolak 422 ANALYTICS_INVALID_RANGE', async () => {
    const ctl = new AnalyticsController({} as any);
    await assert.rejects(() => ctl.overview({ from: '2026-10-02', to: '2026-10-01' }), (e: any) => e?.response?.code === 'ANALYTICS_INVALID_RANGE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/analytics.controller.test.ts` dari `backend/`
Expected: FAIL

- [ ] **Step 3: Implement `AnalyticsController` di `backend/src/analytics/analytics.controller.ts` + daftarkan di `app.module.ts`**

`@UseGuards(SessionGuard)` di class; `@UseGuards(PermGuard) @Perm('analytics')` per method dengan fallback `Perm('finance')` bila key belum ada (catat pilihan di kode); validasi `from/to YYYY-MM-DD` + `from>to` → 422, `dim` hanya `brand|module` → else 422, `page/limit` clamp max 100. Daftarkan controller + service di `app.module.ts:30-31`. Tambah test: `dim` invalid 422, tanpa token 401 (via guard), paginasi clamp.

- [ ] **Step 4: Run backend tests**

Run: `npm test` dari `backend/`
Expected: PASS (termasuk test Task 1 + existing `billing.flow`, `read.perms`)

- [ ] **Step 5: Commit**

```bash
git add backend/src/analytics/analytics.controller.ts backend/src/app.module.ts backend/test/analytics.controller.test.ts
git commit -m "feat: endpoint analitik overview+drilldown + guard"
```

### Task 3: Frontend — `api.js` + refactor `AnalyticsPage.jsx`

**Files:**
- Modify: `frontend/src/lib/api.js:184-197`
- Modify: `frontend/src/pages/AnalyticsPage.jsx`
- Test: manual (tidak ada unit baru; lib murni existing tidak diubah)

**Interfaces:**
- Consumes: `GET /analytics/overview`, `GET /analytics/drilldown` dari Task 2.
- Produces: halaman `/analytics` tampil sama dengan data server untuk Task 4.

- [ ] **Step 1: Tambah `fetchAnalyticsOverview({from,to})` + `fetchAnalyticsDrilldown({dim,key,from,to,q,page,limit})` di `frontend/src/lib/api.js`**

Ikut pola `fetchCasesByGroupKpi`: `get()` + gabung tanpa cache global untuk drilldown paginated; overview tanpa paginasi.

- [ ] **Step 2: Refactor `AnalyticsPage.jsx` ke backend baru**

`trend/distData/kpis/kolektibilitas` dari `/overview`; tabel detail dari `/drilldown` (server-side `q/page/limit`); hapus `useRangedCases`, `buildMonthlyTrend`, `buildReportSummary`, `getAuditMap/getInvoiceMap` sync di file ini; hapus komentar `tanpa backend baru`; pertahankan skeleton, banner error (`Backend tidak terjangkau — ...`), paginasi, varian kartu HP.

- [ ] **Step 3: Run frontend tests + typecheck visual**

Run: `npm test` dari `frontend/`
Expected: PASS (24+ test existing tidak rusak)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.js frontend/src/pages/AnalyticsPage.jsx
git commit -m "feat: halaman analitik pakai backend overview+drilldown"
```

### Task 4: Verifikasi e2e + regresi

**Files:** tanpa file baru (cek manual + catat hasil di PR/commit message bila perlu).

- [ ] **Step 1: Bandingkan angka lama vs baru**

Login `admin@revota.id` → `/analytics` periode 6 bulan terakhir: tren/KPI/byInvoice sama dengan versi sebelum Task 3 (toleransi 0); klik Brand/Module → drilldown rows + subtotal cocok dengan filter tabel lama.

- [ ] **Step 2: Cek guard + error**

Tanpa token → 401 + redirect login sekali; tanpa izin → 403 + menu hilang; `from>to` → banner 422; `dim` invalid → 422.

- [ ] **Step 3: Regresi halaman lain**

Buka `/report`, `/billing`, `/finance`: angka + filter tidak berubah (lib lama tidak dihapus).

- [ ] **Step 4: Commit hasil verifikasi bila ada fix**

```bash
git add -A
git commit -m "fix: penyesuaian verifikasi analitik backend"
```

## Self-review

- [x] Spec coverage: overview+drilldown (Task 1-2), guard/error/performa (Task 2), refactor frontend (Task 3), testing+regresi (Task 1,2,4). Non-goal (export/YoY/cache) tidak masuk task.
- [x] Step scan: tiap step satu aksi + hasil cek jelas; tanpa "TBD/handle edge cases".
- [x] Type consistency: `getOverview/getDrilldown` didefinisikan Task 1, dipakai Task 2-3 dengan nama sama; row camelCase ikut `mapRow`.
- [x] Review Focus: 5 baris terisi + tiap baris ada test pemilik (Task 1 untuk PPN/MONTHLY, Task 2 untuk range/dim/guard).
- [x] Proportion: plan ~150 baris vs spec ~80 baris; code block hanya test/assert + signature, bukan transcript program.
