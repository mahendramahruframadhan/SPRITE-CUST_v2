# Notifikasi Antar-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notifikasi antar-user (tabel `notifications` + endpoint + trigger otomatis + grup "Notifikasi dari tim" di lonceng/panel yang sudah ada).

**Architecture:** Tabel `notifications` (1 baris = 1 penerima); controller NestJS new module `notifications` dengan scope ketat `user_id = sesi`; trigger inject sebagai best-effort helper yang dipanggil dari `followups.service` (PIC), `audit-schedule` mark (label == nama user), dan `billing` PATCH audit (`VALID - SIAP INVOICE` → role Finance). Frontend: polling 60s di `ActionsContext`, grup ke-5 di `NotificationBell`/`ActionsPanel`.

**Tech Stack:** NestJS (controller tipis + service), drizzle/pg-mem + Postgres, node:test backend, React context polling, Tailwind, Vite build/lint manual.

**Spec:** `docs/superpowers/specs/2026-10-22-notifikasi-antar-user-design.md` — executors baca keduanya; spec adalah sumber kebenaran aturan.

## Global Constraints

- Guard: class-level `SessionGuard` (cookie `x-auth-token`); POST method-level `PermGuard @Perm('notifications')`. Header `x-user-email` tidak dipercaya.
- Semua read/write di-scope `user_id` milik sesi; bukan miliknya → 404 (`HttpException { code, message }`).
- Global prefix `api` sudah ada (main.ts) → `@Controller('notifications')` = `/api/notifications`.
- Pola repo: db via `getDb().pq(...)` (parameter, indexed `$n`), respons camelCase, error `{code,message}`, komentar bahasa Indonesia menjelaskan kenapa (bukan apa).
- Tanpa websocket/redis/email; polling tiap 60_000 ms; GET di-limit `LIMIT 50`.
- Type notif string terbuka; yang dipakai v1: `followup_assigned`, `audit_done`, `invoice_ready`.
- Seed izin default: Super Admin=1, semua role lain=0 (diatur via halaman /roles).
- Test backend: `npm --prefix backend test` (node --test + pg-mem, helper `test/helpers/pgmem.ts`); frontend: `npm --prefix frontend test` (node --test `test/*.test.mjs`) + `npm --prefix frontend run build` sebagai sanity.
- Komen style repo: `\n` error konvensional; JANGAN tambah secrets/env baru.

## Review Focus

1. **Nama PIC tidak persis sama** (spasi ganda, kapital, alias/nick) → tidak boleh kirim notif tapi follow-up/mark/validasi TETAP SUKSES (trigger best-effort, tidak melempar). — pinned di Task 2 step `test unknown pic → tidak ada notif`, Task 3 step `test label tanpa match → mark sukses tanpa notif`.
2. **Self-assign** (pelaku == penerima) → tidak ada notif sendiri-kirim. — Task 2 & Task 3 test.
3. **Notif ganda saat update follow-up tanpa perubahan pic** → notif hanya bila pic berubah (create selalu hitung sebagai perubahan dari null). — Task 2 test.
4. **Dua user nama sama** → penerima deterministik: `ORDER BY created_at LIMIT 1` (yang paling tua dibuat). — Task 1 test `findUserIdByName`.
5. **Polling saat logout / sesi mati** → tidak boleh loop redirect 401: polling hanya jalan bila `useAuth().user` ada; interval di-clear saat user hilang. — Task 5 (manual verify + kode step).

---

### Task 1: Backend — tabel, service, endpoints, matriks modul

**Files:**
- Modify: `backend/src/db/init.ts` (CREATE TABLE notifications di blok DDL; `ROLE_PERMS`: tambah `notifications: N` ke tiap role; blok backfill `ON CONFLICT (role,module) DO NOTHING` meniru pattern 'logs' sekitar init.ts:257-259)
- Modify: `backend/src/db/schema.pg.ts` (tambah export `notifications` drizzle table)
- Create: `backend/src/notifications/notifications.service.ts`
- Create: `backend/src/notifications/notifications.controller.ts`
- Modify: `backend/src/app.module.ts` (register NotificationsController, NotificationsService)
- Modify: `backend/src/roles/roles.controller.ts` (MODULES list + `'notifications'`)
- Modify: `backend/test/helpers/pgmem.ts` (tambah DDL notifications di `setupTables()`)
- Test: `backend/test/notifications.api.test.ts`

