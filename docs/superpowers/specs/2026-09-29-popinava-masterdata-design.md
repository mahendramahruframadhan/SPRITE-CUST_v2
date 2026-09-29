# PRD: Modul Master Data POPI NAVA (SPRITE-CUST_v2)

Status: DRAFT, menunggu review
Tanggal: 2026-09-29
Pendekatan: A (modul khusus `popinava`), disetujui user
Sumber data: `DOC. CUSTOMER ACTIVE.xlsx`, sheet `POPI NAVA`

---

## 1. Ringkasan

Membangun modul master data untuk outlet/department brand yang tercatat di
sheet `POPI NAVA`, berupa halaman baru di SPRITE-CUST_v2 beserta tabel
Postgres sendiri, endpoint CRUD, impor Excel/CSV dengan preview, ekspor,
dan aksi massal. Data self-contained (tidak dirujuk modul lain), izin tulis
memakai matriks `role_permissions` yang sudah ada (kunci modul `popinava`).

## 2. Konteks & fakta data sumber

Fakta di bawah diukur langsung dari sheet `POPI NAVA` (sheet ke-9 dalam
workbook, judul sel A1 `SERVICE - POPI NAVA`, header di baris 5):

| Fakta | Nilai |
| --- | --- |
| Baris data | 88 |
| Brand | 13: HAPPY GO LUCKY, 308 ABSOLUTE, DISCLOSURE, ENGINEER, EVIL ARMY, MAYOUTFIT, HUMAN GREATNESS LABS, HOUSE OF SHOPAHOLIC, HEUVEL TRIBE, AMIMI, SCREAMOUS, SMITH, STARCROSS |
| Distribusi per brand | MAYOUTFIT 23, SMITH 11, STARCROSS 10, SCREAMOUS 9, DISCLOSURE 7, HUMAN GREATNESS LABS 7, HOUSE OF SHOPAHOLIC 6, EVIL ARMY 4, HAPPY GO LUCKY 3, AMIMI 3, 308 ABSOLUTE 2, HEUVEL TRIBE 2, ENGINEER 1 |
| Kolom | uuid, rvt_custcode, dept_code, dept_name, dept_channel_name, dept_reference, iso_code, address, city, province, postcode, country, area, region, email, notes, created_at |
| dept_name | DISTRIBUTION 15, SHOP 73 |
| dept_code prefix | `030103` (distribution) 15, `030105` (shop) 72, `030205` 1 |
| iso_code | 14 nilai, pola `ID-XX` (ID-JB, ID-YO, ID-JK, ID-JI, ID-BA, dst.) |
| Kolom selalu `-` | dept_reference, email, notes (88/88) |
| Duplikat | Tidak ada duplikat uuid, `(rvt_custcode, dept_code)`, maupun `(rvt_custcode, dept_channel_name)` |
| created_at | 2022-12-20 s/d 2026-08-18 |

Masalah kualitas data yang harus ditangani desain ini:

1. **53 dari 88 baris kolom `country`/`area`/`region` bergeser (shift).**
   Baris selaras: `country=INDONESIA, area=P.JAWA, region=WIB|JAWA BARAT`.
   Baris bergeser: `country=P.JAWA, area=WIB, region=INDONESIA`.
2. **43 baris postcode bermasalah**: placeholder `0`, `12345`, `4000`,
   `40000`, `40197`, angka tak wajar `4265106`, atau kosong/`-`.
3. **2 address berisi `-`.**
4. Tidak ada kolom status (active/inactive) di sheet, sedangkan fitur bulk
   action menuntut deaktivasi.

Gabungan baris yang minimal kena satu peringatan (postcode atau address):
44 dari 88.

## 3. Tujuan & kriteria sukses

Tujuan:

- Data outlet POPI NAVA bisa dikelola di aplikasi (baca, tulis, impor,
  ekspor) tanpa menyunting Excel secara manual.
