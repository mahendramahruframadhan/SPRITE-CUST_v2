// Helper SQL mentah terpusat — SATU-SATUNYA tempat escaping string.
// Konteks: db.execute() di codebase ini memakai string mentah karena sql-tag
// berparameter memicu "getTypeParser is not supported" di pg-mem (MODE A).
//
// Imp#1 — urutan jalur query:
// 1. db.pq(text, params) — PARAMETER BINDING ($1..$n) lewat pool driver.
//    Wajib untuk SEMUA nilai dari luar (body, query, header, data Sheets).
//    Lihat drizzle.service.attachPq + test/db.param.test.ts.
// 2. esc() — hanya dua pengecualian yang terdokumentasi:
//    a. di dalam db.transaction() (setup first-admin, rename status) —
//       tx tidak punya pq; sql-tag berparameter drizzle gagal di pg-mem;
//    b. seed statis dari file repo (db/init.ts) — bukan input jaringan.
// Jangan pernah menulis .replace(/'/g, ...) inline di file lain — import
// helper ini agar gaya + perilaku konsisten di pg-mem maupun Postgres asli.
export const esc = (v: any): string => String(v ?? '').replace(/'/g, "''");

// Normalisasi hasil db.execute: drizzle mengembalikan { rows } sedang pg-mem
// mentah bisa mengembalikan array langsung.
export const rowsOf = (r: any): any[] => r?.rows || r || [];