**Interfaces:**
- Consumes: `getDb()` (drizzle.service), `resolveSessionUser(db, req)` (auth/session.ts), `Perm/PermGuard` (auth/perm.guard.ts), `SessionGuard` (auth/session.guard.ts).
- Produces (dipakai Task 2-4): dari `notifications.service.ts`:
  - `type NotifRow = { userId: string; type: string; title: string; body?: string; link?: string; groupId?: string }`
  - `async function findUserIdByName(db, name: string): Promise<string | null>` — `SELECT id FROM "user" WHERE COALESCE(active,1)=1 AND lower(trim(name))=lower(trim($1)) ORDER BY created_at LIMIT 1`
  - `async function insertNotifications(db, rows: NotifRow[]): Promise<void>` — multi-row INSERT parameterized; userIds sudah divalidasi caller.
  - `export async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<void>` — try/catch: gagal → `console.warn('[notifications]', label, e)`; TIDAK pernah rethrow.
  - `class NotificationsService` (Injectable, `db = getDb()`): `list(userId)` → `{ notifications: Row[], unreadCount }` (ORDER BY created_at DESC LIMIT 50, row → camelCase: `{id, type, title, body, link, groupId, readAt, createdAt, userId}`); `send(userIds: string[], type, title, body?, link?, groupId?)` → validasi (≤50 userIds unik; cek semua userIds exist & aktif via satu batch SELECT), insert; `markRead(userId, id)`; `markAllRead(userId)`; `remove(userId, id)`; `getUnreadCount(userId)`.
- Produces (frontend Task 5 ikut kontrak respons): GET/POST/PATCH/DELETE di `/api/notifications` seperti spec §3.

- [ ] **Step 1: Write the failing test** `backend/test/notifications.api.test.ts`

Pola import: `process.env.DATABASE_URL = ''` DULU; import helper pgmem; `setupTables()` di before. Buat sesi via `createSession(db(), u.id)` + req stub `{ headers: { 'x-auth-token': t } }`, controller langsung: `const ctl = new NotificationsController()`.

`const seedNotif = async (userId, overrides = {}) => db(\`INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES (...)\`)`; rows camelCase direspons.

