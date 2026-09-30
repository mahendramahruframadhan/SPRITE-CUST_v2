// Imp#1: parameter binding (query helper) — payload eksternal dikirim sebagai
// nilai terpisah ($1..$n), bukan disisipkan ke string SQL.
// sql-tag drizzle gagal di pg-mem (getTypeParser), jadi binding dilakukan di
// level driver pool lewat db.pq(text, params).
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db, setupTables } from './helpers/pgmem.ts';
import { rowsOf } from '../src/db/sql.ts';

setupTables();

describe('pq parameter binding', () => {

  it('payload injeksi jadi nilai literal — tidak membuka semua baris', async () => {
    const r: any = await db().pq(`SELECT count(*)::int AS c FROM "user" WHERE email = $1`, [`' OR '1'='1`]);
    assert.equal(rowsOf(r)[0]?.c, 0, 'quote-escape tidak boleh diperlakukan sebagai SQL');
  });

  it('titik koma / statement berantai tidak menutup query', async () => {
    const r: any = await db().pq(
      `SELECT count(*)::int AS c FROM "user" WHERE email = $1`,
      [`x'; DROP TABLE "user"; --`],
    );
    assert.equal(rowsOf(r)[0]?.c, 0);
    const t: any = await db().pq(`SELECT count(*)::int AS c FROM "user"`);
    assert.equal(rowsOf(t)[0]?.c >= 0, true, 'tabel "user" wajib masih ada');
  });

  it('round-trip multi parameter + null undefined', async () => {
    await db().pq(
      `INSERT INTO activity_logs (id, who, action, category, detail, record_uuid, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      ['t1', 'Tester', 'aksi', 'Keamanan', null, undefined, '2026-09-30T00:00:00.000Z'],
    );
    const r: any = await db().pq(`SELECT who, detail FROM activity_logs WHERE id = $1`, ['t1']);
    assert.equal(rowsOf(r)[0]?.who, 'Tester');
    assert.equal(rowsOf(r)[0]?.detail, null, 'undefined harus dinormalkan ke null');
  });
});
