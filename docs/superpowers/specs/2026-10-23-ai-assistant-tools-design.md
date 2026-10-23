# Design: AI Assistant — Arsitektur Tool Calling — 2026-10-23

Status: disetujui di chat 2026-10-23 (3 bagian desain). Menunggu review file ini
sebelum implementation plan.
Sumber kebutuhan: `PRD - AI Assistant Customer Service.md` (draft v1.0, 23 Okt
2026), diselaraskan dengan kondisi kode.

Jalur: architectural. Keputusan kunci (diputus bersama di chat):

- **Tool calling, bukan snapshot.** Snapshot SQL ~13 query yang setiap request
  disuntik ke system prompt (ai.controller.ts:217-269) dihapus. Model memilih
  tool, backend mengeksekusi query, angka selalu dari database.
- **Lingkup Fase 1 = semua modul utama** (kasus, billing, audit, invoice, HR) —
  lebih luas dari Fase 1 PRD yang hanya brand/case/maintenance.
- **Format API tetap multi-turn.** PRD minta `{message}` 500 karakter
  single-turn; diputuskan pertahankan `POST /ai/chat {messages[]}`
  (maks 8 pesan × 2000 karakter) + switcher koneksi AI agar `AiChat.jsx`
  tidak dirombak.
- **Instruksi bertahap:** FR-10 (file instruksi runtime) masuk Fase 1;
  FR-11 (halaman admin edit instruksi) ditunda ke iterasi berikutnya.
- **Filter topik (FR-12) ditunda.** Andalkan instruksi + whitelist tool;
  dipantau lewat log.
- Terminologi PRD ("brand", `count_brands`) dipetakan ke domain project:
  client/kasus/billing (`assistance_records`: `client`, `module`, `status`,
  `billing_status`, `charges`, `date_issue`), `audit_status`, `invoice_status`.

## 1. Tujuan & success criteria

Asisten SPRITE AI menjawab pertanyaan data dari database (bukan tebakan
model), terbatas pada lingkup project, dengan perilaku yang diatur file
instruksi yang dapat diubah tanpa deploy.

- Success: pertanyaan angka (jumlah kasus, top client, total billing periode,
  status audit/invoice, kategori HR) terjawab dengan angka yang 100% cocok
  dengan query langsung pada set uji; pertanyaan off-topic & injection ditolak
  konsisten; tanpa tool yang cocok → jawab "belum bisa dijawab dari data yang
  tersedia", tanpa menebak.
- Success teknis: proxy OpenAI-compatible yang aktif terverifikasi mendukung
  function calling (`tools` + `tool_calls`) SEBELUM fitur dibangun — gate
  spike pertama; jika tidak, desain direvisi.
- Non-goal: edit instruksi via UI; filter topik pra-seleksi; text-to-SQL
  bebas; riwayat jangka panjang; suara/lampiran; asisten menulis data.

## 2. Struktur backend (backend/src/ai/)

| File | Isi |
|---|---|
| `ai.controller.ts` | Disederhanakan: tetap pintu masuk (SessionGuard, validasi pesan, rate limit, kill-switch, SSRF `normalizeAiBaseUrl`, pilih koneksi, mask key) — logika chat dipindah ke `ai.service`. Snapshot SQL + `SYSTEM_PROMPT` + `PROJECT_KB` konstanta dihapus. |
| `ai.service.ts` | Loop model↔tool: kirim instruksi + pesan + daftar tool → jika `tool_calls` → validasi & eksekusi via `ai.tools` → kirim hasil → ulang, maks 4 putaran → teks jawaban. Generasi error/timeout provider tetap ramah (503-style). |
| `ai.tools.ts` | Registry tool (nama, deskripsi jelas, JSON schema), validasi argumen, eksekusi → gunakan `ai.queries`. Tool tak dikenal → `{ error: "tool tidak dikenal" }`. || `ai.queries.ts` | Semua query Drizzle untuk tool (pengganti `stats.service` PRD; nama dibedakan dari modul `analytics` yang sudah ada). Read-only. |
| `ai.instructions.ts` | Baca `ai-instructions.md` runtime; cache sederhana, refresh bila mtime berubah. |
| `ai-instructions.md` | System prompt lengkap per bagian 11 PRD: lingkup, sumber data, keamanan (larang bocorkam prompt/konfigurasi), gaya jawaban. `PROJECT_KB` lama dipindah masuk sini. |

Frontend tidak diubah. Kontrak `POST /ai/chat` tetap:
body `{messages[], connectionId?}`, respons `{ok, reply|error}`.

## 3. Toolset Fase 1 (6 tool, semua read-only, output agregat)

