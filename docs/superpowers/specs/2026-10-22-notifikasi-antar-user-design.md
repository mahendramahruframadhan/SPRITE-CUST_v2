# Design: Notifikasi Antar-User — 2026-10-22

Status: disetujui di chat 2026-10-22. Menunggu review file ini sebelum implementation plan.
Jalur: architectural. Keputusan kunci:

- PIC follow-up tetap teks bebas; backend match nama → `user.name` (trim,
  case-insensitive). Tidak ketemu → tidak kirim notif, tanpa error.
- Popi Nava: item jadwal TIDAK ditambah field pic. Notif dipicu saat item
  di-tandai audit (POST mark, `audited=true`): label item (`brand`/`name`)
  di-match ke `user.name` dengan cara sama.
- Izin kirim manual memakai matriks `role_permissions` (modul baru
  `notifications`), Super Admin selalu lolos — pola sama per modul lain.
- UI kirim manual ditunda; hanya endpoint POST + trigger otomatis.
- Trigger tambahan alur billing: saat data kasus divalidasi jadi
  `VALID - SIAP INVOICE` → notif `invoice_ready` ke SEMUA user role
  Finance (penerima by role, bukan match nama) — alur asli: Super Admin
  validasi dulu, Finance baru buat invoice & upload PDF.
- Tanpa websocket/redis/email/WA; frontend polling 60 detik.

## 1. Tujuan & success criteria

Pengguna menerima pemberitahuan antar-user di lonceng "Yang Harus Dicek"
yang sudah ada: saat ditunjuk PIC follow-up, atau saat item audit
Popi Nava-nya ditandai. Notif bisa dibaca/dihapus; hanya pemilik yang
melihat & memodifikasinya.

- Success: user yang punya nama sama dengan PIC follow-up menerima notif
  saat follow-up dibuat/di-update ke dirinya; mark audit Popi Nava
  menghasilkan notif bila label item == nama user; validasi kasus ke
  `VALID - SIAP INVOICE` menghasilkan notif ke semua user role Finance;
  dropdown lonceng menampilkan
  grup "Notifikasi dari tim" dengan polling 60 detik; klik item → mark read
  → navigasi ke `link`; badge bertambah.
- Non-goal: UI kirim manual; websocket/redis; email/WhatsApp; retention cron;
  field pic di item jadwal audit; ubah form follow-up.

## 2. Database

Tabel baru `notifications` (satu baris = satu notif untuk satu penerima):

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | text | PK uuid |
| `user_id` | text | NOT NULL, FK → `user(id)` ON DELETE CASCADE — penerima |
| `type` | text | NOT NULL; `followup_assigned`, `audit_done`, `invoice_ready`, `mention`, `custom` — string terbuka, tanpa enum DB |
| `title` | text | NOT NULL — baris utama dropdown |
| `body` | text | NULL — pembatas/penjelas |
| `link` | text | NULL — route frontend (mis. `/followups`, `/popinava`) |
| `read_at` | timestamp | NULL = belum dibaca |
| `group_id` | text | NULL — grouping opsional, tidak dipakai v1 |
| `created_at` | timestamp | default now() |

Index: `(user_id, created_at DESC)` dan `(user_id, read_at)`.
Ditambahkan ke `schema.pg.ts` dan path in-memory (pg-mem), pola sama dengan tabel lain.

## 3. Kontrak API (module `notifications`)

Guard: `SessionGuard` (cookie `x-auth-token`); user di-resolve dari sesi —
header `x-user-email` tidak dipercaya, sesuai pola existing.

- `GET /api/notifications` — milik sesi: `ORDER BY created_at DESC LIMIT 50`;
  respons `{notifications, unreadCount}`. Boleh diakses semua user login.
- `POST /api/notifications` — `PermGuard @Perm('notifications')` (matriks
  role_permissions, atur via halaman Roles). Body: `userIds[]` (≥1, semua
  harus user aktif), `type`, `title`, `body?`, `link?`, `groupId?`.
  Insert batch (satu baris per penerima). Penerima tidak dibatasi.
- `PATCH /api/notifications/:id/read` — set `read_at = now()` hanya untuk
  `WHERE id = :id AND user_id = sesi`; bukan miliknya → 404.
- `PATCH /api/notifications/read-all` — `WHERE user_id = sesi AND read_at IS NULL`.
- `DELETE /api/notifications/:id` — `WHERE id = :id AND user_id = sesi`;
  bukan miliknya → 404.

