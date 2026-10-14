// Uji F3 — throttle harus memakai SATU store yang menyapu entri kedaluwarsa.
// Dulu ada tiga Map terpisah (auth/rate-limit.ts, throttleFirstAdmin di
// setup.controller.ts, aiHits di ai.controller.ts) yang tak pernah dihapus →
// memori backend terus tumbuh selama proses hidup (kebocoran memori lewat
// pemanggilan berulang dengan kunci unik: IP/email tujuan).
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables } from './helpers/pgmem.ts';
import * as rl from '../src/auth/rate-limit.ts';
import { SetupController } from '../src/setup/setup.controller.ts';
import { AiController } from '../src/ai/ai.controller.ts';

const uniq = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasBucket = (key: string): boolean => {
  const fn = (rl as any).hasBucket;
  if (typeof fn !== 'function') return false;
  return fn(key) === true;
};
const bucketCount = (): number => {
  const fn = (rl as any).bucketCount;
  return typeof fn === 'function' ? fn() : -1;
};
const assertHooks = () => {
  assert.equal(typeof (rl as any).hasBucket, 'function', 'hasBucket harus diekspor untuk menguji sweep');
  assert.equal(typeof (rl as any).bucketCount, 'function', 'bucketCount harus diekspor untuk menguji sweep');
};

describe('F3 — sweep store rate-limit', () => {
  before(() => {
    setupTables();
  });

  it('entri kedaluwarsa dihapus — jumlah bucket kembali terkendali', async () => {
    assertHooks();
    const size0 = bucketCount();
    const keys: string[] = [];
    for (let i = 0; i < 25; i++) {
      const k = `leak-${i}-${uniq()}`;
      keys.push(k);
      assert.equal(rl.consumeRateLimit(k, 5, 10), true, 'prekondisi: bucket dibuat');
    }
    assert.equal(bucketCount(), size0 + 25, 'prekondisi: 25 bucket tersimpan');
    await sleep(25); // lewat window 10ms
    rl.consumeRateLimit(`trigger-${uniq()}`, 5, 10); // pemanggilan biasa memicu penyapuan
    for (const k of keys) {
      assert.equal(hasBucket(k), false, `entri kedaluwarsa ${k} harus terhapus dari memori`);
    }
    assert.ok(
      bucketCount() <= size0 + 1,
      `25 entri kedaluwarsa harus terhapus (size0=${size0}, kini=${bucketCount()})`,
    );
    assert.ok(rl.consumeRateLimit(`trigger-${uniq()}`, 5, 10), 'store tetap berfungsi setelah sweep');
  });

  it('entri yang window-nya belum lewat TIDAK ikut terhapus', async () => {
    assertHooks();
    const key = `hold-${uniq()}`;
    rl.consumeRateLimit(key, 5, 60_000);
    await sleep(25);
    rl.consumeRateLimit(`other-${uniq()}`, 5, 10); // memicu penyapuan
    assert.equal(hasBucket(key), true, 'bucket window 1 menit tidak boleh terhapus saat masih hidup');
  });

  it('throttle setup/first-admin memakai store bersama (ikut tersapu)', async () => {
    assertHooks();
    const ip = `198.51.100.${(bucketCount() % 200) + 1}-${uniq()}`;
    const ctl = new SetupController();
    try {
      await ctl.firstAdmin(
        { name: 'X', email: `first-${uniq()}@revota.id`, password: 'password123' },
        { ip, headers: {} },
      );
    } catch {
      // token/batasan boleh menolak — yang diuji adalah pencatatan di store
    }
    assert.equal(hasBucket(`setup:first-admin:${ip}`), true, 'throttle setup harus tercatat di store bersama');
  });

  it('kuota AI memakai store bersama (ikut tersapu)', async () => {
    assertHooks();
    const userId = `u_ai_${uniq()}`;
    const ctl = new AiController();
    try {
      await ctl.chat(
        { messages: [{ role: 'user', content: 'halo' }] },
        { user: { id: userId }, ip: '198.51.100.9' },
      );
    } catch {
      // konfigurasi AI/DB boleh gagal — yang diuji adalah pencatatan kuota
    }
    assert.equal(hasBucket(`ai:chat:${userId}`), true, 'kuota AI harus tercatat di store bersama');
  });
});
