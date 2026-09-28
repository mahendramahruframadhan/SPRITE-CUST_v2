// Uji Kritis #1 (lapis kedua): di NODE_ENV=production, getDb() sendiri HARUS
// menolak backend pg-mem. Inilah是第一 defense — kalau DATABASE_URL kosong/
// salah ketik di produksi, proses gagal saat boot, bukan diam-diam berjalan
// di memori (yang berarti data hilang setiap restart).
//
// Karena getDb() melempar, initDb tidak pernah sampai ke blok seed user.
// Test dipisah dari file lain karena getDb() memoisasi koneksi per proses.
// Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Kritis #1 — production tidak boleh jatuh ke pg-mem', () => {
  it('NODE_ENV=production + DATABASE_URL kosong → getDb melempar', async () => {
    const savedEnv = process.env.NODE_ENV;
    const savedUrl = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = '';
    try {
      const { getDb } = await import('../src/db/drizzle.service.ts');
      assert.throws(() => getDb(), /DATABASE_URL/);
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
      if (savedUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedUrl;
    }
  });

  it('NODE_ENV=production + DATABASE_URL salah prefix → getDb melempar', async () => {
    const savedEnv = process.env.NODE_ENV;
    const savedUrl = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'production';
    // Salah ketik klasik: "postgresql:/localhost..." (kurang satu slash).
    process.env.DATABASE_URL = 'postgresql:/localhost:5433/sprite_cust';
    try {
      const { getDb } = await import('../src/db/drizzle.service.ts');
      assert.throws(() => getDb(), /DATABASE_URL/);
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
      if (savedUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedUrl;
    }
  });
});