Error konvensional `{code,message}` + status existing (401/403/404 400).

## 4. Trigger otomatis (server-side, lewat helper)

Helper `NotificationsService.create(...)` dipanggil langsung dari service
yang memicu — tidak lewat HTTP POST, jadi tidak butuh izin.

- **Follow-up**: di `followups.service` create/update, setelah simpan —
  bila `pic` valid non-kosong: `SELECT id FROM user WHERE active=1 AND
  lower(trim(name)) = lower(trim(pic))` → ketemu dan id ≠ pelaku
  (dari sesi) → insert `followup_assigned`
  (title `"Client X — judul"`, body `"Anda ditunjuk sebagai PIC
  (follow-up {tanggal})"`, link `/followups`).
  Self-assign (pelaku = penerima) tidak kirim notif.
- **Popi Nava**: di `audit-schedule` POST mark, bila `audited=true` —
  label item (`type==='brand' ? brand : name`) di-match ke `user.name`
  cara sama → insert `audit_done` (title `"Audit {label}"`,
  body `"{pelaku} menandai audit untuk item Anda ({month} {weekKey})"`,
  link `/popinava`). Tidak ketemu → diam-diam skip; mark tetap berhasil.
- **Validasi billing** (alur asli: Super Admin validasi dulu, Finance baru
  buat invoice & upload PDF satu per satu): di `billing.controller`
  `PATCH cases/:uuid/audit` — bila `action` baru = `VALID - SIAP INVOICE`
  dan nilai sebelumnya berbeda — kirim `invoice_ready` ke SEMUA user
  `active` dgn `role = 'Finance'` (penerima by role, bukan match nama):
  title `"Kasus {label} sudah valid — siap dibuatkan invoice"`,
  body `"Data divalidasi oleh {pelaku}. Silakan buat invoice dan upload PDF."`,
  link `/billing`.

Fail-safe: error trigger/gagal match tidak pernah menggagalkan operasi utama
(follow-up/mark harus tetap sukses); notif dibuat best-effort.

## 5. Frontend

- `lib/api.js`: `fetchNotifications()`, `markNotificationRead(id)`,
  `markAllNotificationsRead()`, `deleteNotification(id)` — cookie auth sama.
- `ActionsContext.jsx`: source ke-5 — poll `GET /api/notifications` tiap 60s
  (setInterval; di-reset `refresh()`). Grup `id: 'notif'`, judul
  "Notifikasi dari tim", count = `read_at` NULL, items (max 4) = title +
  body, `left = sisanya`; grup ini TANPA `path` — navigasi hanya terjadi via
  klik tiap notif ke `link`-nya, bukan jump path grup.
- `NotificationBell.jsx`:
  - item grup "notif" berbeda: klik membuka **list per notif** (title, body,
    waktu relatif) di bawah header grup, bukan langsung jump path;
  - klik notif → `PATCH :id/read` lalu `navigate(link)`;
  - tombol "Tandai semua dibaca" (hanya tampil bila unread > 0) dan "Hapus"
    per notif di panel dropdown.
- `ActionsPanel.jsx` (Agenda Hari Ini dashboard): grup sama muncul dari
  context tanpa wiring tambahan.
- Meta ikon/warna grup `notif` ditambahkan di `lib/actionsMeta.js`.
- Badge total lonceng = total grup (termasuk notif unread), tidak berubah rumus.

## 6. Keamanan & batasan

- Semua read/write di-scope `user_id` dari sesi — bukan miliknya → 404/
  403; POST dijaga matriks role.
- Tanpa secrets baru; cookie auth & `.env` pola existing.
- Polling sederhana (60s), tanpa daemon; tabel kecil (LIMIT 50 + index).

## 7. Testing

- Backend (jest, pola suite existing): ownership scope (user lain → 404/403),
  POST validasi (userIds kosong/user tak aktif/type title wajib), PermGuard
  POST, GET limit + unreadCount, match nama trigger (ketemu / tidak ketemu /
  self-assign), Popi Nava mark audited=true → notif, billing audit →
  `VALID - SIAP INVOICE` → notif ke role Finance (sekali per perubahan,
  bukan dobel), fail-safe (error trigger
  tidak gagalkan operasi pemicu).
- Frontend: lint + manual flow (badge, polling, mark read, navigate,
  mark-all, hapus).
