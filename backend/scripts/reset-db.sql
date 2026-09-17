-- ============================================================
-- SPRITE-CUST — kosongkan DB sebelum inject dari Sheet live
-- Cara pakai (Postgres asli / MODE B):
--   psql "$DATABASE_URL" -f scripts/reset-db.sql
-- pg-mem (MODE A / default): tidak perlu file ini — cukup restart
-- backend dengan SKIP_SEED=true (lihat README "Kosongkan DB").
-- ============================================================
-- Urutan TRUNCATE bebas karena CASCADE menangani FK:
-- audit_status/invoice_status → assistance_records,
-- session/account → "user".
TRUNCATE
  audit_status,
  invoice_status,
  assistance_records,
  session,
  account,
  verification,
  "user",
  sync_logs,
  activity_logs,
  role_permissions
RESTART IDENTITY CASCADE;

-- Hapus penanda sync agar inject berikutnya dianggap baru semua
-- (kalau tidak, baris yang hash-nya sama akan dilewati sync).
DELETE FROM app_config WHERE key = 'syncHashes';

-- Master berikut SENGAJA dipertahankan (dibutuhkan aplikasi):
-- app_config(auditActions, invoiceActions, agentConfig, ...), struktur tabel.
-- Kalau mau first-run bersih (setup/status → firstRun=true), jalankan juga:
--   TRUNCATE "user", session, account, verification RESTART IDENTITY CASCADE;
