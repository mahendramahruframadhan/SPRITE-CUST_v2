# Finance PPN/PPH/Subtotal (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan panel Subtotal & Pajak (PPN, PPH, Subtotal Akhir) di halaman `/finance`, frontend-only dengan persistensi `localStorage`.

**Architecture:** Satu komponen baru `TaxSummaryPanel` dipanggil `FinanceAuditPage` dengan prop `total`; perhitungan murni terpusat di `frontend/src/lib/taxSummary.js` (unit-testable tanpa React); state pajak `useState` + `localStorage['finance-tax-v1']`; dropdown memakai `usePopover` + portal (pola export billing); modal input memakai satu sub-komponen `TaxModal` berparameter untuk PPN maupun PPH, dengan toggle mode Persen/Rupiah.

**Tech Stack:** React 18 + Vite + Tailwind (token slate/emerald yang sudah ada), `node --test` untuk unit, `npx e2e` (@e2e-dev/web, engine web, `reuseExisting`).

**Spec:** `docs/superpowers/specs/2026-10-12-finance-ppn-pph-design.md` (baca dulu; plan ini berargumen dari spec, termasuk revisi modal PPN dua mode).

## Global Constraints

- **Frontend-only**: tidak menyentuh `backend/` apa pun; perubahan hanya di `frontend/` + dokumen `docs/`.
- Rumus: `Subtotal = Total + PPN − PPH`, tanpa clamp (D8; hasil negatif tampil apa adanya).
- Nilai `mode` hanya `"percent"` atau `"rupiah"` (atau `null` saat non-aktif); base persen = Total Charges filter aktif; rupiah persen = `Math.round(total * percent / 100)`.
- `localStorage` key persis `finance-tax-v1`, bentuk `{ ppn: TaxEntry, pph: TaxEntry }` dengan `TaxEntry = { enabled: boolean, mode: 'percent'|'rupiah'|null, percent: number, amount: number }`.
- Non PPN/Non PPH = kontribusi 0, tidak pernah membuka modal; memilih Non mereset nilai tersimpan.
- Footer tabel dan badge "Total filter" TIDAK berubah (D7); akumulasi hanya di panel.
- Bahasa UI Indonesia; dilarang karakter em dash (R-02); tanpa emoji sebagai ikon (pakai SVG inline seperti tetangga).
- Arah `DESIGN.md`: ENERGY 2 / RHYTHM 2 / MOTION 1; ikuti pola kartu `Reveal`, modal PAID, dan dropdown export billing yang sudah ada.
- Aksesibilitas (R-32): dropdown `role="menu"` + `aria-label`, modal `role="dialog"` `aria-modal` + Escape menutup, input punya `<label>` asli, fokus terlihat.
- Perintah (dari `frontend/`): unit `npm test`, e2e `npx e2e run tests/<file>`, lint `npx eslint src`, build `npm run build`.
- Commit per task, gaya repo: `✨ feat(frontend): ...` / `✅ test(frontend): ...`.

## Review Focus

Input/kondisi yang paling mungkin menggigit, dengan test yang menguncinya:

1. **Filter diganti saat mode persen aktif** → rupiah pajak ikut berubah mengikuti `total` baru (bukan angka beku). Kuncinya: unit `resolveTaxAmount` mode percent (Task 1) + e2e test percent yang membaca `#tax-total-value` (Task 2/3).
2. **`localStorage` korup/parsial** → sanitize ke default non-aktif, halaman tidak crash. Kuncinya: unit `sanitizeTaxState` (Task 1).
3. **PPH > Total + PPN** → subtotal negatif tampil apa adanya (D8). Kuncinya: unit `computeSubtotal` hasil negatif (Task 1).
4. **Escape di tengah mengetik** → modal tertutup tanpa menyimpan nilai apa pun. Kuncinya: e2e test Escape (Task 2).
5. **Total = 0 (filter kosong)** → panel tetap tampil Rp 0; persen menghasilkan 0; rupiah tetap ditampilkan. Kuncinya: unit `amountFromPercent(0, ...)` (Task 1) + e2e test default (Task 2).

---

