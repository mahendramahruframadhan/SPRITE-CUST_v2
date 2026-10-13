# Desain Backend Pajak Per Transaksi (Finance)

- Tanggal: 2026-10-13
- Status: disetujui user (Section 1-3 via brainstorming)
- Konteks: frontend halaman Finance menyimpan PPN/PPH per baris ON-CALL hanya di localStorage (`finance-tax-v2`). Data tidak shared antar browser/user, hilang bila cache dibersihkan, tanpa validasi server. Spec ini menambah backend sebagai sumber kebenaran; localStorage turun menjadi outbox.

## Keputusan yang disetujui (Q1-Q4, semua opsi A)

- Q1 sinkron: backend sumber kebenaran, localStorage cache/fallback.
- Q2 validasi: ketat di server, 422 untuk input tak valid.
- Q3 kunci PAID: tolak edit pajak setelah status invoice PAID, 422.
- Q4 scope: server menegakkan ON-CALL, 422 untuk baris lain.

## Outbox (disetujui)

- `finance-tax-v2` hanya menampung entri yang belum terkonfirmasi server.
- Save: tulis outbox, update memori langsung, PATCH background. Sukses: hapus key dari outbox, state dari respons server. Gagal/offline: key tetap, toast, tandai pending.
- Load: GET map server (kebenaran), tumpangkan outbox, render, flush sisa outbox di background.
- Retry: event `online`, load berikutnya, sebelum save berikutnya.
- Data lokal lama termigrasi otomatis (diperlakukan sebagai outbox saat pertama online).
- Konflik antar-tab/browser: last-write-wins per baris (batas yang diterima, sama seperti pola invoice).

## Section 1: Data dan API backend

Tabel baru `case_tax` (cerminkan `audit_status`/`invoice_status`):

- `record_uuid` TEXT PRIMARY KEY, FK ke `assistance_records(record_uuid)`, `ON DELETE CASCADE`
- `ppn_mode` TEXT (`percent`/`rupiah`, NULL berarti non-aktif)
- `ppn_percent` REAL, `ppn_amount` INTEGER
- `pph` INTEGER DEFAULT 0 (konvensi boolean 0/1 yang ada)
- `updated_by` TEXT, `updated_at` TEXT

Dibuat via `CREATE TABLE IF NOT EXISTS` di `db/init.ts` + mirror `pgTable` di `db/schema.pg.ts`.

Endpoint di `BillingController` (guard `SessionGuard` + `@Perm('finance')`, seperti PATCH invoice):

- `GET billing/tax-map` → `{ ok, map: { uuid: { ppn: {mode,percent,amount}|null, pph: bool } } }`
- `PATCH cases/:uuid/tax` body `{ ppn, pph }` → validasi → upsert `ON CONFLICT (record_uuid) DO UPDATE` → `{ ok, recordUuid, tax }` + `logActivity` kategori `Pajak`

Error: `422 TAX_INVALID` (mode/angka), `422 TAX_PAID_LOCKED`, `422 TAX_NOT_ONCALL`, `404` bila kasus tak ada.

## Section 2: Sinkron frontend

- State memori = map server + overlay outbox; render selalu dari gabungan.
- Reset (Non PPN / Non PPH) tetap di-PATCH (nilai null/false), bukan hapus baris server. Idempoten.
- Indikator pending minimal: chip ber-titik/opacity + `title` saat key masih di outbox (teks menjelaskan, bukan warna saja).
- `api.js` tambah `getTaxMap` + `patchTax`; `useFinanceTax` menangani load/merge/flush/retry.

## Section 3: Testing, rollout, risiko

Backend test (file baru, pola TDD): map kosong/berisi; PATCH persen+rupiah valid; 422 mode aneh, persen >100/negatif, rupiah desimal/negatif, pph non-boolean; 422 kunci PAID; 422 non-ON-CALL; 404 uuid tak ada; upsert menimpa; log tertulis. Catatan: helper `pgmem.ts` sedang kotor oleh kerjaan orang lain, test pajak tidak boleh bergantung perubahan itu.

Frontend test: unit helper murni (merge, evict-on-ack, retry); e2e 6 test diperbarui, reload membuktikan persistensi server + evict key dari outbox.

Rollout: tanpa migrasi manual. File backend yang disentuh (`billing.controller.ts`, `schema.pg.ts`, `init.ts`) bersih dari kerjaan orang lain; sisanya file baru.

Risiko: (1) file dirty orang lain dihindari; (2) charges bisa berubah via sync Sheets, persen di-resolve ulang terhadap charges terbaru setiap render; (3) konflik multi-browser last-write-wins; (4) e2e butuh backend hidup.

## Di luar scope

Mengubah state machine invoice; menghapus baris tax; auth/roles baru (pakai guard dan Perm yang ada); migrasi manual data lama.
