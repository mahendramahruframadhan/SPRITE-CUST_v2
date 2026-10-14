# Spec: PPN, PPH & Subtotal di Halaman Finance

Status: DRAFT, menunggu review user
Tanggal: 2026-10-12
Cabang: `dev/refactor-ppn&pph-20261012`
Pendekatan: frontend-only fase 1 (backend menyusul), disetujui user
Arah visual: `DESIGN.md` (dial ENERGY 2 / RHYTHM 2 / MOTION 1), filter antislop mode DURING

---

## 1. Ringkasan

Menambahkan tiga hal di halaman `/finance` (`frontend/src/pages/FinanceAuditPage.jsx`):

1. **PPN** via dropdown `PPN / Non PPN`. Non PPN: PPN = 0, tidak ada modal.
   PPN: modal dengan pilihan mode **Persen** atau **Rupiah** yang
   diakumulasikan ke total charges.
2. **PPH** via dropdown `PPH / Non PPH` (default Non PPH), input fleksibel:
   mode **Persen** (dihitung otomatis dari Total Charges) atau **Manual**
   (rupiah tetap).
3. **Panel Subtotal & Pajak** yang merangkum:
   `Subtotal Akhir = Total Charges + PPN − PPH`.

Seluruh state level-halaman, disimpan di `localStorage` (tanpa API pada fase ini).

## 2. Konteks (hasil riset)

- `FinanceAuditPage.jsx` (1116 baris) menghitung `filtered` (kasus tervalidasi
  sesuai filter tanggal/brand/status invoice) dan `total = Σ charges` (baris 546).
- `total` tampil di badge "Total filter" (baris ~800) dan footer tabel
  (baris ~995): `{filtered.length} kasus · Total: Rp X`.
- Tidak ada kode PPN/PPH/pajak di seluruh repo (frontend, backend, mockup, PRD).
- Pola yang dipakai ulang: modal ala modal PAID (baris ~1043), dropdown via
  `usePopover` + portal (pola export billing), penyimpanan lokal
  `localStorage` dengan parse terjaga.
- Desain sebelumnya disetujui user via chat (2026-10-12); spec ini
  menuliskan ulang desain tersebut.

## 3. Tujuan & kriteria sukses

- User bisa memasukkan PPN dan PPH untuk daftar kasus yang sedang tampil,
  lalu membaca Subtotal Akhir yang benar dalam satu panel rekap.
- Nilai pajak bertahan setelah refresh (localStorage), tanpa backend.
- Kriteria sukses:
  - Rumus `Subtotal = Total + PPN − PPH` terverifikasi unit test dan e2e
    dengan angka persis.
  - Non PPN / Non PPH = kontribusi 0 dan tidak pernah membuka modal.
  - Dropdown dan modal beroperasi penuh dengan keyboard (Tab, Enter, Escape)
    dan lolos Delivery Gate antislop.

## 4. Keputusan desain (sudah disetujui user)

| No | Keputusan | Alasan (satu baris) |
| --- | --- | --- |
| D1 | `Subtotal = Total + PPN − PPH` (PPH mengurangi) | Praktik umum PPh dipotong saat pembayaran |
| D2 | PPN dua mode di modal: **Persen** (default) atau **Rupiah**, dipilih di modal | Revisi user 2026-10-12: modal PPN bisa diisi rupiah maupun persen |
| D3 | PPH dua mode: Persen (default) atau Manual | Permintaan user: input fleksibel, manual atau tidak terserah |
| D4 | Base persen PPH = Total Charges (filter aktif) | DPP layanan umumnya tidak termasuk PPN |
| D5 | Persistensi `localStorage` key `finance-tax-v1` | Fase frontend-only; sinkron API = fase 2 |
| D6 | Nilai pajak level-halaman, bukan per baris | User meminta akumulasi ke total, bukan kolom kasus |
| D7 | Footer tabel tetap menampilkan Total Charges murni | Panel Subtotal adalah satu-satunya tempat akumulasi, tidak ada dua "total" yang berbeda |
| D8 | Subtotal negatif (PPH > Total + PPN) tampil apa adanya | Tanpa clamp; angka jujur lebih baik daripada diam-diam diubah |

## 5. Desain UI

### 5.1 Panel Subtotal & Pajak (`TaxSummaryPanel`)

