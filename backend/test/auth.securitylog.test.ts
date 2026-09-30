// M4: percobaan login gagal harus tercatat di activity_logs (kategori
// Keamanan) berisi email + IP pelaku, TANPA pernah menyimpan password.
// Status HTTP 200 {error:'invalid credentials'} dipertahankan disengaja
// (anti-oracle; api.js memakai 401 sebagai penanda sesi mati).
// Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';

describe('auth security log (M4)', () => {
  before(() => {
    setupTables();
  });

  it('password salah → log Keamanan berisi email+IP, tanpa password', async () => {
    await seedUser('Viewer', 'gagal.log@revota.id');
    const ctl = new AuthController();
    const r: any = await ctl.signIn(
      { email: 'gagal.log@revota.id', password: 'rahasia-tersimpan-1' },
      { ip: '203.0.113.9' } as any,
    );
    assert.equal(r.error, 'invalid credentials', 'bentuk respons 200 {error} dipertahankan');

    const rows: any = await db().execute(
      `SELECT action, category, detail, who FROM activity_logs WHERE detail LIKE '%gagal.log@revota.id%'` as any,
    );
    const list = rows.rows || rows;
    assert.ok(list.length >= 1, 'harus ada baris log percobaan login gagal');
    const log = list[list.length - 1];
    assert.equal(log.category, 'Keamanan');
    assert.match(String(log.action), /login gagal/i);
    assert.match(String(log.detail), /203\.0\.113\.9/, 'IP pelaku harus tercatat');
    assert.ok(
      !String(log.detail).includes('rahasia-tersimpan-1') && !String(log.action).includes('rahasia-tersimpan-1'),
      'password tidak boleh muncul di log',
    );
  });

  it('login sukses TIDAK menghasilkan log login gagal', async () => {
    await seedUser('Support', 'sukses.log@revota.id');
    const ctl = new AuthController();
    const r: any = await ctl.signIn({ email: 'sukses.log@revota.id', password: 'password123' }, { ip: '203.0.113.10' } as any);
    assert.ok(r.token, 'login sukses tetap mengeluarkan token');
    const rows: any = await db().execute(
      `SELECT 1 FROM activity_logs WHERE category='Keamanan' AND detail LIKE '%sukses.log@revota.id%'` as any,
    );
    assert.equal((rows.rows || rows).length, 0, 'login sukses tidak dicatat sebagai login gagal');
  });
});