- Impor file dari sheet sumber berjalan aman: user melihat preview
  valid/error sebelum data masuk database.
- Perubahan tercatat siapa dan kapan (audit).

Kriteria sukses:

- 88 baris dari file sumber bisa diimpor penuh dengan hasil commit
  `created + updated = 88`, tanpa baris error tak tertangani.
- Semua baris bergeser (poin 2.1) otomatis dinormalkan saat preview, dan
  preview menampilkan normalisasi yang dilakukan.
- Semua endpoint tulis mengembalikan 403 untuk role tanpa izin `popinava`.
- Halaman punya state kosong, loading, dan error (R-27), serta bisa
  dioperasikan dengan keyboard.

## 4. Pengguna & izin

| Aksi | Izin |
| --- | --- |
| List, search, filter, lihat preview | GET terbuka (konvensi repo: GET tidak diguard) |
| Create, update, delete, bulk, commit impor | `Perm('popinava')`, dicek `PermGuard` terhadap `role_permissions` |
| Ekspor | Ikut modul `popinava` (dijaga, karena bisa membocorkan data massal) |

- Kunci modul baru: `popinava`, disemua ke `ROLE_PERMS` di
  `backend/src/db/init.ts` (default: Super Admin dan Admin CS `1`,
  lainnya `0`, mengikuti pola modul `cfg`).
- Matriks modul muncul otomatis di halaman `/roles` (tab Role & Izin Modul)
  setelah baris `popinava` disemua, tanpa perubahan halaman itu.
- Frontend menyembunyikan tombol tulis bila role tanpa izin, dan menangani
  401 (`SESSION_EXPIRED`) / 403 dengan pesan yang sama seperti modul lain.

## 5. Scope

Masuk scope:

- Tabel `popinava_outlets` + migrasi (drizzle push / init).
- Modul backend `popinava`: CRUD, preview impor, commit impor, ekspor,
  bulk action, template CSV.
- Halaman frontend `PopiNavaPage.jsx`: daftar + filter + search, drawer
  form create/edit, wizard impor 3 langkah, ekspor, bulk action.
- Registrasi izin `popinava` dan entri audit `activity_logs`.

Di luar scope (YAGNI, tidak dikerjakan sekarang):

- Integrasi Google Sheets API / sinkron otomatis (diputuskan: upload manual).
- Relasi FK ke modul `cases`, `clients`, atau sheet config lain.
- Perbaikan data sumber Excel (kolom postcode tetap apa adanya, hanya
  dinormalisasi saat masuk aplikasi).
- Halaman dashboard/visualisasi khusus modul ini.
- Multi-sheet/multi-tenant: hanya sheet `POPI NAVA`.

## 6. Desain arsitektur

Mengikuti pola repo yang sudah ada:

```
backend/src/popinava/
  popinava.controller.ts   # endpoint + @Perm('popinava') pada tulis
  popinava.service.ts      # query, validasi, impor, ekspor
  popinava.validation.ts   # aturan field + normalisasi (unit-test murni)
  popinava.parse.ts        # parser .xlsx / .csv → row mentah (unit-test murni)
frontend/src/pages/PopiNavaPage.jsx
frontend/src/components/popinava/   # ImportWizard, OutletDrawer, dsb. bila perlu dipecah
```

Dependensi baru backend: `exceljs` (baca/tulis `.xlsx`), `multer`
(upload multipart). Impor CSV diparse tanpa dep tambahan.

Alur data:

```
file (.xlsx/.csv)
  → POST /popinava/import/preview   (parse + validasi + normalisasi)
  → user melihat preview (valid / error / peringatan)
  → POST /popinava/import/commit    (server re-validasi, upsert)
  → activity_logs + hasil {created, updated, skipped, errors}
```

Server tidak pernah mempercayai hasil parse dari client: commit selalu
menerima file yang sama (atau baris hasil preview yang dikirim balik
lengkap), lalu divalidasi ulang di server sebelum menulis DB.

