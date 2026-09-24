# CLAUDE.md — Onboarding AI Coding Assistant (SPRITE-CUST_v2)

Dibaca ulang tiap sesi baru. Dokumen ini sumber kebenaran operasional; detail
lebih lanjut di `backend/README.md`, `frontend/README.md`, `DESIGN.md`.

## 1. Tech Stack

NestJS 10 + Drizzle (Postgres `:5433`/db `sprite_cust`, fallback `pg-mem` in-memory) + Google Sheets sync (satu arah) + S3-compatible PDF storage; frontend React 18 + Vite 5 + Tailwind 3 + Chart.js, `fetch` via `src/lib/api.js`. Auth email/password + token sesi server-side (`backend/src/auth/session.ts`).

## 2. Struktur Folder

```
SPRITE-CUST_v2/
├── backend/
│   ├── src/
│   │   ├── main.ts               # boot: initDb → validateConfig → GlobalExceptionFilter
│   │   ├── auth/                 # session.ts, perm.guard (modul), session.guard (login saja)
│   │   ├── billing/              # audit + invoice 4-status + *-map
│   │   ├── cases/ clients/ config/ db/ logs/ masters/ pdf/ roles/
│   │   ├── setup/ sheets/ sync/ ai/ common/http-exception.filter.ts config/validate.ts
│   │   └── db/sql.ts             # esc() + rowsOf() — SATU-SATUNYA sumber escaping SQL
│   ├── test/                     # node:test + pg-mem (helpers/pgmem.ts)
│   └── .env                      # jangan commit; lihat .env.example
├── frontend/
│   └── src/
│       ├── pages/                # 14 halaman route (lazy di App.jsx)
│       ├── components/           # BrandCombobox, DatePickerInput, DataTable (Pill/Dot/EmptyRow), ...
│       ├── hooks/                # usePopover, useFilters, useAuditState, useInvoiceState, ...
│       ├── context/ lib/         # api.js, storage.js, activity.js, AuthContext, ...
│       └── utils/                # format.js (format) + tones.js (warna/label)
├── .local/                       # mockup HTML statis + PRD (referensi, bukan kode jalan)
├── AGENTS.md                     # filter antislop (mode DURING)
└── DESIGN.md                     # arah visual brand Revota
```

## 3. Konvensi Kode

- **Commit**: atomik per perubahan logis + ikon awal: `✨ feat` `🐛 fix` `💅 style/label` `🧹 chore` `🔒 security/auth` `⚡ perf` `✅ test` `📝 docs` `⚙️ backend`.
- **Backend**: file kebab-case; controller→service→db. SQL mentah WAJIB lewat `esc()` dari `db/sql.ts` (pg-mem tak mendukung sql-tag berparameter). Error bisnis WAJIB `throw new HttpException({code,message}, status)` — bentuk akhir `{ok:false,code,message,statusCode}`. Otorisasi tulis via `@Perm('modul')`+PermGuard atau SessionGuard; identitas via `resolveSessionUser`/`resolveWho`.
- **Frontend**: komponen `PascalCase.jsx`; hook `useX.js`; state lokal WAJIB lewat `lib/storage.js` (bukan `localStorage` langsung); popover portal lewat `hooks/usePopover.js`; filter lewat `useFilters` + `FilterLabel`; warna label lewat `utils/tones.js` (`invLabel`, `moduleTone`, `billingTone`, `invoiceTone`); pill/badge tabel lewat `components/DataTable.jsx`.
- **Kosakata invoice**: nilai backend/logika tetap `DIKIRIM`/`PAID` — yang berubah hanya label tampilan via `invLabel()`. Jangan rename enum di DB/API.
- **Gaya visual** (DESIGN.md): badge kapsul hanya status fungsional; label tabel `10–11px uppercase tracking`; popover via portal; satu transisi mount per section.

## 4. Perintah

| Aksi | Backend (`cd backend`) | Frontend (`cd frontend`) |
|---|---|---|
| Install | `npm install` (`.npmrc` wajib ada) | `npm install` |
| Dev | `npm run dev` → `:5005` | `npm run dev` → `:5173` |
| Tanpa Docker | `npm run dev:local` (paksa pg-mem) / `dev:empty` | — |
| Test | `npm test` (runner: `node -r ts-node/register/transpile-only --test`; flag `-r` WAJIB) | `npm test` |
| Build/cek | `npm run typecheck` · `npm run build` → `npm start` | `npm run build` |

## 5. YANG TIDAK BOLEH DILAKUKAN

1. **PostgreSQL tidak pernah menulis balik ke Google Sheets** — sync SATU ARAH (Sheets→DB, upsert by `recordUuid`); baris tanpa `recordUuid` dilewati; jangan hitung ulang formula Sheets.
2. **Jangan rename nilai enum** `DIKIRIM`/`PAID`/`MENUNGGU INVOICE`/`INVOICE TERBIT` di DB/API/logika — ubah hanya label tampilan (`invLabel`).
3. **Jangan percaya/jadikan `x-user-email` dasar otorisasi** — tulis wajib lewat token sesi (`x-auth-token`); jangan kembalikan `return false` lama di guard.
4. **Jangan tulis SQL tanpa `esc()`** dari `db/sql.ts`; jangan definisikan `esc` lokal/inline.
5. **Jangan hapus `.npmrc`** (legacy-peer-deps); jangan commit `.env`/kredensial; jangan `pkill -f ts-node` (bisa membunuh proses user) — kill by PID dari `ss -ltnp`.
6. **Jangan kaget data hilang saat restart** di mode pg-mem (`DATABASE_URL` kosong) — itu by design; jangan anggap bug.
7. **Jangan tambah fitur di luar PRD** tanpa persetujuan: bulk read status, export server-side, Redis cache, partisi tabel per bulan, tulis balik ke Sheets.
8. Data di pg-mem/Postgres milik user — **jangan kosongkan/reset DB** tanpa izin eksplisit; instance uji selalu di port `:5006` dengan `DATABASE_URL=` kosong.

## 6. Catatan Operasional

- Backend user berjalan di `:5005` (data live) — sebelum test e2e manual, minta izin atau pakai `:5006`.
- Sesi user lama (tanpa `authToken`) dianggap kedaluwarsa — login ulang sekali setelah deploy auth baru.
- Kerjaan UI: terapkan filter antislop DURING sesuai `AGENTS.md`/`DESIGN.md`.
