// Uji race first-admin (temuan review H-1): dua POST /setup/first-admin
// bersamaan dengan SETUP_TOKEN valid dan email berbeda wajib menghasilkan
// tepat satu Super Admin; pihak kalah ditolak 409 ALREADY_INITIALIZED.
// Tanpa kunci transaksi di awal tx, keduanya membaca COUNT=0 (phantom pada
// READ COMMITTED) lalu sama-sama INSERT.
// Fake db bersama mensimulasikan semantik pg_advisory_xact_lock: kunci diambil
// di dalam transaksi dan dilepas pemegangnya saat tx selesai (commit/rollback).
// node:test bawaan; jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/pgmem.ts';
import { SetupController } from '../src/setup/setup.controller.ts';

type SharedStore = {
  users: { email: string }[];
  db: any;
};

function sharedStore(): SharedStore {
  const users: { email: string }[] = [];
  let tail: Promise<void> = Promise.resolve();

  // Gerbang: tahan transaksi pertama sampai transaksi kedua masuk, supaya
  // jendela race selalu terbuka. Tanpa ini, hash password yang selesai lebih
  // dulu membuat transaksi pertama selesai lebih dulu dan race kebetulan
  // tertutup (test jadi hijau tanpa fix).
  let started = 0;
  let openBarrier!: () => void;
  const barrier = new Promise<void>((r) => (openBarrier = r));

  // Antrean ala advisory xact lock: pewaris menunggu pemegang sebelumnya
  // melepas; release dipanggil oleh pembungkus transaksi.
  const acquire = (): Promise<() => void> => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const prev = tail;
    tail = prev.then(() => gate);
    return prev.then(() => release);
  };

  // Kueri non-string = template drizzle sql (`SELECT COUNT(*) ...`):-satunya
  // template di firstAdmin, sama seperti fake db di auth-failclosed.test.ts.
  const exec = async (q: any, releases: (() => void)[] | null): Promise<any> => {
    if (typeof q !== 'string') return { rows: [{ c: users.length }] };
    if (q.includes('pg_advisory_xact_lock')) {
      assert.ok(releases, 'advisory lock hanya boleh di dalam transaksi');
      releases.push(await acquire());
      return { rows: [] };
    }
    if (q.includes('INSERT INTO "user"')) {
      const m = q.match(/VALUES \('[^']*', '[^']*', '([^']*)'/);
      users.push({ email: m ? m[1] : '?' });
      return { rows: [] };
    }
    return { rows: [] };
  };

  const db: any = {
    execute: (q: any) => exec(q, null),
    transaction: async (fn: (tx: any) => Promise<void>) => {
      const releases: (() => void)[] = [];
      started += 1;
      if (started >= 2) openBarrier();
      await barrier;
      const tx = { execute: (q: any) => exec(q, releases) };
      try {
        await fn(tx);
      } finally {
        for (const release of releases) release();
      }
    },
  };
  return { users, db };
}

describe('race first-admin (H-1)', () => {
  it('dua first-admin bersamaan: hanya satu Super Admin, satu 409 ALREADY_INITIALIZED', async () => {
    const savedToken = process.env.SETUP_TOKEN;
    process.env.SETUP_TOKEN = 'race-setup-token-0123456789abcdef0123456789abcdef';
    try {
      const shared = sharedStore();
      const controller = () => {
        const c = new SetupController();
        (c as any).db = shared.db;
        return c;
      };
      const body = (email: string) => ({ name: 'Admin', email, password: 'password123' });
      const req = (ip: string) => ({ ip, headers: { 'x-setup-token': process.env.SETUP_TOKEN } });

      const results = await Promise.allSettled([
        controller().firstAdmin(body('race-a@revota.id'), req('10.77.0.1')),
        controller().firstAdmin(body('race-b@revota.id'), req('10.77.0.2')),
      ]);

      const ok = results.filter((r) => r.status === 'fulfilled');
      const bad = results.filter((r) => r.status === 'rejected');
      assert.equal(ok.length, 1, `harus tepat satu yang sukses, dapat ${ok.length}`);
      assert.equal(bad.length, 1, `harus tepat satu yang ditolak, dapat ${bad.length}`);
      const e: any = (bad[0] as PromiseRejectedResult).reason;
      assert.equal(e?.status, 409, `yang kalah wajib 409, dapat ${e?.status}: ${e?.response?.code}`);
      assert.equal(e?.response?.code, 'ALREADY_INITIALIZED');
      assert.equal(shared.users.length, 1, `hanya satu baris user yang tercatat, dapat ${shared.users.length}`);
    } finally {
      if (savedToken === undefined) delete process.env.SETUP_TOKEN;
      else process.env.SETUP_TOKEN = savedToken;
    }
  });
});