## 7. Skema data

Tabel `popinava_outlets` (drizzle, `schema.pg.ts`):

| Kolom | Tipe | Ketentuan |
| --- | --- | --- |
| uuid | text PK | dari sheet; bila create manual, generate UUID v4 |
| brand_name | text NOT NULL | dari blok label di sheet / kolom `brand_name` |
| rvt_custcode | text NOT NULL | pola `RVT-XXX` |
| dept_code | text NOT NULL | 8 digit, pola `03XXXXXX` |
| dept_name | text NOT NULL | `DISTRIBUTION` \| `SHOP` |
| dept_channel_name | text NOT NULL | nama outlet/channel |
| dept_reference | text | nullable (sumber selalu `-`, dinormalkan ke NULL) |
| iso_code | text NOT NULL | pola `ID-XX` |
| address | text | nullable |
| city | text NOT NULL | |
| province | text NOT NULL | |
| postcode | text | tipe text (menampung `0`, `12345`, kosong) |
| country | text | hasil normalisasi |
| area | text | hasil normalisasi (mis. `P.JAWA`) |
| region | text | hasil normalisasi (mis. `WIB`) |
| email | text | nullable |
| notes | text | nullable |
| status | text NOT NULL DEFAULT 'active' | `active` \| `inactive` |
| source_created_at | timestamptz | dari kolom `created_at` sheet |
| created_at | timestamptz DEFAULT now() | waktu record dibuat di aplikasi |
| updated_at | timestamptz | diisi saat update |
| updated_by | text | email user |

Constraint & index:

- `UNIQUE (rvt_custcode, dept_code)` (pasangan ini unik pada data sumber).
- Index: `brand_name`, `city`, `status`, `iso_code`.
- `CHECK (status IN ('active','inactive'))`.

Alasan `postcode` ber-tipe text: nilai sumber berupa placeholder dan angka
yang tidak pernah dipakai sebagai angka; memaksa integer akan membuang
data atau gagal parse.

## 8. Aturan validasi & normalisasi

### 8.1 Wajib (error, baris ditolak pada preview)

| Field | Aturan |
| --- | --- |
| uuid | terisi, format UUID, unik dalam file |
| brand_name | terisi |
| rvt_custcode | terisi, cocok `^RVT-[A-Z0-9]{2,5}$` |
| dept_code | terisi, 8 digit angka |
| dept_name | salah satu `DISTRIBUTION`, `SHOP` |
| dept_channel_name | terisi, maks 120 karakter |
| iso_code | cocok `^ID-[A-Z]{2}$` |
| city, province | terisi |

Lintas-baris: `(rvt_custcode, dept_code)` unik dalam file impor;
uuid duplikat dalam file = error.

### 8.2 Peringatan (baris tetap boleh masuk, ditandai di preview)

- `postcode` kosong, `0`, `12345`, `4000`, `40000`, `40197`, atau bukan
  5 digit angka.
- `address` kosong atau `-`.
- `dept_reference`, `email`, `notes` berisi `-` (dinormalkan jadi NULL).
- `created_at` kosong atau tidak bisa dibaca sebagai tanggal.

### 8.3 Normalisasi otomatis (dilakukan server, dicatat di preview)

1. **Koreksi shift kolom**: bila `country != 'INDONESIA'` DAN
   `region == 'INDONESIA'`, geser kanan satu kolom
   (`country ← region, area ← country, region ← area`).
   Setelah dikoreksi, wajib berlaku `country == 'INDONESIA'`; bila tidak,
   baris masuk error `kolom negara tidak konsisten`.
   Alasan: 53 dari 88 baris sumber bergeser, aturan ini deterministik dan
   aman karena hanya dipicu oleh pola yang terukur.
2. `dept_reference/email/notes` yang `-` → NULL.
3. `postcode` numerik dari Excel (`40114.0`) → string tanpa desimal.
4. `brand_name` dan semua teks: trim, rapikan spasi ganda, huruf kapital
   sesuai sumber (tidak diubah paksa ke upper/lower).
