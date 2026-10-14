// Uji F4 — TRUST_PROXY harus di-parse fail-closed (konsisten filosofi env.ts:
// env kosong/salah ketik → TIDAK dipercaya), dan main.ts hanya boleh
// mengaktifkan Express `trust proxy` dari hasil parser itu.
// Tanpa parser ini, di belakang reverse proxy semua request berasal dari IP
// proxy → kunci rate-limit (signin/signup/first-admin/AI) menjadi seragam →
// perlambat brute-force mati (satu IP penyerang mengunci/melambatkan semua).
//
// Uji F7 — mode development mem-bind 0.0.0.0 tanpa SETUP_TOKEN; boot wajib
// memunculkan peringatan operator (bukan perubahan perilaku).
// node:test. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as env from '../src/config/env.ts';

const trustProxy = (env as any).trustProxy as ((raw?: string) => unknown) | undefined;
const devModeWarnings = (env as any).devModeWarnings as (() => string[]) | undefined;

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) prev[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('F4 — parser TRUST_PROXY', () => {
  it('nilai default ada dan fail-closed untuk env kosong/tak dikenal', () => {
    assert.equal(typeof trustProxy, 'function', 'trustProxy harus diekspor dari config/env.ts');
    assert.equal(trustProxy?.(''), false, 'env kosong → trust proxy mati');
    assert.equal(trustProxy?.(undefined), false, 'tanpa env → trust proxy mati');
    assert.equal(trustProxy?.('bogus'), false, 'nilai tak dikenal → trust proxy mati');
    assert.equal(trustProxy?.('True'), false, 'salah kapitalisasi → dianggap salah ketik (fail-closed)');
    assert.equal(trustProxy?.(' true'), false, 'berspasi → dianggap salah ketik (fail-closed)');
    assert.equal(trustProxy?.('0'), false, '0 hop = percaya tidak ada proxy');
  });

  it('hanya menerima true/false/bilangan bulat hop yang eksplisit', () => {
    assert.equal(trustProxy?.('true'), true, 'true → aktif penuh');
    assert.equal(trustProxy?.('false'), false, 'false → mati');
    assert.equal(trustProxy?.('1'), 1, 'angka = jumlah hop di belakang proxy');
    assert.equal(trustProxy?.('2'), 2);
    assert.equal(trustProxy?.('1.5'), false, 'pecahan → tak dikenal (fail-closed)');
    assert.equal(trustProxy?.('-1'), false, 'negatif → tak dikenal (fail-closed)');
    assert.equal(trustProxy?.('yes'), false, 'sinonim bebas tidak diterima (salah ketik = mati)');
  });

  it('membaca process.env.TRUST_PROXY secara langsung saat argumen dihilangkan', () => {
    withEnv({ TRUST_PROXY: '1' }, () => {
      assert.equal(trustProxy?.(), 1, 'default argumen = process.env.TRUST_PROXY');
    });
    withEnv({ TRUST_PROXY: undefined }, () => {
      assert.equal(trustProxy?.(), false, 'tanpa env → false');
    });
  });
});

describe('F7 — peringatan boot mode development', () => {
  it('production → tanpa peringatan', () => {
    assert.equal(typeof devModeWarnings, 'function', 'devModeWarnings harus diekspor dari config/env.ts');
    withEnv({ NODE_ENV: 'production', TRUST_PROXY: undefined }, () => {
      assert.deepEqual(devModeWarnings?.(), [], 'production tidak boleh memunculkan peringatan mode dev');
    });
  });

  it('development tanpa TRUST_PROXY → memuat peringatan yang menyebut TRUST_PROXY', () => {
    withEnv({ NODE_ENV: 'development', TRUST_PROXY: undefined }, () => {
      const w = devModeWarnings?.();
      assert.ok(Array.isArray(w) && w.length > 0, 'development wajib memunculkan peringatan');
      assert.ok(
        w.some((s: string) => s.includes('TRUST_PROXY')),
        `peringatan harus menyebut TRUST_PROXY (dapat: ${JSON.stringify(w)})`,
      );
      assert.ok(
        w.some((s: string) => s.includes('0.0.0.0')),
        'peringatan harus menyebut bind 0.0.0.0 (terbuka di LAN)',
      );
    });
  });

  it('development + TRUST_PROXY=1 → peringatan proxy hilang, peringatan mode dev tetap ada', () => {
    withEnv({ NODE_ENV: 'development', TRUST_PROXY: '1' }, () => {
      const w = devModeWarnings?.();
      assert.ok(Array.isArray(w) && w.length >= 1, 'peringatan mode dev tetap tampil');
      assert.equal(
        w.some((s: string) => s.includes('TRUST_PROXY')),
        false,
        'peringatan proxy tidak boleh muncul bila TRUST_PROXY sudah diset',
      );
    });
  });

  it('env tak dikenal → tetap dianggap mode dev (fail-closed, konsisten nodeEnv)', () => {
    withEnv({ NODE_ENV: 'prod', TRUST_PROXY: undefined }, () => {
      const w = devModeWarnings?.();
      assert.ok(Array.isArray(w) && w.length > 0, 'env salah ketik harus tetap memunculkan peringatan');
    });
  });
});
