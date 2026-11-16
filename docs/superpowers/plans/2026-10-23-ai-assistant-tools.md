# AI Assistant Tool Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti snapshot SQL statis di backend AI dengan loop function-calling (6 tool read-only) + instruksi runtime `ai-instructions.md`, kill-switch `agentConfig`, dan log pemakaian.

**Architecture:** `POST /ai/chat` tetap dengan kontrak lama (multi-turn `messages[]` + `connectionId`). Controller tetap pintu masuk (validasi, kuota, kill-switch, SSRF, pilih koneksi); logika chat dipindah ke `ai.service.ts` yang menjalankan loop model↔tool (maks 4 putaran) memakai tool dari `ai.tools.ts` yang mengeksekusi query terpusat di `ai.queries.ts`.

**Tech Stack:** NestJS (pola controller existing), query via `db.pq(text, params)`, node:test + pg-mem (`test/helpers/pgmem.ts`), provider OpenAI-compatible `/chat/completions` dengan `tools`.

**Spec:** `docs/superpowers/specs/2026-10-23-ai-assistant-tools-design.md`

**Progress tracker:** `docs/superpowers/2026-10-23-ai-assistant-tools-progress.md` — dimutakhirkan tiap task selesai.

## Global Constraints

- Semua tool READ-ONLY: hanya SELECT. Dilarang INSERT/UPDATE/DELETE di `ai.queries.ts`.
- Query lewat `db.pq(text, params)` (binding `$1..$n`) — dilarang menginterpolasi nilai input ke SQL.
- Loop tool maks 4 putaran; `max_tokens: 500` di body provider.
- Output tool hanya agregat; tidak pernah memuat key/konfigurasi/data sensitif.
- System prompt tunggal = hasil `readInstructions()`; pesan `role: 'system'` dari client dibuang.
- API key hanya di header Authorization — tidak pernah masuk body.
- Rate limit fail-closed existing dipertahankan (default 10/menit, `parseAiRateLimit` — ekspor ini tetap).
- Frontend tidak diubah (`AiChat.jsx`, `chatAi` di `lib/api.js` kontrak tetap).
- Test: node:test, impor `../src/...ts` langsung, run `npm test` di `backend/`. Single file: `node -r ts-node/register/transpile-only --test test/<file>.test.ts`.
- Commit mengikuti konvensi repo (emoji + scope, Bahasa Indonesia).

## Review Focus

1. Kill-switch semantik: app_config `agentConfig` TANPA entry `chatbot-cs` → asisten AKTIF (perilaku hari ini tetap berjalan); entry dengan `enabled: false` → NONAKTIF tanpa panggilan provider. Catatan: default UI tab AI (`SheetConfigPage.jsx:49` `enabled: false`) — owner yang pernah menyimpan tab AI dengan sakelar mati memang akan menonaktifkan asisten; perilaku dimaksud, dicatat di progress file.
2. `month` tanpa `year` → default tahun berjalan; jawaban model wajib menyebut periode ("seluruh periode" / "Juli 2026") — `period` label selalu ada di output tool.
3. `date_issue` adalah TEXT format `YYYYMMDD…` (`LIKE '202607%'`), bukan kolom tanggal — dilarang memakai operator tanggal SQL.
4. Enum salah (`metric`, `group_by`, `billing_status`, `month`/`year` di luar rentang) → error eksplisit ke model; DILARANG diubah diam-diam. Hanya `limit` yang di-clamp diam-diam ke 1-20.
5. `assistance_records` di `test/helpers/pgmem.ts` TIDAK punya kolom bisnis — test tool membuat DDL sendiri dengan kolom lengkap.

---

### Task 1: Spike — verifikasi function calling di proxy aktif (GATE)

**Files:**
- Create (throwaway, dihapus setelah dipakai): `backend/spike-fc.ts`
- Modify: `docs/superpowers/2026-10-23-ai-assistant-tools-progress.md` (catat hasil)

**Interfaces:**
- Produces: keputusan lanjut/henti. Jika proxy tidak mengirim `tool_calls` → STOP, catat di progress file, konsultasikan jalur hibrida dengan user sebelum Task 2.