### Task 1: Lib `taxSummary.js` (fungsi murni) + unit test

**Files:**
- Create: `frontend/src/lib/taxSummary.js`
- Test: `frontend/test/taxSummary.test.mjs`

**Interfaces:**
- Consumes: (tidak ada, murni)
- Produces (dipakai Task 2-4):
  - `computeSubtotal({ total, ppn, pph }) -> number` - angka mentah non-angka di-coerce ke 0; hasil boleh negatif.
  - `amountFromPercent(total, percent) -> number` - `Math.round(total * percent / 100)`; input tak valid/negatif -> 0.
  - `resolveTaxAmount(entry, total) -> number` - `enabled !== true` -> 0; `mode === 'percent'` -> `amountFromPercent(total, entry.percent)`; selainnya -> `entry.amount` bila angka, else 0.
  - `sanitizeTaxState(raw: string|null) -> { ppn: TaxEntry, pph: TaxEntry }` - `raw` bukan JSON valid -> default non-aktif; per kunci: `enabled` harus `=== true`; `mode` selain `'percent'` dianggap `'rupiah'` bila `amount` valid, dan `null` bila `enabled` false; `percent`/`amount` harus angka >= 0 selain itu 0.
  - `validateRpInput(str: string) -> boolean` - cocok `/^\d+$/` (integer, boleh `0`).
  - `validatePercentInput(str: string) -> boolean` - cocok `/^\d+(\.\d+)?$/` (boleh desimal).

- [ ] **Step 1: Tulis test yang gagal**

Buat `frontend/test/taxSummary.test.mjs` dengan pola `node:test` seperti `test/billingExport.test.mjs`. Assertion persis:

```mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSubtotal, amountFromPercent, resolveTaxAmount,
  sanitizeTaxState, validateRpInput, validatePercentInput,
} from '../src/lib/taxSummary.js';

describe('computeSubtotal', () => {
  it('dua-duanya non: subtotal = total', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 0, pph: 0 }), 100000));
  it('hanya PPN menambah', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 11000, pph: 0 }), 111000));
  it('hanya PPH mengurangi', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 0, pph: 5000 }), 95000));
  it('PPN + PPH bersamaan', () =>
    assert.equal(computeSubtotal({ total: 100000, ppn: 11000, pph: 5000 }), 106000));
  it('hasil negatif tampil apa adanya (D8)', () =>
    assert.equal(computeSubtotal({ total: 1000, ppn: 0, pph: 5000 }), -4000));
  it('input bukan angka dianggap 0', () =>
    assert.equal(computeSubtotal({ total: 'abc', ppn: null, pph: undefined }), 0));
});

describe('amountFromPercent', () => {
  it('11% dari 1.000.000 = 110.000', () =>
    assert.equal(amountFromPercent(1000000, 11), 110000));
  it('dibulatkan ke rupiah bulat', () =>
    assert.equal(amountFromPercent(999999, 11), 110000));
  it('persen desimal', () =>
    assert.equal(amountFromPercent(500000, 0.5), 2500));
  it('total 0 menghasilkan 0', () =>
    assert.equal(amountFromPercent(0, 2), 0));
  it('persen 0 menghasilkan 0', () =>
    assert.equal(amountFromPercent(100000, 0), 0));
  it('persen negatif/tak valid menghasilkan 0', () => {
    assert.equal(amountFromPercent(100000, -5), 0);
    assert.equal(amountFromPercent(100000, 'x'), 0);
  });
});

describe('resolveTaxAmount', () => {
  const off = { enabled: false, mode: null, percent: 0, amount: 0 };
  it('non-aktif -> 0 walau amount ada', () =>
    assert.equal(resolveTaxAmount({ ...off, amount: 999 }, 1000000), 0));
  it('mode percent diturunkan dari total', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: 'percent', percent: 11, amount: 1 }, 1000000), 110000));
  it('mode rupiah memakai amount tetap', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: 'rupiah', percent: 0, amount: 50000 }, 1000000), 50000));
  it('mode null saat aktif -> amount bila angka', () =>
    assert.equal(resolveTaxAmount({ enabled: true, mode: null, percent: 0, amount: 7000 }, 1), 7000));
});

describe('sanitizeTaxState', () => {
  it('raw bukan JSON valid -> default non-aktif', () => {
    assert.deepEqual(sanitizeTaxState('bukan json'), {
      ppn: { enabled: false, mode: null, percent: 0, amount: 0 },
      pph: { enabled: false, mode: null, percent: 0, amount: 0 },
    });
    assert.deepEqual(sanitizeTaxState(null), sanitizeTaxState('{'));
  });
  it('objek parsial dilengkapi default', () => {
    const out = sanitizeTaxState('{"ppn":{"enabled":true,"mode":"rupiah","amount":110000}}');
    assert.equal(out.ppn.amount, 110000);
    assert.deepEqual(out.pph, { enabled: false, mode: null, percent: 0, amount: 0 });
  });
  it('mode tak dikenal saat aktif dianggap rupiah', () => {
    const out = sanitizeTaxState('{"ppn":{"enabled":true,"mode":"manual","amount":5000}}');
    assert.equal(out.ppn.mode, 'rupiah');
    assert.equal(out.ppn.amount, 5000);
  });
  it('angka negatif dinormalkan ke 0', () => {
    const out = sanitizeTaxState('{"ppn":{"enabled":true,"mode":"rupiah","amount":-5},"pph":{"enabled":true,"mode":"percent","percent":-2}}');
    assert.equal(out.ppn.amount, 0);
    assert.equal(out.pph.percent, 0);
  });
});

describe('validateRpInput', () => {
  it('digit diterima, termasuk 0', () => {
    assert.equal(validateRpInput('100000'), true);
    assert.equal(validateRpInput('0'), true);
  });
  it('kosong/desimal/negatif/eksponensial ditolak', () => {
    assert.equal(validateRpInput(''), false);
    assert.equal(validateRpInput('10.5'), false);
    assert.equal(validateRpInput('-5'), false);
    assert.equal(validateRpInput('1e5'), false);
  });
});

describe('validatePercentInput', () => {
  it('integer dan desimal diterima', () => {
    assert.equal(validatePercentInput('2'), true);
    assert.equal(validatePercentInput('0.5'), true);
    assert.equal(validatePercentInput('11'), true);
  });
  it('kosong/negatif/teks ditolak', () => {
    assert.equal(validatePercentInput(''), false);
    assert.equal(validatePercentInput('-1'), false);
    assert.equal(validatePercentInput('abc'), false);
    assert.equal(validatePercentInput('.5'), false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test` (di `frontend/`)
Expected: FAIL, `Cannot find module '../src/lib/taxSummary.js'`.

- [ ] **Step 3: Implement `frontend/src/lib/taxSummary.js`**

Enam fungsi murni dengan signature di blok Interfaces. Kebijakan yang test sudah tetapkan: coerce non-angka ke 0, `Math.round` untuk persen, `enabled !== true` berarti non-aktif, `mode` selain `'percent'` dianggap `'rupiah'` (migrasi bentuk lama) kecuali non-aktif -> `null`. Tanpa dependensi, tanpa React, tanpa comment berlebih (kode bicara).

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npm test`
Expected: PASS, semua describe di file baru hijau, 103 test lama tetap hijau.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxSummary.js test/taxSummary.test.mjs
git commit -m "✅ test(frontend): lib taxSummary - rumus subtotal, persen, sanitize, validasi (TDD)"
```

---

### Task 2: `TaxSummaryPanel` + `TaxModal` (PPN dua mode) + mount

**Files:**
- Create: `frontend/src/components/TaxSummaryPanel.jsx`
- Modify: `frontend/src/pages/FinanceAuditPage.jsx` - import komponen; sisipkan `<TaxSummaryPanel total={total} />` di antara penutup Reveal Filter (baris 783) dan komentar `{/* Table */}` (baris 785)
- Test: `frontend/tests/finance-tax.e2e.ts` (baru; describe tags `['finance']`, `session: 'admin'`)