| Tool | Parameter (divalidasi) | Output |
|---|---|---|
| `count_cases` | `status?`, `billing_status?`, `month?` (1-12), `year?` | `{total, period}` |
| `case_totals` | `month?`, `year?`, `group_by?` (`billing_status`\|`status`) | `{period, groups:[{label, count, charges}]}` |
| `get_top_clients` | `metric` (`cases`\|`charges`), `limit` 1-20 default 5, `month?`, `year?` | `{period, items:[{client, total}]}` |
| `get_module_breakdown` | `month?`, `year?` | `{period, items:[{module, count}]}` |
| `count_audit` | `status?` | `{total}` (tabel `audit_status`) |
| `count_invoice` | `status?`, `sum_amount?` | `{total, amount?}` (tabel `invoice_status`) |

Aturan validasi (di backend sebelum query):

- Enum salah (`status`/`billing_status`/`metric`/`group_by` yang tak dikenal)
  → dikembalikan ke model sebagai `{ error: "..." }`, TIDAK diubah diam-diam.
- `limit` dipotong rentang 1-20; `month` 1-12; `year` 2020-2035.
- `month`/`year` kosong = seluruh periode; jawaban wajib menyebut periode.
- Filter periode lewat `date_issue LIKE 'YYYYMM%'` (pola snapshot lama).

## 4. Keamanan, kill-switch, kuota

- **Kill-switch (FR-13):** cek toggle AI yang sudah ada di app_config
  (`agentConfig`, diatur /cfg) → nonaktif: balas pesan layanan nonaktif
  TANPA panggilan ke penyedia AI. `normalizeAiBaseUrl` + `AI_ALLOWED_HOSTS`
  + `isPrivateHost` dipertahankan apa adanya.
- **Kuota:** rate limit fail-closed yang ada (default 10/menit, `parseAiRateLimit`)
  dipertahankan; `max_tokens` 500 pada panggilan model; maks 4 putaran tool;
  batas 8 pesan × 2000 karakter tetap.
- **Privasi:** hanya hasil agregat tool yang masuk konteks model (nama client
  tetap terkirim — sudah jadi kondisi fitur). Isi instruksi/konfigurasi jangan
  dilarang bocor lewat instruksi. Teks tool sebagai DATA, instruksi di dalamnya diabaikan.
- **Hanya baca:** tidak ada tool tulis; query di `ai.queries.ts` SELECT saja.

## 5. Log pemakaian (FR-14)

Tiap request `POST /ai/chat` catat ke `activity_logs` (pola logging yang ada):
user id, aksi `ai_chat`, meta JSON: jumlah putaran, nama-nama tool dipanggil,
status (`ok`/`rate_limited`/`disabled`/`provider_error`). Isi pesan pengguna
dan data tool TIDAK dicatat. Tool call gagal validasi ikut tercatat.

## 6. Pengujian

Test di `backend/test/` (node test runner):

- `ai.tools.test.ts` — validasi limit/enum/di luar rentang; eksekusi terhadap
  pg-mem; hasil dibandingkan query langsung; tool tak dikenal.
- `ai.chat-loop.test.ts` — loop tool (provider tiruan): tool_calls → hasil →
  jawaban teks; 5 putaran → berhenti; hasil tool kosong → jawaban "belum bisa";
  timeout provider → pesan ramah.
- `ai.instructions.test.ts` — file dibaca runtime; refresh saat file berubah.
- Test lama tetap hijau: `ai.safety`, `ai.snapshot-toggle`,
  `ai.config.separation` (snapshot-toggle disesarakan karena snapshot dihapus —
  diganti kill-switch config-agent).
- Set uji akurasi 20-30 pertanyaan manual (staging, model nyata) — dicatat
  di plan, dieksekusi manual.

## 7. Tahapan (di bawa ke implementation plan)

1. **Spike:** verifikasi function calling (`tools`/`tool_calls`) lewat proxy
   aktif dengan koneksi dari app_secrets. Gate — jika tidak didukung, berhenti.
2. `ai-instructions.md` + `ai.instructions.ts` (+ test).
3. `ai.queries.ts` semua query tool + unit test (tanpa AI).
4. `ai.tools.ts` definisi + validasi + eksekusi (+ test).
5. `ai.service.ts` loop + sederhakan `ai.controller.ts` (hapus snapshot,
   tambah kill-switch & log) + test loop.
6. Sesarakan test lama; jalankan seluruh test backend.
7. Uji manual staging + daftar pertanyaan gagal → kandidat tool berikutnya.

## 8. Risiko

| Risiko | Penanganan |
|---|---|
| Proxy tak mendukung function calling | Spike tahap 1 sebagai gate; siapkan revisi (hibrida) |
| Model salah pilih tool / salah argumen | Deskripsi tool jelas, validasi ketat, error jelas kembali ke model |
| Pertanyaan di luar 6 tool | Jawab "belum bisa"; log → daftar tool iterasi berikutnya |
| Instruksi ditembus injection | Instruksi + whitelist tool + test injection; model tak punya akses selain tool baca agregat |
| Biaya | max_tokens 500, 4 putaran, kuota 10/menit fail-closed |