- [ ] **Step 1: Tulis skrip spike throwaway `backend/spike-fc.ts`**

Baca koneksi aktif: `getDb()` + `getSecret(db, 'aiConnections')` → cari `connections[].active && apiKey` (pola `loadActive()` ai.controller.ts:151). `fetch(`${baseURL}/chat/completions`, {method:'POST', headers:{Authorization:`Bearer ${apiKey}`}})` dengan body: `{model, messages:[{role:'user',content:'top client berdasarkan kasus'}], max_tokens:200, tool_choice:'auto', tools:[schema sederhana get_top_clients — {type:'function',function:{name:'get_top_clients',parameters:{type:'object',properties:{metric:{type:'string'},limit:{type:'integer'}}},required:['metric']}}]}`. `console.log` ringkas: model, `!!tool_calls`, nama tool yang diminta bila ada, atau error provider.

- [ ] **Step 2: Jalankan spike**

Run: `cd backend && npx ts-node --transpile-only spike-fc.ts`
Expected: keluaran `tool_calls: true` (atau pesan error provider yang jelas).

- [ ] **Step 3: Catat hasil di progress file** — bagian "Spike function calling": tanggal, model/baseURL dipakai, hasil, catatan risiko. Lalu `rm backend/spike-fc.ts` (throwaway).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/2026-10-23-ai-assistant-tools-progress.md
git commit -m "🔇 docs(spike): verifikasi function calling proxy AI — gate tool calling"
```

### Task 2: Instruksi runtime — `ai-instructions.md` + `ai.instructions.ts`

**Files:**
- Create: `backend/src/ai/ai-instructions.md`
- Create: `backend/src/ai/ai.instructions.ts`
- Test: `backend/test/ai.instructions.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `readInstructions(): string`, `clearInstructionsCache(): void` — dipakai `ai.service` (Task 5) dan pengganti `SYSTEM_PROMPT` di test lama (Task 6, ai.injection.test.ts:3).

- [ ] **Step 1: Tulis failing test `backend/test/ai.instructions.test.ts`**

```ts
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readInstructions, clearInstructionsCache } from '../src/ai/ai.instructions.ts';

describe('readInstructions — file runtime', () => {
  afterEach(clearInstructionsCache);

  it('mengembalikan isi file (non-kosong, memuat blok lingkup)', () => {
    const s = readInstructions();
    assert.ok(s.length > 200);
    assert.match(s, /LINGKUP/i);
    assert.match(s, /SUMBER DATA/i);
  });

  it('cache di-refresh saat file berubah (mtime)', () => {
    clearInstructionsCache();
    const sebelum = readInstructions();
    const fs = require('fs');
    const path = require('path');
    // kandidat pertama yang ada pada mode test = cwd/backend/src/ai (cwd=backend)
    const file = path.join(process.cwd(), 'src', 'ai', 'ai-instructions.md');
    fs.appendFileSync(file, '\n<!-- edisi test -->');
    try {
      clearInstructionsCache();
      assert.notEqual(readInstructions(), sebelum);
    } finally {
      fs.writeFileSync(file, sebelum);
      clearInstructionsCache();
      assert.equal(readInstructions(), sebelum);
    }
  });

  it('file tidak ada → string kosong, tidak lempar', () => {
    assert.equal(readInstructions('/absolut/tidak/ada/instruksi.md'), '');
  });
});
```

- [ ] **Step 2: Run test, verify fails**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/ai.instructions.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implement `ai.instructions.ts`**

```ts
export function readInstructions(overridePath?: string): string
export function clearInstructionsCache(): void
```
Kandidat path file (pilih yang pertama ADA): `overridePath` bila diberi; `path.join(__dirname, 'ai-instructions.md')`; `path.join(process.cwd(), 'src/ai', 'ai-instructions.md')`; `path.join(process.cwd(), 'backend/src/ai', 'ai-instructions.md')`. File tidak ada → `''`. Cache satu entri `{ path, mtimeMs, text }`; refresh bila mtimeMs berubah (toleransi 1000 ms). Tidak melempar error apa pun.