5. Header sheet dipetakan case-insensitive; kolom `brand_name` opsional
   (untuk format CSV blok pola lama).

### 8.4 Mode commit

- `upsert` (default): uuid ada → update, tidak ada → insert.
- `skip-existing`: uuid ada → lewati, hanya insert baru.
- Tidak ada mode "replace/hapus yang tidak ada di file" (berbahasa
  destruktif, ditolak scope-nya).

## 9. API

Semua di bawah prefix `/api/popinava`. Tulis dijaga `@Perm('popinava')`
dan `SessionGuard`.

| Method | Path | Body/Query | Respons |
| --- | --- | --- | --- |
| GET | `/` | `search, brand[], dept_name, status, city, area, iso_code, page=1, pageSize=50, sort=field:asc\|desc` | `{ items, total, page, pageSize, facets: { brands[], cities[], areas[], statuses[] } }` |
| GET | `/:uuid` | | satu baris, 404 bila tak ada |
| POST | `/` | body outlet (tanpa system field) | 201, baris baru |
| PATCH | `/:uuid` | body parsial | 200, baris terupdate |
| DELETE | `/:uuid` | | 204 |
| POST | `/bulk` | `{ action: 'delete'\|'set-status', uuids[], status? }`, maks 1000 uuid | `{ affected }` |
| POST | `/import/preview` | multipart `file` (.xlsx/.csv, maks 5 MB) | `{ fileName, totalRows, valid, withWarnings, errors[], normalized[] }` |
| POST | `/import/commit` | `{ file: <file sama>, mode: 'upsert'\|'skip-existing' }` | `{ created, updated, skipped, failed, errors[] }` |
| GET | `/export` | filter sama dengan list, `format=csv\|xlsx` | stream file, `Content-Disposition` |
| GET | `/template` | | CSV template dengan header + 1 baris contoh |

Detail respons preview:

```json
{
  "totalRows": 88,
  "valid": 88,
  "withWarnings": 44,
  "errors": [
    { "row": 12, "uuid": "…", "field": "dept_code", "code": "INVALID_FORMAT", "message": "dept_code harus 8 digit" }
  ],
  "normalized": [
    { "row": 18, "field": "country/area/region", "from": "P.JAWA|WIB|INDONESIA", "to": "INDONESIA|P.JAWA|WIB" }
  ]
}
```

Aturan umum respons error: `{ code, message }` dengan kode
`VALIDATION_FAILED`, `DUPLICATE_UUID`, `UNIQUE_VIOLATION`,
`FILE_TOO_LARGE`, `UNSUPPORTED_FILE`, `PERMISSION_DENIED`.

Commit bersifat all-or-nothing: satu baris error pun membuat seluruh
transaksi dibatalkan (respons `{created:0, updated:0, errors:[…]}`).
Tidak ada mode "lanjut sebagian"; user memperbaiki file lalu mengunggah
ulang. Alasan: mengimpor sebagian baris ke master data membuat data setengah
jadi sulit dilacak.

## 10. UI

Rute: `/popinava`, menu **POPI NAVA** pada grup menu data/master yang
sudah ada. Ikon mengikuti ikon menu yang dipakai modul sejenis (tidak
menambah ikon baru dekoratif).

### 10.1 Halaman utama

- Header: judul, ringkasan (`n` brand, `n` outlet aktif, `n` nonaktif),
  tombol `Impor`, `Ekspor`, `Tambah Outlet` (tombol tulis disembunyikan
  tanpa izin).
- Filter: search (debounce 300 ms, cara di uuid, nama channel, alamat,
  kota), dropdown brand, dept_name, status, kota, area; tombol reset.
- Tabel: checkbox seleksi, brand, custcode, dept_code, dept_name,
  channel, iso, kota, provinsi, postcode, area, status, created_at,
  aksi (edit, hapus).
