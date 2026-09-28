// Uji fail-closed environment — node:test bawaan, tanpa DB.
// Mengunci Kritis #1 (NODE_ENV kosong/salah ketik mematikan seluruh guard
// produksi karena cabang "!= production" dievaluasi true) dan Kritis #2
// (seed 6 user berpassword lemah ikut aktif karena guard yang sama).
//
// Aturan yang dikunci: hanya env yang EKSPLISIT 'development' boleh menjalankan
// seed demo & melewati setup token. Env kosong / tak dikenal = tidak aman.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config/validate.ts';
import { isProduction, isKnownEnv, isDevSeedAllowed } from '../src/config/env.ts';

// Kembalikan env ke kondisi sebelum test; dipanggil di setiap it.
const withEnv = (patch: Record<string, string | undefined>, fn: () => void) => {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(patch)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

// Env minimum yang lolos validateConfig supaya uji terfokus pada NODE_ENV.
const VALID_DEFAULTS = { PORT: '5005', DATABASE_URL: '', SHEETS_MOCK: 'true' };

describe('environment fail-closed (Kritis #1 & #2)', () => {
  it('env kosong: isKnownEnv false, isProduction false, isDevSeedAllowed false', () => {
    withEnv({ NODE_ENV: undefined, ...VALID_DEFAULTS }, () => {
      assert.equal(isKnownEnv(), false);
      assert.equal(isProduction(), false);
      // INI inti Kritis #2: dulu `!== 'production'` bernilai true saat env
      // kosong sehingga 6 user Super Admin berpassword lemah ikut ter-seed.
      assert.equal(isDevSeedAllowed(), false);
    });
  });

  it('NODE_ENV salah ketik (prod/production1) diperlakukan sebagai tak dikenal', () => {
    for (const bad of ['prod', 'production1', 'Production ', 'PRODUCTION']) {
      withEnv({ NODE_ENV: bad, ...VALID_DEFAULTS }, () => {
        assert.equal(isKnownEnv(), false, `NODE_ENV=${JSON.stringify(bad)} harus tak dikenal`);
        assert.equal(isProduction(), false);
        assert.equal(isDevSeedAllowed(), false, `NODE_ENV=${JSON.stringify(bad)} tak boleh seed demo`);
      });
    }
  });

  it('NODE_ENV=production dikenali dan menutup seed demo', () => {
    withEnv({ NODE_ENV: 'production', ...VALID_DEFAULTS }, () => {
      assert.equal(isKnownEnv(), true);
      assert.equal(isProduction(), true);
      assert.equal(isDevSeedAllowed(), false);
    });
  });

  it('hanya NODE_ENV=development yang eksplisit boleh seed demo & bypass setup token', () => {
    withEnv({ NODE_ENV: 'development', ...VALID_DEFAULTS }, () => {
      assert.equal(isKnownEnv(), true);
      assert.equal(isDevSeedAllowed(), true);
    });
    withEnv({ NODE_ENV: 'test', ...VALID_DEFAULTS }, () => {
      // 'test' dikenali sebagai env sah ( booting di CI), tapi TIDAK cukup
      // untuk seed akun demo — harus development yang disengaja.
      assert.equal(isKnownEnv(), true);
      assert.equal(isDevSeedAllowed(), false);
    });
  });

  it('validateConfig menolak env kosong (tidak bisa boot diam-diam tanpa NODE_ENV)', () => {
    withEnv({ NODE_ENV: undefined, ...VALID_DEFAULTS }, () => {
      assert.throws(() => validateConfig(), /NODE_ENV/);
    });
  });

  it('validateConfig menolak NODE_ENV tak dikenal, pesan menyebut nilai yang muncul', () => {
    withEnv({ NODE_ENV: 'prod', ...VALID_DEFAULTS }, () => {
      assert.throws(() => validateConfig(), /NODE_ENV/);
    });
  });

  it('validateConfig tetap menerima development (alur dev lokal tidak rusak)', () => {
    withEnv({ NODE_ENV: 'development', ...VALID_DEFAULTS }, () => {
      assert.doesNotThrow(() => validateConfig());
    });
  });

  it('validateConfig menerima test (boot cepat di CI) tanpa mengaktifkan seed demo', () => {
    withEnv({ NODE_ENV: 'test', ...VALID_DEFAULTS }, () => {
      assert.doesNotThrow(() => validateConfig());
    });
  });
});
