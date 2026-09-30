// M2: flag `running` tidak boleh terkunci permanen. INSERT INTO sync_logs
// ada di LUAR try/finally pada kode lama → bila INSERT itu gagal, running
// tetap true dan semua sync berikutnya ditolak selamanya.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SyncService } from '../src/sync/sync.service.ts';

const sheetsOk = {
  isMock: () => false,
  readDataTab: async () => ({ rows: [], tab: 'Data', readRows: 0, skippedRows: 0 }),
};

describe('sync running flag (M2)', () => {
  it('INSERT sync_logs gagal → error tetap lepas, run berikutnya TIDAK ditolak', async () => {
    const svc: any = new SyncService(sheetsOk as any);
    const exec = async (sql: string) => {
      if (/INSERT INTO sync_logs/.test(sql)) throw new Error('disk penuh');
      return { rows: [] };
    };
    svc.db = { execute: exec, pq: async (t: string, p: any[]) => exec(`${t} /*${JSON.stringify(p)}*/`) };

    await assert.rejects(() => svc.run('manual'), /disk penuh/, 'error asli harus tetap muncul');

    // DB sehat lagi: run kedua harus jalan, bukan ditolak "sedang berjalan".
    const okExec = async () => ({ rows: [] });
    svc.db = { execute: okExec, pq: async (t: string, p: any[]) => okExec() };
    const r2: any = await svc.run('manual');
    assert.notEqual(r2?.error, 'Sinkron sedang berjalan — coba lagi sebentar', 'running harus sudah false');
    assert.equal(r2?.ok, true, 'run kedua harus sukses');
  });
});