- [ ] **Step 4: Run test, verify passes**

Run: `node -r ts-node/register/transpile-only --test test/ai.instructions.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai-instructions.md backend/src/ai/ai.instructions.ts backend/test/ai.instructions.test.ts
git commit -m "✨ feat(ai): instruksi runtime ai-instructions.md + pembaca cache mtime"
```

### Task 3: Lapisan query — `ai.queries.ts`

**Files:**
- Create: `backend/src/ai/ai.queries.ts`
- Test: `backend/test/ai.queries.test.ts`

**Interfaces:**
- Consumes: `db.pq(text, params)` dari `getDb()`.
- Produces:

```ts
export const PERIOD_MIN_YEAR = 2020;
export const PERIOD_MAX_YEAR = 2035;
export interface Period { month?: number; year?: number }
export function periodLabel(p: Period): string   // 'seluruh periode' | 'Juli 2026' | 'tahun 2026'
export function ymValue(p: Period): string | null // '202607' | null — dipakai untuk `date_issue LIKE $n`
export async function countCases(db: any, f: { status?: string; billingStatus?: string; period?: Period }): Promise<number>
export async function caseTotals(db: any, f: { groupBy?: 'billing_status' | 'status'; period?: Period }): Promise<Array<{ label: string; count: number; charges: number }>>
export async function topClients(db: any, f: { metric: 'cases' | 'charges'; limit: number; period?: Period }): Promise<Array<{ client: string; total: number }>>
export async function moduleBreakdown(db: any, period?: Period): Promise<Array<{ module: string; count: number }>>
export async function countAudit(db: any, f: { status?: string }): Promise<number> // tabel audit_status, kolom action
export async function countInvoice(db: any, f: { status?: string; sumAmount?: boolean }): Promise<{ total: number; amount?: number }>
```

- `topClients('cases')` = COUNT(*); `('charges')` = SUM(charges) per client, ORDER BY total DESC.
- `countInvoice` `sumAmount: true` → `amount` = SUM(a.charges) dari `JOIN assistance_records a ON a.record_uuid = invoice_status.record_uuid`.
- Fungsi mengasumsikan argumen sudah divalidasi pemanggil (Task 4). Semua hanya SELECT. Nilai NUMERIC dikonversi `Number(...)`.

- [ ] **Step 1: Tulis failing test `backend/test/ai.queries.test.ts`**

`process.env.DATABASE_URL = ''` di paling atas (pola helpers/pgmem.ts:4). `before`: buat tabel sendiri via `getMemDb()`:

```sql
CREATE TABLE assistance_records (record_uuid TEXT PRIMARY KEY, no TEXT, client TEXT, status TEXT, billing_status TEXT, charges NUMERIC, date_issue TEXT, module TEXT, support_category TEXT, support_type TEXT);
CREATE TABLE audit_status (record_uuid TEXT PRIMARY KEY, action TEXT, updated_at TEXT);
CREATE TABLE invoice_status (record_uuid TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
```
Insert via `db.pq`: 4 kasus — 2× `DONE/ON-CALL/100000/2026-07/bulan 202607` client `CLIENT-A` modul `Modul X`; 1× `DONE/MONTHLY/50000/202608` client `CLIENT-B` modul `Modul Y`; 1× `OPEN/FREE/0/202509` client `CLIENT-A` modul `Modul X`. `audit_status`: 3× action `AUDITEE`, 1× `APPROVALS`. `invoice_status`: 2× `BILLED` (record_uuid kasus ON-CALL), 1× `PAID`.