Tests:
1. `GET hanya milik sendiri, terbaru dulu, + unreadCount` — 2 user A/B, seed notif kedua-duanya; `ctl.list(reqA)` → hanya notif A, unread = milik A; mark read satu → unread −1.
2. `POST butuh izin modul notifications` — actor Finance dengan `role_permissions(Finance,'notifications',0)` → POST 403 (default Nest `ForbiddenException`, tanpa code kustom); ubah row allowed=1 → POST ok; semua userIds valid & aktif; respons `{ok:true, delivered:n}` (delivered = jumlah baris ter-insert).
3. `POST validasi` — userIds kosong/bukan array → 400 `VALIDATION_ERROR`; title kosong → 400; userId tak dikenal → 400 `USER_NOT_FOUND`; user inactive → 400 (cek via satu batch `SELECT id,active FROM "user" WHERE id = ANY($1)`).
4. `PATCH read milik lain → 404` — `ctl.markRead(reqA, id_notif_B)` kesal.
5. `read-all hanya NULL read_at user sendiri` — pre-insert notif B tak tersentuh.
6. `DELETE milik lain → 404; milik sendiri → hilang`.
7. `findUserIdByName` — trim/kapital tolerant; duplikat nama dua user → id user created_at TERTUA; user inactive → null.
8. Module matriks: assert `MODULES` di roles.controller.ts mengandung `'notifications'` (import + `includes()`) — mencegah payload /roles membuang modul ini diam-diam.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend test`
Expected: FAIL — notifications.api.test.ts (module/service perlu-wujud / DDL tak ada).

- [ ] **Step 3: Implementasi**

- `notifications.service.ts`: fungsi strategi di Interfaces. `insertNotifications` satu statement multi-value (pg-mem OK, ikut pola parameter); pakai `randomUUID()` id; timestamp `new Date()`.
- SQL `markRead`: `UPDATE notifications SET read_at=$1 WHERE id=$2 AND user_id=$3 AND read_at IS NULL RETURNING id`.
- `notifications.controller.ts`: `@UseGuards(SessionGuard) @Controller('notifications')`; tiap handler resolve actor via `req.user || resolveSessionUser(db, req)` (pola roles.controller.ts:39); POST: `@UseGuards(PermGuard) @Perm('notifications')`.
- DTO POST: `{ userIds, type, title, body?, link?, groupId? }`.
- Drizzle table di schema.pg.ts mengikuti pola tabel lain (references `user`).
- init.ts: `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, read_at TIMESTAMP, group_id TEXT, created_at TIMESTAMP);` + 2 index CREATE INDEX IF NOT EXISTS (`idx_notif_user_created (user_id, created_at DESC)`, `idx_notif_users_read (user_id, read_at)`).
- ROLE_PERMS: `'Super Admin': {..., notifications: 1}`, lainnya `notifications: 0`. Backfill blok: `INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ('${role}','notifications',${allowed},'${now}') ON CONFLICT (role,module) DO NOTHING` untuk tiap role, meniru pattern blok 'logs'/'report' existing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend test`
Expected: PASS semua test notifications + roles.modules tetap PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications backend/src/app.module.ts backend/src/db backend/src/roles/roles.controller.ts backend/test/helpers/pgmem.ts backend/test/notifications.api.test.ts
git commit -m "✨ feat(notifications): tabel + endpoint GET/POST/PATCH/DELETE + matriks modul"
```

### Task 2: Trigger followup_assigned (PIC follow-up)

**Files:**
- Modify: `backend/src/followups/followups.service.ts` create (setelah INSERT sukses, sekitar line 143-150) & update (setelah UPDATE sukses, line 165-183): panggil trigger best-effort.
- Test: `backend/test/followups.notify.test.ts`

**Interfaces:**
- Consumes (Task 1): `findUserIdByName`, `insertNotifications`, `bestEffort`.
- Produces: konvensi call-site dipakai Task 3/4:
  ```ts
  await bestEffort('notif-followup', () =>
    insertNotifications(this.db, [{ userId, type: 'followup_assigned', title, body, link: '/followups' }]));
  ```
  — userId sudah di-resolve via `findUserIdByName` di luar `insertNotifications` (insertNotifications menerima rows final saja); self-skip dicek di call-site (`userId !== actorId`).

- [ ] **Step 1: Write the failing test** `followups.notify.test.ts`

Setup: helper pgmem + `setupTables()` di before — tambahkan DDL `followups` + `followup_notes` (cermin init.ts:66-69) ke `helpers/pgmem.ts` sekali, agar test trigger reusable (dipakai juga Task 2/4).

Tests (pakai `FollowupsService` langsung, actor `who` string id dari seedUser):
1. `create dengan pic == nama user → 1 notif followup_assigned` — user aktif 'Budi', create `{client:'PT X', pic:'BUDI', ...}` (kapital). Assert notif untuk user tsb: type/title include client, link `/followups`, userId bukan pelaku.
2. `create pic tak dikenal → followup tersimpan, tanpa notif`.
3. `update pic berubah → notif baru; update tanpa perubahan pic → tidak duplikat`.
4. `self-assign → tidak ada notif` (sesi login = user ybs).
5. `update pic → user diberi deactivated (active=0) → tidak kirim & tidak error`.

- [ ] **Step 2: Run test — Expected FAIL**

Run: `npm --prefix backend test`
Expected: FAIL — notif belum dibuat oleh service (table DDL sudah ada dari Task 1).

- [ ] **Step 3: Implementasi**

- create: bila `p.pic` non-empty → `const uid = await findUserIdByName(db, p.pic)`; bila uid && uid !== who → `bestEffort('notif-followup', ...)` (title `${p.client} — ${p.title}`, body `Anda ditunjuk sebagai PIC (follow-up ${p.followupDate})`).
- update: hitung `picChanged = trim(p.pic||'') !== trim(cur.pic||'')`; hanya bila picChanged && p.pic non-empty → cari user & skip self → best effort.
- Semua helper import minim; JANGAN bungkus try manual — bestEffort sudah menelan error.

- [ ] **Step 4: Run suite penuh** — `npm --prefix backend test` → PASS (termasuk followups.remove yang existing).

- [ ] **Step 5: Commit**

```bash
git add backend/src/followups/followups.service.ts backend/test/followups.notify.test.ts backend/test/helpers/pgmem.ts
git commit -m "✨ feat(notifications): trigger followup_assigned saat PIC ditunjuk"
```

### Task 3: Trigger audit_done (Popi Nava mark)

**Files:**
- Modify: `backend/src/popinava/audit-schedule.controller.ts` `mark()` (line 126-195): setelah audit_history insert & sebelum return, bila `audited === true` → notif best-effort.
- Test: `backend/test/audit-schedule.notify.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers, seeded audit_schedule/audit_history tables (helpers/pgmem.ts sudah punya keduanya).
- Produces: notif `audit_done`: title `Audit ${label}`, body `${who} menandai audit untuk item Anda (${month} ${weekKey})`, link `/popinava`. `who` = nama pelaku (dari resolveWho), bukan id.