Komponen baru `frontend/src/components/TaxSummaryPanel.jsx`, kartu `Reveal`
di antara panel Filter dan tabel (alur: filter -> rekap -> tabel). Props:
`total` (number). Isi:

- Baris rincian (label kiri, nilai kanan, `tabular-nums`):
  - `Total Charges` = `total` filter aktif
  - `PPN` = nilai rupiah saat aktif, atau label `Non PPN` (abu) saat non
  - `PPH` = nilai rupiah saat aktif, atau label `Non PPH` (abu) saat non
  - Garis pemisah
  - `Subtotal Akhir` = `total + ppn − pph` (angka besar, bold, satu-satunya
    focal point panel)
- Dua tombol dropdown di sisi kanan panel, gaya tombol export billing
  (pola `usePopover`: portal, tutup Escape, fokus item pertama):
  - `PPN: Non PPN ▾` / `PPN: Rp 110.000 ▾`
  - `PPH: Non PPH ▾` / `PPH: Rp 50.000 ▾`
- Empty state: saat `filtered` kosong (`total = 0`) panel tetap tampil
  dengan angka Rp 0 (R-27); loading/error mengikuti halaman induk.
- Kontras teks memakai token slate/emerald yang sudah ada (R-25).

Menu dropdown selalu punya dua item:

- `PPN (isi pajak)…` / `PPH (isi pajak)…` -> membuka modal (edit bila sudah aktif)
- `Non PPN (reset)` / `Non PPH (reset)` -> menonaktifkan dan menghapus nilai tersimpan

### 5.2 Modal PPN

Gaya modal PAID: backdrop blur, header gradient emerald, `role="dialog"`
`aria-modal="true"`, tutup via Escape, backdrop klik, dan tombol Batal.
Struktur identik dengan modal PPH (5.3), termasuk toggle mode:

- **Persen** (default): input `% dari Total Charges` (desimal diizinkan),
  preview `Rp round(total × % / 100)` yang ikut hidup bila `total` berubah.
  Nilai tersimpan `mode + percent`; rupiah diturunkan ulang saat render.
- **Rupiah**: input angka bulat >= 0 (hanya digit yang diterima), preview
  `PPN ditambahkan ke subtotal: Rp X`.
- Validasi inline: mode Persen: % kosong/negatif -> Simpan dinonaktifkan;
  mode Rupiah: kosong/bukan angka/negatif -> Simpan dinonaktifkan, pesan
  error di bawah input (R-27).
- Simpan -> `ppn = { enabled: true, mode, percent?, amount }` -> tutup modal.
- Non PPN -> `ppn = { enabled: false, mode: null, percent: 0, amount: 0 }`
  (nilai lama dihapus).

### 5.3 Modal PPH

Gaya identik dengan modal PPN (termasuk toggle mode):

- **Persen** (default): input `% dari Total Charges` (desimal diizinkan,
  mis. 2 / 0.5 / 0.3), preview `Rp round(total × % / 100)` yang ikut hidup
  bila `total` berubah. Nilai tersimpan adalah `mode + percent`; rupiah
  selalu diturunkan ulang dari `total` saat render.
- **Rupiah**: input rupiah bulat >= 0, sama seperti modal PPN.
- Simpan -> `pph = { enabled: true, mode, percent?, amount }`, nilai `mode`
  hanya `"percent"` atau `"rupiah"`.
- Non PPH -> `pph = { enabled: false, mode: null, percent: 0, amount: 0 }`.

### 5.4 Aksesibilitas (R-32, R-26)

- Dropdown: `aria-expanded`, item menu bisa di-Enter, Escape menutup (pola
  `usePopover` yang sudah ada).
- Modal: Escape menutup, input menerima fokus saat terbuka (`autoFocus`),
  tombol Simpan/Batal bisa di Tab. Tidak ada kontrol mati.

## 6. Data model & persistensi

Bentuk di `localStorage['finance-tax-v1']`, dua kunci saja (`ppn`, `pph`),
keduanya berbentuk sama (mode/percent dipakai bila `enabled`):

```json
{
  "ppn": { "enabled": true, "mode": "rupiah", "percent": 0, "amount": 110000 },
  "pph": { "enabled": true, "mode": "percent", "percent": 2, "amount": 22000 }
}
```

