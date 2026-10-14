// Uji F5/F6 — registrasi terbuka tidak boleh langsung memberi akun aktif.
// Dulu POST /auth/sign-up/email selalu INSERT active=1, padahal GET /cases*
// hanya berbasis sesi (tanpa cek modul) → pendaftar mandiri langsung bisa
// baca data kasus; endpoint AI juga terbuka untuk sesi valid apa pun.
// Keputusan: akun pendaftar mandiri disimpan active=0 (butuh aktivasi admin
// lewat PATCH /users/:id); akun dibuat Super Admin (form tambah di /roles)
// tetap active=1.
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession } from '../src/auth/session.ts';
import { AuthController } from '../src/auth/auth.controller.ts';

const uniq = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const withToken = (t: string) => ({ headers: { 'x-auth-token': t } });

const activeOf = async (email: string): Promise<number | null> => {
  const r: any = await db().pq(`SELECT active FROM "user" WHERE email=$1`, [email]);
  const row = (r.rows || r)[0];
  return row ? Number(row.active) : null;
};

describe('F5 — aktivasi akun', () => {
  before(() => {
    setupTables();
  });

  it('registrasi mandiri → akun nonaktif & login ditolak (respons tetap generik)', async () => {
    const auth = new AuthController();
    const email = `mandiri-${uniq()}@revota.id`;
    const r: any = await auth.signUp(
      { name: 'Pendaftar Mandiri', email, password: 'password123' },
      { headers: {} },
    );
    assert.equal(r?.pendingActivation, true, 'respons wajib memberi tanda pendingActivation');
    assert.equal(await activeOf(email), 0, 'akun pendaftar mandiri harus active=0');

    const si: any = await auth.signIn({ email, password: 'password123' }, { headers: {} }, undefined);
    assert.equal(si?.error, 'invalid credentials', 'akun nonaktif harus ditolak dengan respons generik anti-oracle');
    assert.equal(si?.user, undefined, 'tidak boleh ada token sesi untuk akun nonaktif');
  });

  it('dibuat oleh Super Admin (form /roles) → aktif & langsung bisa login', async () => {
    const sa = await seedUser('Super Admin', `sa-${uniq()}@revota.id`);
    const saToken = await createSession(db(), sa.id);
    const auth = new AuthController();
    const email = `finance-${uniq()}@revota.id`;

    const r: any = await auth.signUp(
      { name: 'Finance Baru', email, password: 'password123', role: 'Finance' },
      withToken(saToken),
    );
    assert.equal(r?.user?.role, 'Finance', 'role pilihan SA tetap dihormati');
    assert.equal(r?.pendingActivation, undefined, 'akun buatan SA bukan pending');
    assert.equal(await activeOf(email), 1, 'akun buatan SA harus active=1');

    const si: any = await auth.signIn({ email, password: 'password123' }, { headers: {} }, undefined);
    assert.ok(si?.user, `akun buatan SA harus langsung login (respons: ${JSON.stringify(si)})`);
    assert.equal(si?.user?.role, 'Finance');
  });

  it('dibuat oleh non-SA berizin roles → nonaktif (hanya SA yang membuat akun langsung aktif)', async () => {
    const admin = await seedUser('Admin CS', `acs-${uniq()}@revota.id`);
    const token = await createSession(db(), admin.id);
    const auth = new AuthController();
    const email = `cs-${uniq()}@revota.id`;

    const r: any = await auth.signUp(
      { name: 'CS Baru', email, password: 'password123' },
      withToken(token),
    );
    assert.equal(r?.pendingActivation, true, 'pembuat non-SA → akun pending');
    assert.equal(await activeOf(email), 0, 'harus active=0 sampai diaktifkan admin');

    const si: any = await auth.signIn({ email, password: 'password123' }, { headers: {} }, undefined);
    assert.equal(si?.error, 'invalid credentials', 'belum bisa login sebelum aktivasi');
  });
});
