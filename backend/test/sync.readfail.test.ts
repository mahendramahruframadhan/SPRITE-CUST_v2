// M1: kegagalan baca Google Sheets HARUS melempar (typed error), bukan
// berubah jadi data kosong. Dulu: readDataTab gagal → {rows:[]} → SyncService
// menandai success + menimpa syncHashes dengan {} (outage tak terlihat).
// Sheet yang sah-sah saja kosong tetap boleh menghasilkan rows:[].
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SheetsService, SheetsReadError } from '../src/sheets/sheets.service.ts';
import { SyncService } from '../src/sync/sync.service.ts';
import { SyncController } from '../src/sync/sync.controller.ts';

const brokenSheetsApi = {
  spreadsheets: {
    values: { get: async () => { throw new Error('quota exceeded'); } },
    get: async () => { throw new Error('meta failed'); },
  },
};
const emptySheetApi = {
  spreadsheets: {
    values: { get: async () => ({ data: { values: [] } }) },
    get: async () => ({ data: { sheets: [{ properties: { title: 'Data' } }] } }),
  },
};

function sheetsService(api: any) {
  const svc: any = new SheetsService();
  svc.mock = false;
  svc.sheets = api;
  return svc;
}

function fakeDb(store: any) {
  const exec = async (sql: string) => {
    if (/INSERT INTO sync_logs/.test(sql)) { store.logInserts = (store.logInserts || 0) + 1; return { rows: [] }; }
    if (/UPDATE sync_logs/.test(sql)) { store.logStatus = (/status='failed'/.test(sql) ? 'failed' : 'success'); return { rows: [] }; }
    if (/SELECT value FROM app_config WHERE key='syncHashes'/.test(sql)) {
      return { rows: [{ value: store.prior }] };
    }
    if (/INSERT INTO app_config/.test(sql)) { store.hashesWritten = (store.hashesWritten || 0) + 1; return { rows: [] }; }
    if (/INSERT INTO activity_logs/.test(sql)) return { rows: [] };
    return { rows: [] };
  };
  // Imp#1: query input kini lewat pq(text, params) — fake ikut meneruskan.
  return { execute: exec, pq: async (t: string, p: any[]) => exec(`${t} /*${JSON.stringify(p)}*/`) };
}

describe('readDataTab gagal baca (M1)', () => {
  it('API Sheets error → melempar SheetsReadError (bukan rows kosong)', async () => {
    const svc = sheetsService(brokenSheetsApi);
    await assert.rejects(
      () => svc.readDataTab(),
      (e: any) => e instanceof SheetsReadError && e.code === 'SHEETS_READ_FAILED',
      'harus melempar typed error',
    );
  });

  it('sheet sah-sah saja kosong TETAP rows:[] (bukan error)', async () => {
    const svc = sheetsService(emptySheetApi);
    const r = await svc.readDataTab();
    assert.deepEqual(r.rows, [], 'sheet kosong valid bukan kegagalan');
    assert.equal(r.readRows, 0);
  });
});

describe('sync saat baca gagal (M1)', () => {
  it('sync_logs FAILED, syncHashes TIDAK ditimpa, error tetap lepas', async () => {
    const store: any = { prior: JSON.stringify({ updatedAt: 't0', hashes: { 'old-uuid': 'h1' } }), hashesWritten: 0 };
    const sheets = {
      isMock: () => false,
      readDataTab: async () => { throw new SheetsReadError('Gagal membaca Google Sheets: quota exceeded'); },
    };
    const svc: any = new SyncService(sheets as any);
    svc.db = fakeDb(store);

    await assert.rejects(() => svc.run('manual'), (e: any) => e?.code === 'SHEETS_READ_FAILED');
    assert.equal(store.hashesWritten, 0, 'syncHashes tidak boleh ditulis saat baca gagal');
    assert.equal(store.logStatus, 'failed', 'sync_logs harus failed');
  });

  it('POST trigger memetakan kegagalan baca ke 502 SHEETS_READ_FAILED', async () => {
    const store: any = { prior: '', hashesWritten: 0 };
    const sheets = {
      isMock: () => false,
      readDataTab: async () => { throw new SheetsReadError('Gagal membaca Google Sheets: timeout'); },
    };
    const svc: any = new SyncService(sheets as any);
    svc.db = fakeDb(store);
    const ctl = new SyncController(svc);
    await assert.rejects(
      () => ctl.trigger(),
      (e: any) => e?.status === 502 && e?.response?.code === 'SHEETS_READ_FAILED',
      'harus 502 SHEETS_READ_FAILED',
    );
  });
});