Kasus test:
- `countCases(db, {})` = 4; `{billingStatus:'ON-CALL'}` = 2; `{period:{month:7,year:2026}}` = 2; `{status:'DONE'}` = 3; `{status:'DONE', period:{month:8,year:2026}}` = 1.
- `caseTotals(db, {groupBy:'billing_status'})` → baris `ON-CALL {count:2, charges:200000}`, `MONTHLY {1, 50000}`, `FREE {1, 0}`; `groupBy:'status'` → `DONE {3, ...}`, `OPEN {1, ...}`.
- `topClients(db, {metric:'cases', limit:2})` → `[{client:'CLIENT-A', total:3}, {client:'CLIENT-B', total:1}]`; `{metric:'charges', limit:1}` → `[{CLIENT-A, 200000}]`.
- `moduleBreakdown(db)` → `[{module:'Modul X', count:3}, {module:'Modul Y', count:1}]`.
- `countAudit(db, {})` = 4; `{status:'AUDITEE'}` = 3.
- `countInvoice(db, {})` `{total:3}`; `{status:'BILLED'}` `{total:2}`; `{sumAmount:true}` → `amount` = 200000.
- `ymValue({})` = null; `ymValue({month:7, year:2026})` = '202607'; `ymValue({month:7})` = `` `${new Date().getFullYear()}07` `` (month tanpa year → tahun berjalan — Review Focus #2); `periodLabel({})` = 'seluruh periode'; `periodLabel({month:7,year:2026})` = 'Juli 2026'; `periodLabel({year:2026})` = 'tahun 2026'.

- [ ] **Step 2: Run test, verify fails**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/ai.queries.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implement `ai.queries.ts`**

Builder WHERE internal kecil (akumulasi `clauses[]` + `params[]`), filter periode pakai `date_issue LIKE $n` dengan param `${ymValue(p)}%`. Nama tabel/kolom HARDCODED — bukan dari input. Group label memakai `COALESCE(label,'—')`.

- [ ] **Step 4: Run test, verify passes**

Run: `node -r ts-node/register/transpile-only --test test/ai.queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai.queries.ts backend/test/ai.queries.test.ts
git commit -m "✨ feat(ai): lapisan query agregat read-only untuk tool asisten"
```

### Task 4: Registry tool & validasi — `ai.tools.ts`

**Files:**
- Create: `backend/src/ai/ai.tools.ts`
- Test: `backend/test/ai.tools.test.ts`

**Interfaces:**
- Consumes: seluruh fungsi `ai.queries.ts` (signature Task 3), `periodLabel`.
- Produces:

```ts
export const TOOL_SPECS: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>
export const TOOL_NAMES: string[]
export async function runTool(db: any, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
```

6 tool: `count_cases`, `case_totals`, `get_top_clients`, `get_module_breakdown`, `count_audit`, `count_invoice`. `parameters` JSON Schema OpenAI (deskripsi singkat Bahasa Indonesia).

Aturan validasi `runTool` SEBELUM query:
- Tool tak dikenal → `{ error: 'tool tidak dikenal' }`.
- `month`: integer 1-12, di luar → `{ error: 'month harus 1-12' }`; `year`: integer `PERIOD_MIN_YEAR..PERIOD_MAX_YEAR` → `{ error: 'year harus 2020-2035' }`; `month` tanpa `year` → year = tahun berjalan.
- `limit`: Number → clamp diam-diam 1-20; non-angka → default 5.
- `metric` (`get_top_clients`): `'cases'|'charges'` → selain itu error `'metric harus cases atau charges'`.
- `group_by` (`case_totals`): `'billing_status'|'status'` → selain itu error analog.
- `billing_status`: satu dari `'ON-CALL'|'MONTHLY'|'FREE'` (uppercase dulu, case-insensitive) → selain itu error.
- `status` (count_cases / count_audit / count_invoice): string, trim, dipakai apa adanya.
- `sum_amount` (`count_invoice`): boolean, default false.
- Output berhasil selalu bawa `period: periodLabel(period)` bila tool memakai periode (count_cases, case_totals, get_top_clients, get_module_breakdown).

- [ ] **Step 1: Tulis failing test `backend/test/ai.tools.test.ts`**

Pakai pg-mem + seed yang sama pola Task 3 (extract ke helper lokal `seedToolDb()` di file test ini boleh duplikat ringkas). Kasus:
- `runTool(db, 'tool_aneh', {})` → `{ error: 'tool tidak dikenal' }`.
- `{metric:'brand'}` → error memuat `'metric'`.
- `{group_by:'client'}` → error memuat `'group_by'`.
- `{month:13}` → error; `{month:'x'}` → error; `{year:2050}` → error.
- `{billing_status:'nebeng'}` → error; `{billing_status:'on-call'}` (lowercase) dipanggil sebagai `'ON-CALL'` → query pg-mem menemukan 2 kasus.
- `{limit: 99999}` → hasil tetap sukses (limit ter-clamp ≤20).
- Happy path: `runTool(db,'count_cases',{})` → `{ total: 4, period: 'seluruh periode' }`; `runTool(db,'get_top_clients',{metric:'cases',limit:1})` → `{ period, items:[{client:'CLIENT-A', total:3}] }`; `runTool(db,'case_totals',{group_by:'status'})` → kelompok DONE/OPEN; `runTool(db,'count_audit',{status:'AUDITEE'})` → `{ total: 3 }`; `runTool(db,'count_invoice',{sum_amount:true})` → total+amount.
- `TOOL_SPECS.length` = 6; semua punya `function.name` unik.

- [ ] **Step 2: Run test, verify fails**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/ai.tools.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implement `ai.tools.ts`**

Switch per nama tool; normalisasi + validasi per aturan di atas; panggil fungsi `ai.queries.ts`; bungkus hasil dengan `period` label diperlukan. Validasi gagal → return `{ error }` (JANGAN lempar).

- [ ] **Step 4: Run test, verify passes**

Run: `node -r ts-node/register/transpile-only --test test/ai.tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai.tools.ts backend/test/ai.tools.test.ts
git commit -m "✨ feat(ai): registry 6 tool read-only + validasi argumen backend"
```

### Task 5: Loop chat — `ai.service.ts`

**Files:**
- Create: `backend/src/ai/ai.service.ts`
- Test: `backend/test/ai.chat-loop.test.ts`

**Interfaces:**
- Consumes: `readInstructions()` (Task 2), `TOOL_SPECS` + `runTool` (Task 4).
- Produces:

```ts
export interface AiConnection { apiKey: string; baseURL: string; model: string }
export interface ChatResult { ok: boolean; reply?: string; error?: string; rounds: number; toolsCalled: string[] }
export async function aiChat(db: any, conn: AiConnection, messages: Array<{ role: string; content: string }>): Promise<ChatResult>
```

- Validasi ulang input sendiri: hanya `role in ('user','assistant')` dengan `content` string, slice 2000 — tidak percaya caller.
- Body per putaran: `{ model: conn.model || 'gpt-4o-mini', max_tokens: 500, tool_choice: 'auto', tools: TOOL_SPECS, messages: [{role:'system', content: readInstructions()}, ...messagesValid] }` ke `` `${baseURL}/chat/completions` `` dengan header Authorization Bearer.
- Respons `message.tool_calls` (array) → jalankan tiap call: `runTool(db, tc.function.name, aman-parse(tc.function.arguments))`; push `{role:'assistant', tool_calls:[...] apa adanya}` lalu `{role:'tool', tool_call_id, content: JSON.stringify(result)}` (hasil `{error}` pun dikirim). Parse arguments gagal → `{}`. Loop ulang.
- `message.content` string non-kosong → `{ok:true, reply, rounds, toolsCalled}` dan berhenti.
- Putaran habis (4) tanpa teks → `{ok:false, error:'Asisten belum bisa memproses pertanyaan ini.', rounds:4, toolsCalled}`.
- `fetch` throw / `!r.ok` → `{ok:false, error:<ringkas tanpa detail teknis berlebih>, rounds, toolsCalled}`.

- [ ] **Step 1: Tulis failing test `backend/test/ai.chat-loop.test.ts`**

Mock `globalThis.fetch` (pola ai.injection.test.ts:28) + `readInstructions` dari Task 2 (file sudah ada). Kasus:
- 1 putaran teks langsung → `{ok:true, reply:'jawaban', rounds:1, toolsCalled:[]}`; body yang dikirim: `tools` ada, `max_tokens:500`, pertama `role:'system'` memuat `readInstructions().slice(0,20)`, pesan client `role:'system'` dari input dibuang.
- tool_calls lalu teks: fetch #1 return `tool_calls:[{id:'1',type:'function',function:{name:'count_cases',arguments:'{}'}}]`; fetch #2 teks → `{ok:true, rounds:2, toolsCalled:['count_cases']}`; messages fetch #2 memuat `{role:'tool', tool_call_id:'1'}`.
- arguments rusak `'{"limit":'` → runTool dipanggil dengan `{}`.
- tool tak dikenal (`'tool_aneh'`) → pesan tool `content` memuat `'tool tidak dikenal'`, berlanjut loop (bukan crash).
- tool_calls 4× beruntun (fetch selalu tool_calls) → fetch tepat 4×; hasil `{ok:false, error:'Asisten belum bisa memproses pertanyaan ini.', rounds:4}`.
- provider HTTP 500 → `{ok:false}` tanpa throw.
- fetch throw → `{ok:false}` tanpa throw.
- pg-mem tidak wajib di file ini (runTool cukup dengan db tiruan yang return row kosong) — kecuali kasus tool tak dikenal.

- [ ] **Step 2: Run test, verify fails**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/ai.chat-loop.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implement `ai.service.ts`**

Helper internal `validMessages()`, `buildBody()`, `extractToolCalls(msg)`. Loop `for round = 1..4`. `fmt` error provider ringkas (`provider HTTP ${status}` / `gagal hubungi AI`).

- [ ] **Step 4: Run test, verify passes**

Run: `node -r ts-node/register/transpile-only --test test/ai.chat-loop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/test/ai.chat-loop.test.ts
git commit -m "✨ feat(ai): loop model-tool maks 4 putaran, max_tokens 500"
```

### Task 6: Controller baru + sinkronisasi test lama

**Files:**
- Modify: `backend/src/ai/ai.controller.ts` — hapus `SYSTEM_PROMPT`, `PROJECT_KB`, seluruh blok snapshot (baris ~210-269); endpoint `chat` memanggil `aiChat`.
- Modify: `backend/test/ai.injection.test.ts` — ganti import `SYSTEM_PROMPT` (baris 3) dengan `readInstructions` dari `ai.instructions.ts`; tiga assertion `SYSTEM_PROMPT.slice(0, 20)` (baris 59, 81) menjadi `readInstructions().slice(0, 20)`.
- Modify: `backend/test/ai.snapshot-toggle.test.ts` — rewrite isi (nama file tetap): dari uji snapshot env menjadi uji kill-switch `agentConfig`.
- Test (baru): `backend/test/ai.controller.chat.test.ts`

**Interfaces:**
- Consumes: `aiChat` (Task 5), `logActivity(db, {who, action, category, detail})` dari `../logs/activity`, `consumeAiQuota`, `normalizeAiBaseUrl`, `pickConnection/loadActive` (tetap di controller).
- Produces: alur `POST /ai/chat` baru:
1. Validasi messages (existing: 8 pesan × 2000 karakter) tetap.
2. **Kill-switch lebih dulu:** helper internal `isAiDisabled(db): Promise<boolean>` — `db.pq("SELECT value FROM app_config WHERE key='agentConfig'")` → parse JSON → `agents.find(a => a?.id === 'chatbot-cs')`; nonaktif bila entry ADA dengan `enabled === false`; entry/kunci tidak ada → aktif. Nonaktif → return `{ok:false, error:'Asisten sedang dinonaktifkan.'}` TANPA kuota, TANPA fetch provider.
3. Kuota 429 (existing HttpException — tetap).
4. `pickConnection(body.connectionId)`; cfg/key/baseURL tidak valid → error existing.
5. `const res = await aiChat(this.db, { apiKey, baseURL: normalizeAiBaseUrl(cfg.baseURL), model: cfg.model }, msgs)`.
6. Log: `logActivity(db, { who: String(req?.user?.email || 'system').slice(0,120), action: 'ai_chat', category: 'ai', detail: `status=${res.ok?'ok':'error'}; rounds=${res.rounds}; tools=${(res.toolsCalled||[]).slice(0,10).join(',')}` })` — detail ≤500, tidak pernah memuat isi pesan.
7. Return `{ok:true, reply}` / `{ok:false, error}`.

- [ ] **Step 1: Rewrite failing test `ai.snapshot-toggle.test.ts`** (kill-switch):

pg-mem (`setupTables` + helpers) + fake fetch (pola Task 5, koneksi `aiConnections` ke api.openai.com — pola fakeDb di ai.injection.test.ts:12):
- app_config TANPA `agentConfig` → chat tetap jalan, fetch provider terpanggil.
- `agentConfig` = `{agents:[{id:'chatbot-cs', enabled:false}]}` → `{ok:false}`, fetch TIDAK terpanggil.
- `agentConfig` = `{agents:[{id:'auto-reply', enabled:false}]}` → chat jalan (agent lain tak berpengaruh).

- [ ] **Step 2: Tulis failing test `ai.controller.chat.test.ts`**:

- chat OK → activity_logs punya baris `action='ai_chat', category='ai'`, `detail` memuat `status=ok` dan `rounds=`, DAN TIDAK memuat isi pertanyaan (string `'berapa kasus'` tidak ada di kolom detail).
- provider gagal (fake fetch 500) → baris `detail` memuat `status=error`; response body `{ok:false}`.
- kill-switch aktif → baris `detail` memuat `status=disabled`.

- [ ] **Step 3: Run test, verify fails**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/ai.snapshot-toggle.test.ts test/ai.controller.chat.test.ts`
Expected: FAIL — controller lama masih snapshot.

- [ ] **Step 4: Implement controller bersih** sesuai Produces. Blok snapshot & konstanta prompt dihapus TOTAL. Ekspor yang dipakai test lama tetap: `maskKey`, `parseAiRateLimit`, `normalizeAiBaseUrl`, class `AiController`. Snapshot-toggle test lama yang mengklaim `AI_SNAPSHOT_ENABLED` dihapus bersama rewritenya.

- [ ] **Step 5: Sinkronkan `ai.injection.test.ts`** sesuai catatan di atas (3 titik ganti; aturan sistem-prompt-unik + key-hanya-header tetap diuji).

- [ ] **Step 6: Run semua test AI, verify passes**

Run: `cd backend && node -r ts-node/register/transpile-only --test test/ai.injection.test.ts test/ai.snapshot-toggle.test.ts test/ai.controller.chat.test.ts test/ai.config.separation.test.ts test/ai.safety.test.ts`
Expected: PASS semua.

- [ ] **Step 7: Commit**

```bash
git add backend/src/ai/ai.controller.ts backend/test/ai.injection.test.ts backend/test/ai.snapshot-toggle.test.ts backend/test/ai.controller.chat.test.ts
git commit -m "✨ feat(ai): chat via loop tool calling + kill-switch agentConfig + log ai_chat"
```

### Task 7: Suite hijau + progress file final

**Files:**
- Modify: `docs/superpowers/2026-10-23-ai-assistant-tools-progress.md`

- [ ] **Step 1: Jalankan seluruh test backend**

Run: `cd backend && npm test`
Expected: semua PASS. Bila ada test non-AI gagal: STOP dan laporkan ke user — jangan autoklarifikasi.

- [ ] **Step 2: Catat di progress file** — tandai Task 1-7 statusnya; isi bagian "Set uji manual staging": daftar 20-30 pertanyaan aktual (Use Case PRD bagian 4 + billing/audit/invoice/HR versi SPRITE) dengan periode/jawaban yang diharapkan, kolom hasil kosong untuk diisi saat uji manual; catat juga: metrik keberhasilan PRD bagian 14 (akurasi 100% vs query langsung) sebagai checklist manual.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/2026-10-23-ai-assistant-tools-progress.md
git commit -m "📝 docs(plan): progres implementasi AI tool calling — suite hijau"
```