- [ ] **Step 1: Write the failing test**

Pola copy `audit-schedule.test.ts` existing (seed weeks JSON via SQL PUT). Tests:
1. `mark audited=true, item label == nama user → 1 notif audit_done` (userId target; tolak self bila actor sama idnya).
2. `label berbeda nama user → mark sukses, tidak notif`.
3. `audited=false (undo) → tidak notif`.

- [ ] **Step 2: Run — Expected FAIL**

- [ ] **Step 3: Implementasi**

- Dalam `mark()`, SETELAH `INSERT audit_history` dan sebelum `return`:

```ts
if (audited) {
  await bestEffort('notif-audit', async () => {
    const uid = await findUserIdByName(this.db, label);
    if (!uid || uid === actorId) return;
    await insertNotifications(this.db, [{ userId: uid, type: 'audit_done', title: `Audit ${label}`, body: `${who} menandai audit untuk item Anda (${month} ${weekKey})`, link: '/popinava' }]);
  });
}
```

- `actorId` = `resolveSessionUser(this.db, req).id` (sudah diambil sekali untuk kebutuhan loga — pantang resolveWho: `who` itu NAMA, bukan ID, dipakai hanya teks body); `label` sudah dihitung line 163 pattern existing.
- best-effort menelan error sendiri; JANGAN bungkus try manual.

- [ ] **Step 4: Run penuh — PASS** (termasuk audit-schedule.test.ts existing).

- [ ] **Step 5: Commit**

```bash
git add backend/src/popinava/audit-schedule.controller.ts backend/test/audit-schedule.notify.test.ts
git commit -m "✨ feat(notifications): trigger audit_done saat item Popi Nava ditandai"
```

### Task 4: Trigger invoice_ready (validasi → notif Finance)

