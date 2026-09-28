// Uji Kritis #2 di level perilaku: initDb TIDAK BOLEH membuat 6 user demo
// (2 di antaranya Super Admin, password '12345'/'password123' tertulis di
// source) kecuali NODE_ENV eksplisit 'development'. Dulu guard
// `NODE_ENV !== 'production'` bernilai TRUE saat env kosong, sehingga setiap
// boot dengan tabel user kosong membuat akun privileged itu.
//
// File terpisah dari seed-users.failclosed.test.ts karena getDb() memoisasi
// koneksi pg-mem dalam satu proses: initDb hanya bisa dipanggil DUA kali pada
// database yang sama (DDL-nya tidak idempoten di pg-mem). Node --test memberi
// satu proses per file, jadi ini isolating tapi sah.
// Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/init.ts';
import { getDb } from '../src/db/drizzle.service.ts';

// Email seed hard-coded di src/db/init.ts — bila salah satu muncul, guard bocor.
const SEED_EMAILS = [
  'admin@revota.id',
  'rani@revota.id',
  'budi.cs@revota.id',
  'sari@revota.id',
  'finance@revota.id',
  'vina@revota.id',
];

const rows = async (q: string) => {
  const r: any = await getDb().execute(q as any);
  return (r.rows || r) as any[];
};

describe('Kritis #2 — NODE_ENV kosong tidak boleh membuat akun seed', () => {
  it('initDb dengan NODE_ENV kosong menghasilkan 0 user', async () => {
    const saved = process.env.NODE_ENV;
    delete process.env.NODE_ENV; // persis kondisi backend/.env live saat ini
    delete process.env.SKIP_SEED;
    delete process.env.SKIP_FINANCE_SEED;
    try {
      await initDb();

      const users = await rows(`SELECT email FROM "user"`);
      assert.equal(users.length, 0, `NODE_ENV kosong membuat ${users.length} user — guard bocor`);

      const emails = users.map((u) => u.email);
      for (const e of SEED_EMAILS) {
        assert.ok(!emails.includes(e), `akun seed ${e} tidak boleh ada tanpa NODE_ENV=development`);
      }
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved;
    }
  });
});