**Interfaces:**
- Consumes: `computeSubtotal`, `resolveTaxAmount`, `amountFromPercent`, `validateRpInput`, `validatePercentInput` dari Task 1; `usePopover` (`{ open, setOpen, pos, rootRef, popRef }`); `Reveal` dari `../components/Reveal.jsx`; pola portal `createPortal(..., document.body)` persis dropdown export `BillingPage.jsx:441-477`.
- Produces:
  - `<TaxSummaryPanel total={number} />` (state internal, tanpa persistensi dulu).
  - DOM stabil untuk e2e: `#tax-total-value`, `#tax-ppn-value`, `#tax-pph-value`, `#tax-subtotal-value` (teks `fmtMoney`: `'Rp ' + n.toLocaleString('id-ID')`), trigger `PPN: Non PPN` / `PPN: Rp …` dan `PPH: Non PPH` / `PPH: Rp …` (role button), menu `role="menu"` `aria-label="Opsi PPN"`/`"Opsi PPH"` dengan menuitem `PPN (isi pajak)…`, `Non PPN (reset)`, dan padanan PPH; dialog `role="dialog"` `aria-label="PPN"` (dan `"PPH"` di Task 3) berisi toggle `Persen`/`Rupiah` (`aria-pressed`), `<label>` "Persen (%)" atau "Nilai (Rp)" sesuai mode, preview, tombol `Simpan` (disabled bila input tak valid) dan `Batal`.
  - `TaxModal` internal berparameter `{ title, entry, total, onSave, onClose }` (dipakai ulang Task 3).

- [ ] **Step 1: Tulis e2e yang gagal**

Buat `frontend/tests/finance-tax.e2e.ts` berisi describe `('finance: PPN, PPH & subtotal', { tags: ['finance'] }, ...)` dengan helper di dalam file:

```ts
const rp = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
const readNum = async (screen, sel: string) =>
  Number(((await screen.locator(sel).textContent()) || '0').replace(/[^\d]/g, ''));
```

Test (urutan menentukan; state berbagi dalam sesi):

1. **default non-aktif, subtotal = Total Charges, Non tidak membuka modal**
   - `app.open('/finance')`; assert `#tax-ppn-value` berisi `Non PPN`, `#tax-pph-value` berisi `Non PPH`.
   - `total = readNum('#tax-total-value')`; `expect(#tax-subtotal-value).toHaveText(rp(total))`.
   - Tap `PPN: Non PPN` -> menu `Opsi PPN` tampil -> tap menuitem `Non PPN (reset)` -> menu tertutup, `getByRole('dialog')` tidak tampil.
2. **PPN mode Rupiah**
   - Tap trigger PPN -> menuitem `PPN (isi pajak)…` -> dialog `PPN`; default mode Persen aktif (`aria-pressed`); tap tombol `Rupiah`; `Simpan` disabled saat input kosong; fill input berlabel `Nilai (Rp)` = `100000`; tap `Simpan`; dialog tertutup.
   - `expect(#tax-subtotal-value).toHaveText(rp(total + 100000))` dan `#tax-ppn-value` = `rp(100000)`.
3. **PPN mode Persen 11%**
   - Buka lagi modal PPN; tap `Persen`; fill `Persen (%)` = `11`; assert preview berisi `rp(Math.round(total * 0.11))`; `Simpan`.
   - `#tax-subtotal-value` = `rp(total + Math.round(total * 0.11))`.
4. **Escape membatalkan**
   - Buka modal PPN; fill input persen `50`; tekan Escape pada input; dialog tertutup; `#tax-ppn-value` tidak berubah (masih persen 11).

- [ ] **Step 2: Jalankan e2e, pastikan gagal**

Run: `npx e2e run tests/finance-tax.e2e.ts`
Expected: FAIL di test 1 (elemen `#tax-total-value` tidak ada; panel belum dipasang). Bila dev server belum hidup, `reuseExisting` akan menyalakan `npm run dev` otomatis.

- [ ] **Step 3: Implement `TaxSummaryPanel.jsx` + mount**

