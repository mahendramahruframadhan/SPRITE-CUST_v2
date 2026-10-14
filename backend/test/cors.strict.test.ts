// Uji H6 + M3: CORS tidak boleh membuka seluruh subnet (origin eksplisit
// saja), dan credentials:true WAJIB karena auth kini memakai cookie httpOnly.
// node:test murni (tanpa boot server). Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCorsOptions } from '../src/config/cors.ts';

describe('H6 — CORS ketat', () => {
  it('memakai credentials (auth cookie httpOnly butuh kredensial browser)', () => {
    const saved = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'http://localhost:5173';
    try {
      assert.equal(buildCorsOptions().credentials, true);
    } finally {
      if (saved === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = saved;
    }
  });

  it('origin hanya daftar eksplisit — tidak ada regex subnet', () => {
    const saved = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'http://localhost:5173';
    try {
      const origins = buildCorsOptions().origin as unknown[];
      assert.ok(Array.isArray(origins), 'origin harus array eksplisit');
      for (const o of origins) {
        assert.equal(typeof o, 'string', `origin harus string eksplisit, dapat: ${String(o)}`);
      }
      // Host eksplisit (mis. 192.168.1.5 user) boleh; yang dilarang adalah
      // pola wildcard/regex ala subnet ("subnet mana pun boleh").
      const joined = origins.join(' ');
      for (const wild of ['*', '\\d', '^http', '[$', '[', ']', '(', ')', '|']) {
        assert.ok(!joined.includes(wild), `tidak boleh ada pola wildcard/regex: ${wild}`);
      }
    } finally {
      if (saved === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = saved;
    }
  });

  it('origin eksplisit yang dibutuhkan tetap diizinkan (dev + LAN user)', () => {
    const saved = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'http://localhost:5173';
    try {
      const origins = buildCorsOptions().origin as string[];
      for (const must of ['http://localhost:5173', 'http://localhost:3000', 'http://192.168.1.5:5173']) {
        assert.ok(origins.includes(must), `${must} harus tetap diizinkan`);
      }
    } finally {
      if (saved === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = saved;
    }
  });

  it('FRONTEND_URL kustom ikut diizinkan', () => {
    const saved = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.contoh.id';
    try {
      const origins = buildCorsOptions().origin as string[];
      assert.ok(origins.includes('https://app.contoh.id'));
    } finally {
      if (saved === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = saved;
    }
  });
});