**Files:**
- Modify: `backend/src/billing/billing.controller.ts` `audit()` (line 110-119).
- Test: `backend/test/billing.notify.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers + `caseLabel(db, uuid)` (sudah ada di billing.controller.ts).
- Produces: notif `invoice_ready` ke ALL aktif `role='Finance'`: title `Kasus ${label} sudah valid — siap dibuatkan invoice`, body `Data divalidasi oleh ${pelaku}. Silakan buat invoice dan upload PDF.`, link `/billing`. trigger hanya bila action baru == `VALID - SIAP INVOICE` DAN prev (kolom action audit_status sebelumnya) != itu.

- [ ] **Step 1: Write failing test**

Test: 
1. `valid → notif ke semua Finance aktif` (2 Finance + 1 Finance inactive + 1 non-Finance → hanya 2 baris).
2. `repeat PATCH sama (re-validasi tanpa perubahan) → tidak duplikat`.
3. `PATCH ke status lain (e.g. 'REVISI') → tidak notif`.

- [ ] **Step 2: Run — Expected FAIL**

- [ ] **Step 3: Implementasi**

- audit(): sebelum UPDATE, baca prev: `SELECT action FROM audit_status WHERE record_uuid=$1`; tepat SETELAH UPDATE + logActivity:
  ```ts
  if (action === 'VALID - SIAP INVOICE' && prevAction !== action) {
    await bestEffort('notif-invoice-ready', async () => {
      const targets = rowsOf(await this.db.pq(`SELECT id FROM "user" WHERE role='Finance' AND COALESCE(active,1)=1`));
      if (!targets.length) return;
      await insertNotifications(this.db, targets.map((u) => ({ userId: u.id, type: 'invoice_ready', title, body, link: '/billing' })));
    });
  }
  ```
  `rowsOf` / pattern `r.rows || r` mengikuti file. failsafe best-effort tak menggagalkan PATCH.

- [ ] **Step 4: Run penuh — PASS** (termasuk billing.flow.test.ts existing).

- [ ] **Step 5: Commit**

```bash
git add backend/src/billing/billing.controller.ts backend/test/billing.notify.test.ts
git commit -m "✨ feat(notifications): trigger invoice_ready saat data valid — notif ke Finance"
```

### Task 5: Frontend — api helper + ActionsContext polling + grup "Notifikasi dari tim"

**Files:**
- Modify: `frontend/src/lib/api.js` (append 4 fungsi, ikut pattern `req()`)
- Create: `frontend/src/utils/relTime.js`
- Modify: `frontend/src/context/ActionsContext.jsx`
- Modify: `frontend/src/lib/actionsMeta.js`
- Test: `frontend/test/relTime.test.mjs`

**Interfaces:**
- Consumes: endpoint Task 1 (`GET /notifications` → `{notifications, unreadCount}` camelCase); `useAuth()` (AuthContext) `{user, ...}` — user falsy saat logout.
- Produces:
  - `api.js`: `fetchNotifications() → {notifications, unreadCount}`; `markNotificationRead(id)` (PATCH `/${id}/read`); `markAllNotificationsRead()`; `deleteNotification(id)`.
  - `relTime.js`: `export function relTimeID(iso, now = new Date()) → string` — "baru saja" (<60s), "X menit lalu" (<60m), "X jam lalu" (<24h), "X hari lalu" (<7d), else `fmtDateID`-like d-m-Y singkat (impl: `new Date(iso).toLocaleDateString('id-ID', {day:'numeric',month:'short'})`).
  - `ActionsContext`: value baru di provider: `notifs` (array rows, terbaru dulu), `markNotifRead(id)`, `markAllNotifsRead()`, `deleteNotif(id)`.
  - `useActions()` fallback menambah ketiga fungsi no-op ([] default) tanpa memecah consumer lain.
- `actionsMeta.js`: `ICON_BY_ID.notif = 'mail'` (ada di `components/Icon.jsx` PATHS); meta grup `notif` di map groupMeta: `{ name: 'Notifikasi dari tim', soft: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400', chip: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300', dot: 'bg-brand-500' }` — ikut pola warna existing (implementer boleh sesuaikan token dengan meta kolom lain selama brand-*.soft/chip/dot).

- [ ] **Step 1: Write failing test** `frontend/test/relTime.test.mjs`

node:test assert: 30 detik → "baru saja"; 10 menit → "10 menit lalu"; 3 jam → "3 jam lalu"; 2 hari → "2 hari lalu"; >7 hari → mengandung nama bulan (id-ID `.toLocaleDateString('id-ID',{month:'short'})`).

- [ ] **Step 2: Run — Expected FAIL** (`npm --prefix frontend test`)

- [ ] **Step 3: Implementasi utils + api + meta** (signature di atas; body util trivial langsung tulis).

- [ ] **Step 4: Implementasi ActionsContext**

- State `const [notifs, setNotifs] = useState([])`.
- Poll: `useEffect` bila `useAuth().user` truthy → `let stop=false; const tick=async()=>{try{const d=await fetchNotifications(); if(!stop) setNotifs(d.notifications||[]) }catch{}}; tick(); const t=setInterval(tick,60_000); return ()=>{stop=true;clearInterval(t)}}` — deps `[user]` (dari `const { user } = useAuth()`).
- Mutators: update state lokal optimis dulu, lalu panggil API (tanpa await di UI-critical path); bila API gagal, kembalikan state via refetch; `refresh()` juga refetch notifs di `Promise.all`.
- Group build terlepas `groups` memo: bila notifs.length → push `{ id: 'notif', title: 'Notifikasi dari tim', count: unread, note: '', path: undefined, items, left }` — items mapped `{ id, label: title, sub: body, link }`, unread sortir dulu lalu createdAt desc, slice 4; IMPORTANT: grup TANPA `path`.
- Value provider spread menambah `notifs, markNotifRead, markAllNotifsRead, deleteNotif`.
- Sort item grup: `readAt` NULL dulu, lalu `createdAt` DESC — hitung di memo `groups` dari state, JANGAN fetch di dalam memo.

- [ ] **Step 5: Run** — `npm --prefix frontend test` PASS; `npm --prefix frontend run build` exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.js frontend/src/utils/relTime.js frontend/src/context/ActionsContext.jsx frontend/src/lib/actionsMeta.js frontend/test/relTime.test.mjs
git commit -m "✨ feat(notifications): polling 60s + grup 'Notifikasi dari tim' di ActionsContext"
```