- Panel: `<Reveal>` kartu dengan `<section aria-label="Subtotal & Pajak">`; rincian `Total Charges` (`#tax-total-value` = `fmtMoney(total)`), `PPN`, `PPH`, garis pemisah, `Subtotal Akhir` (`#tax-subtotal-value` = `fmtMoney(computeSubtotal({ total, ppn: resolveTaxAmount(ppn, total), pph: resolveTaxAmount(pph, total) }))`).
- Dua `usePopover({ width: 260 })` (ppnPop, pphPop); trigger + portal menu mengikuti markup `BillingPage.jsx:441-477` (role, aria-label, z-[70], `animate-fade-in-fast`); fokus item pertama saat membuka (lihat pola `exportFirstItemRef` di BillingPage).
- State: `const [ppn, setPpn] = useState(NON_AKTIF)` (objek default `sanitizeTaxState(null).ppn`); `setPpn(NON_AKTIF)` saat pilih reset; buka `TaxModal` saat pilih isi pajak.
- `TaxModal`: gaya modal PAID (`FinanceAuditPage.jsx:1043-1093`) dengan penyesuaian: judul PPN, toggle Persen/Rupiah, `<label>` asli untuk input, `autoFocus`, Escape + backdrop + `Batal` menutup tanpa menyimpan, `Simpan` memanggil `onSave(entryBaru)`. Simpan nilai sesuai mode: persen -> `{ enabled: true, mode: 'percent', percent: Number(str), amount: amountFromPercent(total, Number(str)) }`; rupiah -> `{ enabled: true, mode: 'rupiah', percent: 0, amount: Number(str) }`.
- Mount di `FinanceAuditPage.jsx` + import (lihat Files).

- [ ] **Step 4: Jalankan e2e, pastikan lulus**

Run: `npx e2e run tests/finance-tax.e2e.ts`
Expected: PASS 4 test.

- [ ] **Step 5: Commit**

```bash
git add src/components/TaxSummaryPanel.jsx src/pages/FinanceAuditPage.jsx tests/finance-tax.e2e.ts
git commit -m "✨ feat(frontend): panel Subtotal & Pajak + dropdown/modal PPN dua mode di halaman Finance"
```

---

### Task 3: PPH (dropdown + modal berparameter)

**Files:**
- Modify: `frontend/src/components/TaxSummaryPanel.jsx` (dropdown kedua sudah disiapkan; lengkapi alur PPH)
- Test: `frontend/tests/finance-tax.e2e.ts` (tambah 2 test)

**Interfaces:**
- Consumes: semua dari Task 2, termasuk `TaxModal` berparameter (yang harus dipakai ulang, bukan modal kedua yang disalin).
- Produces: menu `Opsi PPH` + menuitem `PPH (isi pajak)…` / `Non PPH (reset)`; dialog `aria-label="PPH"`; `#tax-pph-value`.

- [ ] **Step 1: Tulis e2e yang gagal**

Tambah di file yang sama:

5. **PPH mode Rupiah**
   - Tap `PPH: Non PPH` -> `PPH (isi pajak)…` -> dialog `PPH`; tap `Rupiah`; fill `Nilai (Rp)` = `50000`; `Simpan`.
   - `total = readNum('#tax-total-value')`; ppn = nilai tersimpan (baca `#tax-ppn-value` lalu parse bila bukan `Non PPN`); assert `#tax-subtotal-value` = `rp(total + ppn - 50000)`.
6. **PPH mode Persen 2%**
   - Buka modal PPH; tap `Persen`; fill `2`; preview = `rp(Math.round(total * 0.02))`; `Simpan`.
   - `#tax-subtotal-value` = `rp(total + ppn - Math.round(total * 0.02))`; `#tax-pph-value` = `rp(Math.round(total * 0.02))`.
7. **reset Non PPN & Non PPH mengembalikan subtotal ke Total Charges**
   - Tap `PPN: …` -> menuitem `Non PPN (reset)`; tap `PPH: …` -> `Non PPH (reset)`.
   - `#tax-ppn-value` = `Non PPN`, `#tax-pph-value` = `Non PPH`, `#tax-subtotal-value` = `rp(total)`.

- [ ] **Step 2: Jalankan e2e, pastikan gagal**