- Pagination server-side (default 50/baris), sort per kolom kunci.
- Selection bar muncul saat ada checkbox terpilih: `Nonaktifkan`,
  `Aktifkan`, `Hapus` (dengan dialog konfirmasi menyebut jumlah baris).

### 10.2 Form tambah/edit (drawer)

Field mengikuti kolom skema; `dept_name` sebagai select 2 opsi; `status`
sebagai select active/inactive. Validasi client meniru aturan 8.1,
server tetap otoritatif. Simpan → toast sukses → tabel refresh.

### 10.3 Wizard impor (modal, 3 langkah)

1. **Unggah**: drag-drop / pilih file `.xlsx` atau `.csv`, maks 5 MB,
   tautan unduh `template`.
2. **Preview**: tab `Valid (n)`, `Peringatan (n)`, `Error (n)`;
   tabel baris + pesan per baris; tombol `Normalisasi yang dilakukan`
   menampilkan daftar koreksi (8.3). Pilihan mode `upsert` /
   `skip-existing`. Tombol `Batalkan` dan `Import n Baris` (dinonaktifkan
   bila semua baris error).
3. **Hasil**: `created / updated / skipped / failed`, daftar error bila
   ada, tombol `Tutup` (tabel refresh otomatis).

### 10.4 State & aksesibilitas

- Loading: skeleton baris tabel.
- Kosong: pesan "Belum ada data outlet" + tombol `Impor` (CTA nyata).
- Error: banner dengan pesan server + tombol `Coba lagi`.
- Semua kontrol bisa dicapai `Tab`, dialog tertutup dengan `Escape`,
  fokus terlihat, kontras teks memenuhi WCAG AA.
- Ukuran mengikuti pola halaman list yang sudah ada di repo (bukan
  layout template baru).

## 11. Ekspor

- Mengikuti filter aktif di halaman, bukan seluruh tabel kecuali filter
  kosong.
- `format=csv` (default): BOM UTF-8 agar dibuka benar di Excel.
- `format=xlsx`: satu sheet, header sebagai baris pertama.
- Baris export mencatat `activity_logs` (jumlah baris, aktor).
- Kolom export = 18 kolom data (sampai `created_at` sumber), tanpa kolom
  internal sistem (`created_at` aplikasi, `updated_at`, `updated_by`).

## 12. Audit

Setiap aksi tulis mencatat ke `activity_logs` dengan pola modul lain:
actor (email), aksi (`popinava.create`, `popinava.update`,
`popinava.delete`, `popinava.bulk_delete`, `popinava.bulk_status`,
`popinava.import`, `popinava.export`), ringkasan jumlah/baris, waktu.
Impor menyimpan ringkasan `{created, updated, skipped, failed}`.

## 13. Error handling

| Kondisi | Respons | Tampilan UI |
| --- | --- | --- |
| Sesi habis | 401 `SESSION_EXPIRED` | redirect login (pola repo) |
| Role tanpa izin | 403 | toast "Anda tidak punya izin…" |
| File > 5 MB / tipe salah | 413/415 `FILE_TOO_LARGE` / `UNSUPPORTED_FILE` | pesan di langkah 1 wizard |
| uuid bentrok dengan baris lain saat create | 409 `UNIQUE_VIOLATION` | field error di form |
| Semua baris preview error | commit ditolak | tombol import dinonaktifkan |
| Server error tak terduga | 500 `INTERNAL` | banner + `Coba lagi`, log server |

## 14. Testing

Mengikuti runner yang sudah ada (`node --test`):

