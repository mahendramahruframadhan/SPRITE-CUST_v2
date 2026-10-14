// M4: throttle sign-in per email+IP — 11x cepat → 429, bukan 200.
// Pinning test perilaku yang sudah ada (mitigasi brute-force).
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';

describe('sign-in throttle (M4)', () => {
  before(() => {
    setupTables();
  });

  it('11x login cepat email sama → 429 AUTH_RATE_LIMITED', async () => {
    const email = `hammer-${Date.now().toString(36)}@revota.id`;
    await seedUser('Viewer', email);
    const ctl = new AuthController();
    for (let i = 0; i < 10; i++) {
      await ctl.signIn({ email, password: 'password123' }, {});
    }
    await assert.rejects(() => ctl.signIn({ email, password: 'password123' }, {}), (e: any) => {
      return e?.status === 429 && e?.response?.code === 'AUTH_RATE_LIMITED';
    });
  });
});
