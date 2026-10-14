// CSRF compensation untuk cookie httpOnly: request MUTASI yang membawa
// cookie sesi (tanpa header x-auth-token) wajib ber-Origin/Referer dari
// origin yang diizinkan. node:test murni. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCsrfAllowed } from '../src/auth/csrf.ts';

const ORIGINS = ['http://localhost:5173', 'https://app.contoh.id'];
const mut = (headers: any = {}) => ({ method: 'POST', headers });

describe('CSRF guard cookie', () => {
  it('GET selalu lolos (bukan mutasi)', () => {
    assert.equal(isCsrfAllowed({ method: 'GET', headers: {} }, ORIGINS), true);
  });

  it('mutasi + header x-auth-token lolos tanpa Origin (skrip/test eksplisit)', () => {
    assert.equal(isCsrfAllowed(mut({ 'x-auth-token': 'abc' }), ORIGINS), true);
  });

  it('mutasi tanpa cookie + tanpa header lolos (gagal di guard 401, bukan urusan CSRF)', () => {
    assert.equal(isCsrfAllowed(mut({}), ORIGINS), true);
  });

  it('mutasi + cookie + Origin diizinkan lolos', () => {
    const req = mut({ cookie: 'better-auth.session_token=tok', origin: 'http://localhost:5173' });
    assert.equal(isCsrfAllowed(req, ORIGINS), true);
  });

  it('mutasi + cookie + Origin asing DITOLAK', () => {
    const req = mut({ cookie: 'better-auth.session_token=tok', origin: 'https://evil.test' });
    assert.equal(isCsrfAllowed(req, ORIGINS), false);
  });

  it('mutasi + cookie tanpa Origin/Referer DITOLAK', () => {
    const req = mut({ cookie: 'better-auth.session_token=tok' });
    assert.equal(isCsrfAllowed(req, ORIGINS), false);
  });

  it('Referer diizinkan sebagai fallback Origin', () => {
    const req = mut({ cookie: 'better-auth.session_token=tok', referer: 'https://app.contoh.id/finance' });
    assert.equal(isCsrfAllowed(req, ORIGINS), true);
  });
});
