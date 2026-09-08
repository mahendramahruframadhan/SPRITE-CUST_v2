# Kontrak Backend — Registrasi Akun Pertama ✅ TERIMPLEMENTASI

> Implementasi: `backend/src/setup/setup.controller.ts`,
> `backend/src/auth/auth.controller.ts` (sign-up diperkuat),
> validasi bersama `backend/src/auth/register.validation.ts`.
> Alur: **daftar hanya menyimpan ke DB** → frontend mengarahkan ke `/login`
> (tanpa auto-login); pengguna mengisi email & password lalu login di sana.

## 1. Endpoint yang dibutuhkan

### 1.1 `GET /api/setup/status` (publik, tanpa auth)

Mendeteksi instalasi fresh — dipakai frontend untuk memilih mode wizard.

Request: tanpa body.

Response `200`:

```json
{ "firstRun": true, "userCount": 0 }
```

Aturan:

- `firstRun = true` **iff** tabel user kosong (`userCount === 0`).
- `userCount` = `SELECT COUNT(*) FROM "user"`.
- Tanpa rate-limit ketat, tapi boleh `Cache-Control: no-store`.

### 1.2 `POST /api/setup/first-admin` (publik, HANYA saat firstRun)

Membuat **akun pertama = Super Admin**. Setelah 1 user ada,
endpoint ini harus mati permanen.

Request:

```json
{ "name": "Rani Admin", "email": "rani@revota.id", "password": "secret123" }
```

Validasi (cerminkan `frontend/src/features/register/validation.js`):

| Field    | Aturan                                              |
| -------- | --------------------------------------------------- |
| `name`   | wajib, 2–100 karakter setelah trim                  |
| `email`  | wajib, format email, max 254, unik (case-insensitive)|
| `password`| wajib, 5–128 karakter (jangan naikkan tanpa sync FE)|

Perilaku:

- Cek `userCount === 0` **di dalam transaksi** (hindari race 2 request bersamaan).
- Hash password dengan mekanisme yang sama seperti sign-up existing (better-auth).
- Set `role = 'Super Admin'` di sisi server — **abaikan role dari client**.
- Seed `role_permissions` default bila belum ada (opsional, idempoten).
- Tulis ke `roles/logs`: `{ who: email, action: 'setup.first-admin' }`.

Response:

- `201 { "user": { "id": "...", "name": "...", "email": "...", "role": "Super Admin" } }`
- `409 { "code": "ALREADY_INITIALIZED", "message": "..." }` bila user sudah ada.
- `409 { "code": "EMAIL_TAKEN", "message": "..." }` bila email duplikat.
- `400 { "code": "VALIDATION_ERROR", "fields": { "email": "..." } }` bila validasi gagal.

Keamanan:

- Rate-limit: max ~10 req/menit/IP untuk `/setup/*`.
- Jangan bocorkan apakah email sudah terdaftar sebelum firstRun selesai
  (gunakan pesan generik bila perlu — frontend sudah generik).
- Respons tidak boleh mengembalikan password / hash.

### 1.3 Endpoint existing (tetap dipakai, tanpa perubahan)

`POST /api/auth/sign-up/email` — akun reguler, role awal `Viewer`.

## 2. Skema DB

Tidak perlu migrasi baru bila tabel `"user"` sudah punya kolom role/name.
Jika belum: tambah kolom `role TEXT DEFAULT 'Viewer'`, index unik
`LOWER(email)`. Verifikasi: `SELECT email FROM "user" LIMIT 1`.

## 3. Test plan backend (saat implementasi nanti)

1. DB kosong → `GET /setup/status` = `{ firstRun: true, userCount: 0 }`.
2. `POST /setup/first-admin` valid → `201`, role `Super Admin`.
3. Ulangi `POST /setup/first-admin` → `409 ALREADY_INITIALIZED`.
4. `GET /setup/status` → `{ firstRun: false, userCount: 1 }`.
5. Login dengan akun pertama → dapat mengakses `/roles`.
6. Concurrent double-POST → tepat 1 user tercipta (transaksi + unique).

## 4. Checklist go-live

- [ ] Kedua endpoint di atas diimplementasikan + guard firstRun transaksional
- [ ] Frontend diuji dengan `?firstrun=1` (paksa mode akun pertama)
       dan `?demo=1` (tanpa backend sama sekali)
- [ ] Seed 6 user existing tetap berfungsi (tidak tertimpa)
- [ ] Hapus fallback notice "mode kompatibilitas" bila sudah live
