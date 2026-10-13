# Backend Pajak Per Transaksi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-row ON-CALL tax (PPN entry + PPH status) in Postgres with strict validation, and sync the Finance frontend to it via an outbox cache.

**Architecture:** Mirror the existing `audit_status`/`invoice_status` pattern end to end: new `case_tax` table, `GET billing/tax-map` plus `PATCH cases/:uuid/tax` on `BillingController` with 422 guards, then frontend `useFinanceTax` treats the server map as truth with localStorage as ack-evicted outbox.

**Tech Stack:** NestJS + raw SQL (pg-mem for backend tests), React+Vite, node:test, e2e runner.

**Spec:** `docs/superpowers/specs/2026-10-13-finance-tax-backend-design.md`

## Global Constraints

- R-02: no em dash character in any agent-written text (code, comments, tests, docs).
- Do NOT modify others' dirty files: `backend/src/auth/*`, `backend/src/roles/roles.controller.ts`, `backend/src/config/env.ts`, `backend/src/main.ts`, `backend/src/setup/*`, `backend/src/shots/*`, `backend/test/helpers/pgmem.ts`, `backend/test/auth.*`, `backend/test/roles.*`, `backend/test/config.trust-proxy.*`. Backend tax tests must be self-contained (own DDL, no edits to the helper).
- Backend conventions: class-level `SessionGuard`, `@Perm('finance')` on tax endpoints, raw SQL via `db.pq`/`db.execute`, upsert `ON CONFLICT (record_uuid) DO UPDATE`, `logActivity` on writes, `HttpException` with `{code, message}` bodies.
- Frontend: localStorage key stays `finance-tax-v2` (now outbox-only); sanitize everything read via `sanitizeTaxMap`/`sanitizeRowTax`; `TaxCell`/`TaxModal` keep their current props except an added `pending` flag on `TaxCell`.
- TDD: every task starts with a failing test; commit once per task.

## Review Focus

- Sheets sync changes a row's charges after a percent PPN was saved, then the row re-renders. Expected: subtotal follows the latest charges (percent always resolves against current charges). Pinned by a unit test in Task 4.
- A hand-rolled client sends percent as string `"10"`. Expected: strict 422 `TAX_INVALID`, no silent coerce. Pinned by a test in Task 3.
- Two browsers save tax on the same row. Expected: last write wins, no error, map shows the latest. Pinned by a test in Task 2.
- Save happens while offline. Expected: entry stays in outbox, chip shows pending, nothing is lost, retry succeeds later. Pinned by unit tests in Task 4.
- Fresh DB (empty `case_tax`) plus stale localStorage entries. Expected: GET returns an empty map without crashing, and stale local entries stay visible until flushed. Pinned by tests in Task 1 and Task 4.

---

### Task 1: Tabel case_tax dan GET tax-map

**Files:**
- Modify: `backend/src/db/init.ts` (add CREATE TABLE after the invoice_status line)
- Modify: `backend/src/db/schema.pg.ts` (add pgTable mirror after invoiceStatus, reusing imported text/real/integer)
- Modify: `backend/src/billing/billing.controller.ts` (add GET handler only)
- Create: `backend/test/tax.map.test.ts`

**Interfaces:**
- Consumes: `getDb`, `logActivity` (not needed for GET), existing `BillingController` class.
- Produces: table `case_tax`; `GET billing/tax-map` returning `{ ok: true, map }` where map values are `{ ppn: { mode, percent, amount } | null, pph: boolean }`.

- [ ] **Step 1: Write the failing test**

In `backend/test/tax.map.test.ts`, mirror `billing.flow.test.ts` setup (pg-mem, Super Admin token, `BillingController` direct calls). In `before()`, call `setupTables()`, then run self-contained DDL (do not edit the helper): `CREATE TABLE IF NOT EXISTS case_tax (record_uuid TEXT PRIMARY KEY, ppn_mode TEXT, ppn_percent REAL, ppn_amount INTEGER, pph INTEGER DEFAULT 0, updated_by TEXT, updated_at TEXT)`.

