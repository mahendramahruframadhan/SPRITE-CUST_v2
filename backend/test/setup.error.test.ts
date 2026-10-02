// Uji M-5 (review): kegagalan tak terduga saat membuat first-admin (DB down,
// timeout, dsb.) wajib dilaporkan 500 SETUP_FAILED, BUKAN 409 ALREADY_INITIALIZED.
// 409 palsu menyesatkan operator: "sudah memiliki akun, silakan login" padahal
// DB-nya mati dan akunnya tidak pernah terbuat.
// node:test bawaan; jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SetupController } from '../src/setup/setup.controller.ts';

describe('M-5 first-admin error mapping', () => {
  it('error tak terduga di transaksi → 500 SETUP_FAILED (bukan 409 ALREADY_INITIALIZED)', async () => {
    const savedToken = process.env.SETUP_TOKEN;
    process.env.SETUP_TOKEN = 'setup-error-token-0123456789abcdef0123456789';
    try {
      const controller = new SetupController();
      const fakeDb: any = {
        execute: async () => ({ rows: [] }),
        transaction: async () => {
          throw new Error('db down');
        },
      };
      (controller as any).db = fakeDb;
      await assert.rejects(
        () =>
          controller.firstAdmin(
            { name: 'Admin', email: 'admin-error@revota.id', password: 'password123' },
            { ip: '10.9.0.1', headers: { 'x-setup-token': process.env.SETUP_TOKEN } },
          ),
        (e: any) => {
          assert.equal(e?.status, 500, `harus 500, dapat ${e?.status} (${e?.response?.code})`);
          assert.equal(e?.response?.code, 'SETUP_FAILED');
          assert.notEqual(e?.response?.code, 'ALREADY_INITIALIZED');
          return true;
        },
      );
    } finally {
      if (savedToken === undefined) delete process.env.SETUP_TOKEN;
      else process.env.SETUP_TOKEN = savedToken;
    }
  });
});
