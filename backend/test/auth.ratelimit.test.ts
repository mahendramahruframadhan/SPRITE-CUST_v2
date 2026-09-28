// Uji H1+H5: sign-in & sign-up wajib di-throttle (anti brute-force &
// anti mass-registration). Tanpa ini, POST /api/auth/sign-in/email bisa
// dihantam tanpa batas dengan password min. 5 karakter, dan sign-up terbuka
// bisa membanjiri tabel user.
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';

const uniq = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe('H1+H5 — rate limit auth', () => {
  before(() => {
    setupTables();
  });

  it('sign-in: dihantam >10x dalam 5 menit → 429 RATE_LIMITED', async () => {
    const email = `brute-${uniq()}@revota.id`;
    await seedUser('Viewer', email);
    const ctl = new AuthController();
    let limited = 0;
    for (let i = 0; i < 15; i++) {
      try {
        await ctl.signIn({ email, password: 'salah-tebak' }, { ip: '10.9.9.9' });
      } catch (e: any) {
        if (e?.status === 429) limited++;
        else throw e;
      }
    }
    assert.ok(limited > 0, 'rentetan tebakan password harus kena 429');
  });

  it('sign-up: >10x dari IP sama dalam 1 menit → 429 RATE_LIMITED', async () => {
    const ctl = new AuthController();
    const ip = `10.8.8.${Math.floor(Math.random() * 200) + 10}`;
    let limited = 0;
    for (let i = 0; i < 15; i++) {
      try {
        await ctl.signUp(
          { name: 'Spam', email: `spam-${uniq()}-${i}@revota.id`, password: 'password123' },
          { ip, headers: {} },
        );
      } catch (e: any) {
        if (e?.status === 429) limited++;
        else throw e;
      }
    }
    assert.ok(limited > 0, 'rentetan registrasi harus kena 429');
  });
});