```ts
it('tax-map kosong saat tabel baru', async () => {
  const m: any = await ctl.taxMap();
  assert.equal(m.ok, true);
  assert.deepEqual(m.map, {});
});
it('tax-map memantulkan baris case_tax', async () => {
  await db().execute(`INSERT INTO case_tax (record_uuid, ppn_mode, ppn_percent, ppn_amount, pph, updated_at) VALUES ('tax-row-1','percent',10,0,1,'x')` as any);
  const m: any = await ctl.taxMap();
  assert.deepEqual(m.map['tax-row-1'], { ppn: { mode: 'percent', percent: 10, amount: 0 }, pph: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/tax.map.test.ts`
Expected: FAIL (controller has no `taxMap` method, table missing).

- [ ] **Step 3: Implement the table and the GET handler**

Add the CREATE TABLE line to `init.ts`, the `caseTax` pgTable to `schema.pg.ts`, and to `BillingController` a `@Get('billing/tax-map')` handler guarded by `PermGuard` + `@Perm('finance')` that selects all rows and maps `pph` INTEGER to boolean and NULL `ppn_mode` to `ppn: null`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/tax.map.test.ts`
Expected: PASS. Also run `test/billing.flow.test.ts` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/init.ts backend/src/db/schema.pg.ts backend/src/billing/billing.controller.ts backend/test/tax.map.test.ts
git commit -m "feat(backend): tabel case_tax dan GET billing/tax-map"
```

### Task 2: PATCH tax alur sukses

**Files:**
- Modify: `backend/src/billing/billing.controller.ts` (add PATCH handler)
- Create: `backend/test/tax.patch.test.ts`

**Interfaces:**
- Consumes: `case_tax` table and `taxMap` shape from Task 1.
- Produces: `PATCH cases/:uuid/tax` accepting `{ ppn, pph }`, returning `{ ok, recordUuid, tax }` with tax in map value shape; upsert semantics; activity log row.

- [ ] **Step 1: Write the failing tests**

In `backend/test/tax.patch.test.ts`, same self-contained setup as Task 1 plus `ALTER TABLE assistance_records ADD COLUMN billing_status TEXT` in `before()` (fresh pg-mem per file, so no IF NOT EXISTS needed), then seed one ON-CALL case via `seedCase` plus `UPDATE assistance_records SET billing_status='ON-CALL'`.

```ts
it('simpan PPN persen + PPH lalu terbaca di map', async () => {
  const r: any = await ctl.tax(UUID, { ppn: { mode: 'percent', percent: 10, amount: 0 }, pph: true }, reqWith(token));
  assert.equal(r.ok, true);
  assert.deepEqual(r.tax, { ppn: { mode: 'percent', percent: 10, amount: 0 }, pph: true });
  const m: any = await ctl.taxMap();
  assert.deepEqual(m.map[UUID], r.tax);
});
it('tulis kedua menimpa tulisan pertama (last-write-wins)', async () => {
  await ctl.tax(UUID, { ppn: { mode: 'rupiah', percent: 0, amount: 5000 }, pph: false }, reqWith(token));
  await ctl.tax(UUID, { ppn: null, pph: true }, reqWith(token));
  const m: any = await ctl.taxMap();
  assert.deepEqual(m.map[UUID], { ppn: null, pph: true });
});
it('reset PPN menyimpan NULL dan menulis log activity', async () => {
  await ctl.tax(UUID, { ppn: null, pph: false }, reqWith(token));
  const n: any = await db().execute(`SELECT COUNT(*) as c FROM activity_logs WHERE record_uuid='${UUID}'` as any);
  assert.ok(Number((n.rows || n)[0]?.c || 0) >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/tax.patch.test.ts`
Expected: FAIL (no `tax` method on controller).

- [ ] **Step 3: Implement happy-path `tax(uuid, body, req)` on `BillingController`**