Run: `npx e2e run tests/finance-tax.e2e.ts`
Expected: test baru FAIL (menu/PPH belum ada), 4 test lama PASS.

- [ ] **Step 3: Lengkapi alur PPH di `TaxSummaryPanel.jsx`**

Sama seperti PPN: state `pph`, `ppnPop` sudah ada -> tambah handler menu PPH, `setPph(NON_AKTIF)` untuk reset, buka `TaxModal` yang sama dengan `title="PPH"`. Row PPH di panel memakai `resolveTaxAmount(pph, total)`.

- [ ] **Step 4: Jalankan e2e, pastikan lulus**

Run: `npx e2e run tests/finance-tax.e2e.ts`
Expected: PASS 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/components/TaxSummaryPanel.jsx tests/finance-tax.e2e.ts
git commit -m "✨ feat(frontend): dropdown & modal PPH (persen/rupiah) di panel subtotal Finance"
```

---

### Task 4: Persistensi `localStorage` + full verification + Delivery Gate

**Files:**
- Modify: `frontend/src/components/TaxSummaryPanel.jsx` (init dari `localStorage`, save saat berubah)
- Test: `frontend/tests/finance-tax.e2e.ts` (tambah 1 test)

**Interfaces:**
- Consumes: `sanitizeTaxState` dari Task 1 (satu-satunya pintu parse `localStorage`).
- Produces: perilaku persistensi `finance-tax-v1` (bentuk di Global Constraints).

- [ ] **Step 1: Tulis e2e yang gagal**

Tambah test:

7. **nilai pajak bertahan setelah reload**
   - Buka modal PPN -> mode `Rupiah` -> fill `100000` -> `Simpan`.
   - `app.open('/finance')` (navigasi ulang penuh) -> `#tax-ppn-value` = `rp(100000)`; `#tax-subtotal-value` = `rp(total + 100000)`.
   - Tutup test dengan mereset kedua pajak ke Non (kebersihan sesi).

- [ ] **Step 2: Jalankan e2e, pastikan gagal**

Run: `npx e2e run tests/finance-tax.e2e.ts`
Expected: test reload FAIL (state hilang setelah reload), 7 test lama PASS.

- [ ] **Step 3: Implement persistensi**

- Init: `useState(() => sanitizeTaxState(localStorage.getItem('finance-tax-v1')))` dibungkus try/catch (private mode/larangan localStorage -> default) di dalam `TaxSummaryPanel`.
- Save: `useEffect` menulis `JSON.stringify({ ppn, pph })` ke `localStorage['finance-tax-v1']` setiap `ppn`/`pph` berubah.

- [ ] **Step 4: Jalankan e2e, pastikan lulus**

Run: `npx e2e run tests/finance-tax.e2e.ts`
Expected: PASS 8 test.

- [ ] **Step 5: Full verification**

Run (berurutan, dari `frontend/`):
- `npm test` -> semua unit hijau (termasuk 103 lama).
- `npx e2e run` -> seluruh suite hijau (unit baru + billing/navigation/dll yang menyentuh `/finance`).
- `npx eslint src` -> 0 error (2 warning pre-existing `i` unused & `SummaryBox` dibiarkan).
- `npm run build` -> sukses.

- [ ] **Step 6: Delivery Gate antislop (mode DURING)**

Laporkan PASS/FAIL per blok bersama hasil Step 5: Hard Gate (cek R-02 em dash di copy baru, R-03 overflow mobile panel, R-26 tidak ada kontrol mati, R-27 empty state panel, R-32 Escape/Tab/label), Purpose-Gate (alasan pemakaian gradient emerald modal = mengikuti modal PAID, reveal = MOTION 1), Liveliness (dials 2/2/1 konsisten, focal point = Subtotal Akhir), Craftsmanship (C-1..C-5, R-31 satu-baris reason). Klik-manual per kontrol sebagai bukti R-35.

- [ ] **Step 7: Commit**

```bash
git add src/components/TaxSummaryPanel.jsx tests/finance-tax.e2e.ts
git commit -m "✨ feat(frontend): persistensi localStorage finance-tax-v1 + full gate PPN/PPH/subtotal"
```
