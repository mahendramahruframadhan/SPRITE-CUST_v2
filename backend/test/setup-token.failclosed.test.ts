// Uji Kritis #2 (bagian 3): bypass SETUP_TOKEN pada /setup/first-admin hanya
// boleh di NODE_ENV=development. Dulu `NODE_ENV !== 'production'` bernilai
// TRUE saat env kosong, jadi SETUP_TOKEN kosong = siapa pun boleh menunjuk
// dirinya Super Admin di instalasi yang belum punya user.
// node:test + controller langsung (stub db), tanpa pg-mem/Docker.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SetupController } from '../src/setup/setup.controller.ts';

const controllerWithStubDb = () => {
  const controller = new SetupController();
  // userCount=0 supaya lolos cek ALREADY_INITIALIZED; yang diuji murni
  // cabang hasValidSetupToken.
  const fakeDb: any = {
    execute: async (q: string) => {
      if (typeof q === 'string' && q.includes('COUNT(*)')) return { rows: [{ c: 0 }] };
      return { rows: [] };
    },
    transaction: async (fn: (tx: any) => Promise<void>) => fn(fakeDb),
  };
  (controller as any).db = fakeDb;
  return controller;
};

// IP acak per panggilan: throttleFirstAdmin menolak >10 percobaan/menit per IP.
let ipSeq = 0;
const freshIp = () => `10.0.0.${(ipSeq = (ipSeq + 17) % 200) + 20}`;

describe('Kritis #2 — first-admin butuh SETUP_TOKEN kecuali development eksplisit', () => {
  it('NODE_ENV kosong / production / test / salah ketik → 401 tanpa SETUP_TOKEN', async () => {
    const savedEnv = process.env.NODE_ENV;
    const savedToken = process.env.SETUP_TOKEN;
    delete process.env.SETUP_TOKEN;
    const body = { name: 'Admin', email: 'admin-critical@revota.id', password: 'password123' };
    try {
      for (const env of [undefined, 'production', 'test', 'prod']) {
        if (env === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env;
        await assert.rejects(
          () => controllerWithStubDb().firstAdmin(body, { ip: freshIp(), headers: {} }),
          (e: any) => e?.status === 401 && e?.response?.code === 'SETUP_TOKEN_REQUIRED',
          `NODE_ENV=${JSON.stringify(env)} tanpa SETUP_TOKEN harus 401`,
        );
      }
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
      if (savedToken === undefined) delete process.env.SETUP_TOKEN;
      else process.env.SETUP_TOKEN = savedToken;
    }
  });

  it('NODE_ENV=development → first-admin tetap jalan tanpa SETUP_TOKEN', async () => {
    const savedEnv = process.env.NODE_ENV;
    const savedToken = process.env.SETUP_TOKEN;
    process.env.NODE_ENV = 'development';
    delete process.env.SETUP_TOKEN;
    try {
      const ok = await controllerWithStubDb().firstAdmin(
        { name: 'Admin', email: 'admin-dev@revota.id', password: 'password123' },
        { ip: freshIp(), headers: {} },
      );
      assert.equal(ok.user.role, 'Super Admin');
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
      if (savedToken === undefined) delete process.env.SETUP_TOKEN;
      else process.env.SETUP_TOKEN = savedToken;
    }
  });
});
