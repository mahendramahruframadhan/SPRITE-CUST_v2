// Helper SQL mentah terpusat — SATU-SATUNYA tempat escaping string.
// Konteks: db.execute() di codebase ini memakai string mentah karena sql-tag
// berparameter memicu "getTypeParser is not supported" di pg-mem (MODE A).
// Aturannya: SETIAP nilai yang diinterpolasi ke query WAJIB lewat esc()
// (pengecualian: literal terkontrol penuh seperti nama kolom statis).
// Jangan pernah menulis .replace(/'/g, ...) inline di file lain — import
// helper ini agar gaya + perilaku konsisten di pg-mem maupun Postgres asli.
export const esc = (v: any): string => String(v ?? '').replace(/'/g, "''");

// Normalisasi hasil db.execute: drizzle mengembalikan { rows } sedang pg-mem
// mentah bisa mengembalikan array langsung.
export const rowsOf = (r: any): any[] => r?.rows || r || [];
