// Uji fail-closed auth + atribusi log — node:test bawaan, pg-mem (tanpa Docker).
// Mengunci (Task 3):
// (1) requesterIsSuperAdmin fail-closed — penentuan role tanpa sesi jatuh ke
//     Viewer walau body minta Super Admin; req yang melempar saat dibaca pun
//     tetap aman (catch → false);
// (2) resolveWho HANYA dari sesi terverifikasi — header x-user-email palsu
//     diabaikan total, fallback aman 'system' (bukan akun admin);
// (3) identitas tercatat mengikuti SESI ASLI meski header palsu dikirim
//     bersamaan (anti-spoofing);
// (4) logActivity best-effort — tak pernah melempar ke pemanggil.
// Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { SetupController } from '../src/setup/setup.controller.ts';
import { createSession } from '../src/auth/session.ts';
import { validateConfig } from '../src/config/validate.ts';
import { resolveWho, logActivity } from '../src/logs/activity.ts';

const uniq = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

describe('auth fail-closed + atribusi log (Task 3)', () => {
  before(() => {
    setupTables();
  });

  it('requesterIsSuperAdmin: tanpa sesi → role dipaksa Viewer walau body minta Super Admin', async () => {
    const ctl = new AuthController();
    const r: any = await ctl.signUp(
      { name: 'Calon', email: `calon-${uniq()}@revota.id`, password: 'password123', role: 'Super Admin' },
      { headers: {} }
    );
    assert.equal(r?.user?.role, 'Viewer');
  });

  it('requesterIsSuperAdmin: req yang melempar saat dibaca → tetap false (fail-closed)', async () => {
    const ctl = new AuthController();
    const reqJahat: any = {};
    Object.defineProperty(reqJahat, 'headers', {
      get() { throw new Error('boom'); },
    });
    const r: any = await ctl.signUp(
      { name: 'Jahat', email: `jahat-${uniq()}@revota.id`, password: 'password123', role: 'Super Admin' },
      reqJahat
    );
    assert.equal(r?.user?.role, 'Viewer');
  });

  it('resolveWho: sesi valid dikenali; tanpa sesi → system', async () => {
    const u = await seedUser('Support', `dukung-${uniq()}@revota.id`);
    const token = await createSession(db(), u.id);
    // seedUser mengisi name = role, jadi sesi dikenali sebagai 'Support'
    assert.equal(await resolveWho(db(), { headers: { 'x-auth-token': token } }), 'Support');
    assert.equal(await resolveWho(db(), { headers: {} }), 'system');
  });

  it('resolveWho: TIDAK memakai header x-user-email walau ada (fallback system)', async () => {
    const siapa = await resolveWho(db(), { headers: { 'x-user-email': 'attacker@evil.com' } });
    assert.equal(siapa, 'system');
  });

  it('anti-spoofing: sesi asli menang atas header palsu di request yang sama', async () => {
    const budi = await seedUser('Budi', `budi-${uniq()}@revota.id`);
    const token = await createSession(db(), budi.id);
    const who = await resolveWho(db(), {
      headers: { 'x-auth-token': token, 'x-user-email': 'attacker@evil.com' },
    });
    assert.equal(who, 'Budi');
    assert.notEqual(who, 'attacker@evil.com');
  });

  it('logActivity: db rusak tetap resolve (tak pernah melempar)', async () => {
    const dbRusak = { execute: async () => { throw new Error('down'); } };
    await logActivity(dbRusak, { who: 'x', action: 'uji' });
    await logActivity(dbRusak, null as any);
  });

  it('first-admin production membutuhkan setup token yang valid', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSetupToken = process.env.SETUP_TOKEN;
    process.env.NODE_ENV = 'production';
    process.env.SETUP_TOKEN = 'setup-token-test-12345678901234567890';
    const controller = new SetupController();
    const fakeDb: any = {
      execute: async (sql: string) => {
        if (typeof sql !== 'string' || sql.includes('COUNT(*)')) return { rows: [{ c: 0 }] };
        return { rows: [] };
      },
      transaction: async (fn: (tx: any) => Promise<void>) => fn(fakeDb),
    };
    (controller as any).db = fakeDb;
    const body = { name: 'Admin', email: 'admin-critical@revota.id', password: 'password123' };
    await assert.rejects(
      () => controller.firstAdmin(body, { ip: '127.0.0.1', headers: {} }),
      (e: any) => e?.status === 401 && e?.response?.code === 'SETUP_TOKEN_REQUIRED',
    );
    const result = await controller.firstAdmin(body, {
      ip: '127.0.0.1',
      headers: { 'x-setup-token': process.env.SETUP_TOKEN },
    });
    assert.equal(result.user.role, 'Super Admin');
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSetupToken === undefined) delete process.env.SETUP_TOKEN;
    else process.env.SETUP_TOKEN = previousSetupToken;
  });

  it('production boot gagal tanpa setup token', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSetupToken = process.env.SETUP_TOKEN;
    process.env.NODE_ENV = 'production';
    delete process.env.SETUP_TOKEN;
    assert.throws(() => validateConfig(), /SETUP_TOKEN/);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSetupToken === undefined) delete process.env.SETUP_TOKEN;
    else process.env.SETUP_TOKEN = previousSetupToken;
  });
});