Contoh lain isi salah satu kunci (mode persen, dan keadaan non-aktif):

```json
{ "enabled": true, "mode": "percent", "percent": 11, "amount": 110000 }
{ "enabled": false, "mode": null, "percent": 0, "amount": 0 }
```

Aturan:

- Parse terjaga: JSON rusak/hilang -> default kedua pajak non-aktif.
- Mode `percent`: `amount` selalu diturunkan ulang saat render, `amount`
  tersimpan hanya untuk keperluan tampilan sesaat (snapshot per refresh).
- Mode `rupiah`: `amount` tetap sampai user mengubah atau mereset.
- Simpan ke `localStorage` setiap kali state pajak berubah (subscribe
  `useEffect`).

## 7. Alur data

```
total (useMemo dari filtered, FinanceAuditPage)
  -> <TaxSummaryPanel total={total}>
       state ppn/pph (useState + localStorage)
       -> taxSummary.js (fungsi murni): computeSubtotal, amountFromPercent
          (dipakai PPN & PPH), sanitizeTaxState, validateRpInput
       -> render rincian + Subtotal Akhir
       -> dropdown (usePopover) -> modal (PPN | PPH) -> setState -> persist
```

Semua perhitungan di `frontend/src/lib/taxSummary.js` (murni, tanpa React),
supaya bisa diuji unit tanpa DOM.

## 8. Di luar scope (fase ini)

- Kolom pajak di export CSV Finance (export per baris kasus tidak memuat
  nilai level-halaman).
- Pajak per baris kasus / per invoice.
- Sinkronisasi ke backend/API/DB (fase 2).
- Pembuatan PDF invoice dengan nilai pajak.
- Mengubah footer tabel atau KPI yang sudah ada (lihat D7).

## 9. Testing

### Unit (`frontend/test/taxSummary.test.mjs`, `node --test`)

- `computeSubtotal`: kasus dua-duanya non, hanya PPN, hanya PPH, keduanya,
  hasil negatif (D8), input bukan angka -> angka 0.
- `amountFromPercent`: pembulatan ke rupiah bulat, persen 0, total 0,
  persen desimal (dipakai modal PPN dan PPH).
- `sanitizeTaxState`: JSON rusak, objek parsial, mode tak dikenal,
  angka negatif -> dinormalkan.
- `validateRpInput`: string digit, kosong, minus, desimal.

### E2E (`frontend/tests/finance-tax.e2e.ts`, `npx e2e`)

1. Default: keduanya Non, subtotal = Total Charges, modal tidak pernah muncul.
2. PPN rupiah 100.000 -> subtotal = total + 100.000 (angka persis).
3. PPN mode persen 11% -> nilai = round(total x 0.11), subtotal ikut benar.
4. PPH rupiah 50.000 -> subtotal = total + PPN - 50.000.
5. PPH mode persen 2% -> nilai = round(total x 0.02), subtotal ikut benar.
6. Reset Non PPN / Non PPH -> subtotal kembali ke Total Charges.
7. Escape menutup modal tanpa mengubah nilai.
8. Reload halaman -> nilai pajak bertahan (localStorage).

### Delivery Gate antislop (mode DURING)

Sebelum deliver: jalankan gate penuh (Hard Gate, Purpose-Gate, Liveliness,
Craftsmanship) dengan bukti per item, termasuk klik-manual setiap kontrol
(R-35) dan build + lint bersih.

## 10. Task breakdown (untuk implementation plan)

1. **Lib + unit test**: `frontend/src/lib/taxSummary.js` +
   `frontend/test/taxSummary.test.mjs` (RED -> GREEN).
2. **Panel + PPN**: `frontend/src/components/TaxSummaryPanel.jsx` (rincian,
   dropdown, modal PPN dua mode persen/rupiah), mount di
   `FinanceAuditPage.jsx`, e2e bagian PPN.
3. **PPH**: dropdown & modal PPH (mode persen/rupiah), perhitungan turunan,
   e2e bagian PPH.
4. **Persistensi + gate**: `localStorage` load/save, e2e reload, lint,
   build, unit+e2e penuh, Delivery Gate antislop.

Setiap task mengikuti TDD (test dulu) dan berhenti bila test hijau.
