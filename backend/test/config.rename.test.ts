// M6: rename status master + migrasi baris kasus harus ATOMIK.
// Kode lama: config ditulis dulu, migrasi gagal → catch → tetap
// `ok:true, migrated:0` (master dan data tidak sinkron).
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigController } from '../src/config/config.controller.ts';

function ctlWith(txFake: any, txSpy: { called: boolean }) {
  const ctl: any = new ConfigController();
  ctl.db = {
    execute: async (sql: string) => {
      if (/SELECT value FROM app_config/.test(sql)) return { rows: [{ value: JSON.stringify(['LUNAS', 'BELUM']) }] };
      return { rows: [] };
    },
    transaction: async (fn: any) => { txSpy.called = true; return fn(txFake); },
  };
  return ctl;
}

describe('rename status atomik (M6)', () => {
  it('migrasi gagal → error dilempar (BUKAN ok:true, migrated:0)', async () => {
    const txSpy = { called: false };
    const txFake = {
      execute: async (sql: string) => {
        if (/SELECT COUNT/.test(sql)) return { rows: [{ c: 2 }] };
        if (/UPDATE invoice_status/.test(sql)) throw new Error('koneksi putus');
        return { rows: [] };
      },
    };
    const ctl = ctlWith(txFake, txSpy);
    await assert.rejects(
      () => ctl.renameStatusOption({ scope: 'invoiceActions', from: 'LUNAS', to: 'LUNAS BARU' }),
      /koneksi putus/,
      'error migrasi harus keluar, response tetap-sukses dilarang',
    );
    assert.equal(txSpy.called, true, 'tulis config + migrasi wajib dalam satu transaction');
  });

  it('happy path: config ditulis DALAM tx, UPDATE migrasi dieksekusi, migrated benar', async () => {
    const txSpy = { called: false };
    const seen: string[] = [];
    const txFake = {
      execute: async (sql: string) => {
        seen.push(sql);
        if (/SELECT COUNT/.test(sql)) return { rows: [{ c: 3 }] };
        return { rows: [] };
      },
    };
    const ctl = ctlWith(txFake, txSpy);
    const r: any = await ctl.renameStatusOption({ scope: 'invoiceActions', from: 'LUNAS', to: 'LUNAS BARU' });
    assert.equal(txSpy.called, true);
    assert.equal(r.ok, true);
    assert.equal(r.migrated, 3);
    assert.ok(seen.some((s) => /INSERT INTO app_config/.test(s) && s.includes('LUNAS BARU')), 'config baru ditulis dalam tx');
    assert.ok(seen.some((s) => /UPDATE invoice_status/.test(s) && s.includes('LUNAS BARU')), 'migrasi UPDATE dieksekusi');
  });
});
