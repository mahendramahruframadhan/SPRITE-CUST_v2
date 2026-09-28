// Uji H2: sign-in tidak boleh membocorkan keberadaan/status akun.
// Dulu: email tak dikenal → 'invalid credentials', password legacy →
// 'password reset required', akun nonaktif → 'akun dinonaktifkan' — tiga
// pesan berbeda = oracle enumerasi. Selain itu cabang `!row` return SEBELUM
// scrypt sehingga waktunya berbeda (timing oracle).
// Sesudah fix: semua kegagalan → pesan & biaya komputasi identik.
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { esc } from '../src/db/sql.ts';

const uniq = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe('H2 — sign-in tanpa oracle enumerasi', () => {
  before(() => {
    setupTables();
  });

  it('email tak dikenal, password salah, akun legacy, akun nonaktif → pesan IDENTIK', async () => {
    const ctl = new AuthController();
    const suffix = uniq();

    // akun legacy: password plaintext pra-scrypt
    const legacyEmail = `legacy-${suffix}@revota.id`;
    const legacyId = `u_legacy_${suffix}`;
    await db().execute(
      `INSERT INTO "user" (id, name, email, role, active) VALUES ('${esc(legacyId)}','Legacy','${esc(legacyEmail)}','Viewer',1)` as any,
    );
    await db().execute(
      `INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ('acc_${esc(legacyId)}','${esc(legacyEmail)}','credential','${esc(legacyId)}','password123')` as any,
    );

    // akun nonaktif
    const offEmail = `mati-${suffix}@revota.id`;
    const off = await seedUser('Viewer', offEmail);
    await db().execute(`UPDATE "user" SET active=0 WHERE id='${esc(off.id)}'` as any);

    // akun normal untuk kasus password salah
    const userEmail = `biasa-${suffix}@revota.id`;
    await seedUser('Viewer', userEmail);

    const cases: Array<[string, any]> = [
      ['email tak dikenal', { email: `tidak-ada-${suffix}@revota.id`, password: 'password123' }],
      ['password salah', { email: userEmail, password: 'jelas-salah' }],
      ['password legacy', { email: legacyEmail, password: 'password123' }],
      ['akun nonaktif', { email: offEmail, password: 'password123' }],
    ];

    const errors = new Set<string>();
    for (const [label, body] of cases) {
      const r: any = await ctl.signIn(body, { ip: `10.7.7.${Math.floor(Math.random() * 200) + 10}` }, {});
      assert.ok(r?.error, `${label}: harus gagal`);
      assert.ok(!r?.token, `${label}: tidak boleh ada token`);
      errors.add(String(r.error));
    }
    assert.equal(errors.size, 1, `semua kegagalan harus berpesan sama, dapat: ${[...errors].join(' | ')}`);
  });
});