### Task 6: Frontend — NotificationBell (interaksi notif) + ActionsPanel (grup tanpa path)

**Files:**
- Modify: `frontend/src/components/NotificationBell.jsx`
- Modify: `frontend/src/components/ActionsPanel.jsx`

**Interfaces:**
- Consumes: `useActions()` (`notifs`, `markNotifRead`, `markAllNotifsRead`, `deleteNotif` Task 5); `relTimeID` (utils); grup `id:'notif'` tanpa `path`.
- Produces: perilaku user-visible (spec §5):
  - Bell: grup 'notif' header → klik EXPAND nested daftar notif (bukan navigate); setiap row: title (bold), body (truncate), relTime; klik row → `await markNotifRead(id)` lalu `navigate(link)` dan `setOpen(false)`; tombol hapus (ikon kecil, tampil selalu, `stopPropagation`) → `deleteNotif(id)`; di bawah daftar: tombol `Tandai semua dibaca` (`markAllNotifsRead()`; hanya tampil bila unread>0) dan tombol tutup kembali ke grup.
  - Panel: bila `!g.path` render `<div>` bukan `<Link>` (tanpa hover-jump, tanpa footer "Buka …"), isi items tampil sama.
  - Badge total lonceng tetap rumus lama (groups + notif unread ikut count).

- [ ] **Step 1: Implementasi bell** — cukup satu step: struktural, tanpa file baru; posisikan expand state `const [openNotif, setOpenNotif] = useState(false)`; render nested `<ul>` hanya untuk `g.id === 'notif' && openNotif` di dalam `<li>` grup. Header grup notif TIDAK navigate; arrow icon tetap. Aksesibilitas: rows pakai `<button role="menuitem">`, title `aria-label` mengandung judul.

- [ ] **Step 2: Implementasi panel** — branch `const Card = g.path ? Link : 'div'; const fwd = g.path ? { to: g.path } : {}; <Card ...fwd>` menggantikan `<Link to>` (line ~78-87); bila `!g.path` sembunyikan footer "Buka {meta.name}" dan efek `group-hover:*`; isi item tampil sama.

- [ ] **Step 3: Verify manual + build**

Run: `npm --prefix frontend test` PASS; `npm --prefix frontend run build` exit 0.
Manual (dev server backend+frontend): pilih user A; user B sedang mengisi PIC follow-up A → notif A muncul ≤60s; klik notif → mark read + navigate; mark-all; hapus; badge & panel ikut.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NotificationBell.jsx frontend/src/components/ActionsPanel.jsx
git commit -m "✨ feat(notifications): lonceng & panel menampilkan/berinteraksi notifikasi tim"
```