`@Patch('cases/:uuid/tax')` with `PermGuard` + `@Perm('finance')`. This step covers only the happy path the tests above pin (valid body on an ON-CALL, non-PAID row): minimal shape read, upsert with `ON CONFLICT (record_uuid) DO UPDATE`, `logActivity` with category `Pajak`, return `{ ok, recordUuid, tax }` in map value shape. Guard branches (strict validation, PAID lock, ON-CALL check) belong to Task 3, which pins them with its own RED tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/tax.patch.test.ts test/tax.map.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/billing/billing.controller.ts backend/test/tax.patch.test.ts
git commit -m "feat(backend): PATCH cases/:uuid/tax dengan upsert dan log"
```

### Task 3: Guard PATCH (validasi ketat, kunci PAID, batas ON-CALL)

**Files:**
- Modify: `backend/src/billing/billing.controller.ts` (tighten validation branches)
- Create: `backend/test/tax.guards.test.ts`

**Interfaces:**
- Consumes: PATCH handler from Task 2.
- Produces: exact rejection codes `TAX_INVALID`, `TAX_PAID_LOCKED`, `TAX_NOT_ONCALL`, 404 for unknown uuid.

- [ ] **Step 1: Write the failing tests**

In `backend/test/tax.guards.test.ts`, same self-contained setup as Task 2 (ON-CALL seeded case plus local helpers to set invoice status and billing status via SQL):

```ts
async function setInvoice(uuid: string, status: string) {
  await db().execute(
    `INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ('${esc(uuid)}','${esc(status)}','${new Date().toISOString()}') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status` as any,
  );
}
async function setBilling(uuid: string, status: string) {
  await db().execute(`UPDATE assistance_records SET billing_status='${esc(status)}' WHERE record_uuid='${esc(uuid)}'` as any);
}
```

```ts
it('mode tak dikenal ditolak TAX_INVALID', async () => {
  await assert.rejects(() => ctl.tax(UUID, { ppn: { mode: 'manual', percent: 0, amount: 5 }, pph: false }, reqWith(token)), (e: any) => e?.response?.code === 'TAX_INVALID');
});
it('persen string, persen > 100, persen 0, rupiah desimal, rupiah negatif, pph non-boolean ditolak', async () => {
  const bad = [
    { ppn: { mode: 'percent', percent: '10', amount: 0 }, pph: false },
    { ppn: { mode: 'percent', percent: 150, amount: 0 }, pph: false },
    { ppn: { mode: 'percent', percent: 0, amount: 0 }, pph: false },
    { ppn: { mode: 'rupiah', percent: 0, amount: 10.5 }, pph: false },
    { ppn: { mode: 'rupiah', percent: 0, amount: -5 }, pph: false },
    { ppn: null, pph: 'ya' },
  ];
  for (const b of bad) await assert.rejects(() => ctl.tax(UUID, b, reqWith(token)), (e: any) => e?.response?.code === 'TAX_INVALID');
});
it('baris PAID dikunci TAX_PAID_LOCKED', async () => {
  await setInvoice(UUID, 'PAID');
  await assert.rejects(() => ctl.tax(UUID, { ppn: null, pph: true }, reqWith(token)), (e: any) => e?.response?.code === 'TAX_PAID_LOCKED');
});
it('baris non-ON-CALL ditolak TAX_NOT_ONCALL; uuid tak ada 404', async () => {
  await setBilling(UUID, 'MONTHLY');
  await assert.rejects(() => ctl.tax(UUID, { ppn: null, pph: true }, reqWith(token)), (e: any) => e?.response?.code === 'TAX_NOT_ONCALL');
  await assert.rejects(() => ctl.tax('no-such-case', { ppn: null, pph: false }, reqWith(token)), (e: any) => e?.status === 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/tax.guards.test.ts`
Expected: FAIL (guards missing; invalid input currently accepted).

- [ ] **Step 3: Implement the guard branches in `tax()`**

In the order pinned by the tests: body-shape validation raising `TAX_INVALID`, then case-exists check (404), then billing_status check raising `TAX_NOT_ONCALL`, then invoice-status check raising `TAX_PAID_LOCKED` when uppercased status is PAID (missing invoice row means editable).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/tax.guards.test.ts test/tax.patch.test.ts test/tax.map.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/billing/billing.controller.ts backend/test/tax.guards.test.ts
git commit -m "feat(backend): guard PATCH tax (validasi, kunci PAID, batas ON-CALL)"
```

### Task 4: Sinkron frontend (api, helper murni, hook)

**Files:**
- Modify: `frontend/src/lib/api.js` (add `getTaxMap`, `patchTax`)
- Modify: `frontend/src/lib/taxSummary.js` (add `mergeTaxMaps`, `applySaveResult`)
- Modify: `frontend/test/taxSummary.test.mjs` (unit for the two helpers plus percent-follows-charges)
- Modify: `frontend/src/hooks/useFinanceTax.js` (load/merge/flush/retry/pending)
- Modify: `frontend/src/components/TaxCell.jsx` (accept and render `pending` flag)

**Interfaces:**
- Consumes: `GET billing/tax-map` and PATCH contract from Tasks 1-2.
- Produces: `getTaxMap()`, `patchTax(uuid, {ppn, pph})`; `mergeTaxMaps(server, outbox)` returning row-level merge with outbox winning; `applySaveResult(outbox, uuid, ok)` returning the outbox minus uuid on success, unchanged on failure; hook returning `{ taxMap, pendingUuids, setPpn, togglePph, flushOutbox }`.

- [ ] **Step 1: Write the failing unit tests**

Append describes to `frontend/test/taxSummary.test.mjs`:

```ts
describe('mergeTaxMaps (outbox menang per baris)', () => {
  it('server kosong + outbox tampil apa adanya', () =>
    assert.deepEqual(mergeTaxMaps({}, { a: { ppn: null, pph: true } }), { a: { ppn: null, pph: true } }));
  it('baris outbox menimpa baris server seutuhnya', () =>
    assert.deepEqual(
      mergeTaxMaps({ a: { ppn: { mode: 'rupiah', percent: 0, amount: 1 }, pph: false } }, { a: { ppn: null, pph: true } }),
      { a: { ppn: null, pph: true } }));
});
describe('applySaveResult (evict-on-ack)', () => {
  it('sukses menghapus key dari outbox', () =>
    assert.deepEqual(applySaveResult({ a: { ppn: null, pph: true } }, 'a', true), {}));
  it('gagal mempertahankan key (data tak hilang)', () =>
    assert.deepEqual(applySaveResult({ a: { ppn: null, pph: true } }, 'a', false), { a: { ppn: null, pph: true } }));
});
```

Also add one `resolveTaxAmount` case pinning Review Focus item 1 (percent follows latest charges, e.g. same entry resolves 100000 on 1000000 charges and 50000 on 500000).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL (helpers missing).

- [ ] **Step 3: Implement `mergeTaxMaps` and `applySaveResult` in `taxSummary.js`**

Row-level spread merge with outbox winning; delete-key on ack, identity otherwise. Keep both pure and dependency-free.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS (full suite, no regressions).

- [ ] **Step 5: Wire `api.js` and `useFinanceTax.js` plus `TaxCell` pending flag**

Add one-line `getTaxMap`/`patchTax` wrappers mirroring `getAuditMap`/`patchAudit` (verified via e2e in Task 5, same as existing wrappers). Rework the hook: on mount GET the server map, sanitize it, merge the stored outbox, render, then flush pending rows in background; `setPpn`/`togglePph` update memory immediately, persist the outbox, PATCH, and evict the key on ack (keep plus toast on failure); retry on `online` event, on next load, and before the next save; expose `pendingUuids` and `flushOutbox`; pass `pending` into `TaxCell`, which renders a small pending marker with explanatory title text (presentational, reviewed visually; logic pinned by the unit tests above).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.js frontend/src/lib/taxSummary.js frontend/test/taxSummary.test.mjs frontend/src/hooks/useFinanceTax.js frontend/src/components/TaxCell.jsx
git commit -m "feat(frontend): sinkron pajak ke backend via outbox"
```

### Task 5: Verifikasi akhir

**Files:**
- Modify: `frontend/tests/finance-tax.e2e.ts` only if behavior drifted (save, reload, reset flows must pass unchanged against the server-backed hook).

**Interfaces:**
- Consumes: all tasks above.
- Produces: green verification record.

- [ ] **Step 1: Run the backend suite**

Run: `cd backend && npm test`
Expected: PASS including the three new tax files. Name any unrelated failing file explicitly in the report instead of silently ignoring it.

- [ ] **Step 2: Run the frontend unit suite**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 3: Run the finance e2e file**

Run: `cd frontend && npx e2e run tests/finance-tax.e2e.ts`
Expected: 6/6 PASS. If the hook rewrite changed timing or text, update the e2e with RED-first micro-steps (watch the updated assertion fail before fixing the hook, not after).

- [ ] **Step 4: Run the full e2e suite, lint, and build**

Run: `cd frontend && npx e2e run`, then eslint on touched files, then `npm run build`.
Expected: full suite green, 0 errors, build OK.

- [ ] **Step 5: Commit (only if files changed)**

```bash
git add frontend/tests/finance-tax.e2e.ts
git commit -m "test(frontend): e2e pajak terhadap backend tersinkron"
```

Skip this commit when the e2e needed no changes.
