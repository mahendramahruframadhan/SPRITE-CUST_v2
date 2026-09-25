// Uji fail-closed auth + atribusi log — node:test bawaan, pg-mem (tanpa Docker).
// Mengunci: (1) tanpa token sesi, penentuan role jatuh ke Viewer (catch→false);
// (2) sesi valid tetap dikenali; (3) resolveWho tak pernah melempar dan menandai
// fallback header; (4) logActivity tak pernah melempar. Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { createSession } from '../src/auth/session.ts';
import { resolveWho, logActivity } from '../src/logs/activity.ts';

const uniq = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

describe('auth fail-closed + atribusi log', () => {
  before(() => {
    setupTables();
  });

  it('signUp tanpa token sesi: role dipaksa Viewer walau body minta Super Admin', async () => {
    const ctl = new AuthController();
    const r: any = await ctl.signUp(
      { name: 'Calon', email: `calon-${uniq()}@revota.id`, password: 'password123', role: 'Super Admin' },
      { headers: {} }
    );
    assert.equal(r?.user?.role, 'Viewer');
  });

  it('resolveWho: sesi valid dikenali; tanpa sesi tanpa header jadi Admin', async () => {
    const u = await seedUser('Support', `dukung-${uniq()}@revota.id`);
    const token = await createSession(db(), u.id);
    // seedUser mengisi name = role, jadi sesi dikenali sebagai 'Support'
    assert.equal(await resolveWho(db(), { headers: { 'x-auth-token': token } }), 'Support');
    assert.equal(await resolveWho(db(), { headers: {} }), 'Admin');
  });

  it('resolveWho: fallback header ditandai belum terverifikasi', async () => {
    const siapa = await resolveWho(db(), { headers: { 'x-user-email': `asing-${uniq()}@revota.id` } });
    assert.match(siapa, /belum terverifikasi\)$/);
  });

  it('logActivity: db rusak tetap resolve (tak pernah melempar)', async () => {
    const dbRusak = { execute: async () => { throw new Error('down'); } };
    await logActivity(dbRusak, { who: 'x', action: 'uji' });
    await logActivity(dbRusak, null as any);
  });
});