- Backend (`backend/test/popinava.*.test.ts`):
  - `popinava.validation`: 8.1 error, 8.2 warning, 8.3 normalisasi shift
    (kasus 53 baris bergeser + kasus 35 baris selaras), postcode numerik.
  - `popinava.parse`: header ditemukan di baris mana pun, blok brand,
    CSV dengan kolom `brand_name`, file rusak → `UNSUPPORTED_FILE`.
  - Service: upsert vs skip-existing, rollback saat commit berisi error,
    batas bulk 1000. Test service/controller memakai helper pg-mem
    `backend/test/helpers/pgmem.ts` (DDL `popinava_outlets` ditambahkan ke
    `setupTables()`), impor helper duluan sebelum modul `src` seperti test
    `billing.flow.test.ts`.
  - Controller: 403 tanpa izin `popinava`, 401 tanpa sesi, memakai
    `seedUser(role)` yang sudah ada di helper.
- Frontend (`frontend/test/*.test.mjs`): parsing format pesan preview,
  penyembunyian tombol saat tanpa izin.
- Manual checklist: wizard 3 langkah memakai file sumber
  `DOC. CUSTOMER ACTIVE.xlsx` (88 baris), keyboard nav, empty state.

## 15. Acceptance criteria

1. Unggah `DOC. CUSTOMER ACTIVE.xlsx` (sheet `POPI NAVA`) → preview
   melaporkan 88 baris, 0 error, 44 baris peringatan (43 postcode,
   2 address, satu baris kena keduanya), dan 53 entri normalisasi shift
   kolom country/area/region.
2. Commit mode `upsert` → `created + updated = 88`, tabel menampilkan
   88 baris, 13 brand muncul di dropdown filter.
3. Commit kedua dengan file yang sama → `created=0, updated=88` (idempoten).
4. Edit satu outlet dari tabel → `updated_at`/`updated_by` berubah,
   muncul di `activity_logs`.
5. Hapus 1 outlet (konfirmasi) → baris hilang, 404 saat GET `/:uuid`.
6. Bulk `set-status=inactive` pada 5 baris → 5 baris berubah status,
   filter `inactive` menampilkan persis 5 baris.
7. Ekspor dengan filter brand `MAYOUTFIT` → CSV berisi tepat 23 baris
   data + header.
8. Role tanpa izin `popinava`: tombol tulis tersembunyi, POST langsung
   mengembalikan 403.
9. Tanpa data: halaman menampilkan empty state dengan tombol Impor;
   saat server mati: banner error + `Coba lagi`.
10. Semua endpoint CRUD + impor teruji test otomatis hijau
    (`npm test` di backend & frontend).

## 16. Risiko & keputusan terbuka

| No | Item | Keputusan saat ini |
| --- | --- | --- |
| 1 | Sheet sumber bisa berubah format (tambah kolom, geser header) | Parser dipetakan case-insensitive dan berbasis nama kolom, bukan indeks; kolom tak dikenal diabaikan dan dicatat di preview |
| 2 | Data postcode placeholder dibiarkan | Diterima dengan peringatan (bukan error), agar impor 88 baris tidak macet |
| 3 | Apakah brand_name dikunci ke daftar tetap | Tidak, teks bebas + facet dari data; daftar brand baru cukup muncul di file |
| 4 | Sinkronisasi Google Sheets di masa depan | Di luar scope; endpoint service dirancang menerima "baris hasil parse" agar penambahan sumber nanti hanya menambah parser |
| 5 | Sheet lain di workbook (`brandInfo`, `in_out`, dll.) | Di luar scope modul ini |

## 17. Referensi

- File sumber: `/home/revota/Desktop/project-work/readme mitigasi vide codding sop/temp/DOC. CUSTOMER ACTIVE.xlsx`, sheet `POPI NAVA`.
- Konvensi backend: `backend/src/db/init.ts` (`ROLE_PERMS`, DDL
  `role_permissions`), `backend/src/auth/perm.guard.ts` (`@Perm(modul)`),
  pola controller `backend/src/billing/billing.controller.ts`.
- Konvensi frontend: halaman list `frontend/src/pages/*.jsx`, matriks izin
  `frontend/src/pages/RolesPage.jsx`.
- Test runner: script `test` di `backend/package.json` dan
  `frontend/package.json` (`node --test`).
