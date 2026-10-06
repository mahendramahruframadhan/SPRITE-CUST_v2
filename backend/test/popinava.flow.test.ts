// Uji endpoint /api/popinava + activity logs — node:test bawaan, pg-mem.
// Kontrak: spec §9 (POST/PATCH/DELETE/bulk/list/get) + validasi otoritatif
// server + audit log kategori 'popinava'. Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { PopinavaController } from '../src/popinava/popinava.controller.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { esc } from '../src/db/sql.ts';

const OUTLET = {
  uuid: '11111111-1111-4111-8111-111111111111',
  brand_name: 'HAPPY GO LUCKY',
  rvt_custcode: 'RVT-HGL',
  dept_code: '10000001',
  dept_name: 'SHOP',
  dept_channel_name: 'Toko Pusat',
  dept_reference: '-',
  iso_code: 'ID-JB',
  address: 'Jl. Merdeka 1',
  city: 'Bekasi',
  province: 'JAWA BARAT',
  postcode: '17111',
  country: 'INDONESIA',
  area: 'JAWA',
  region: 'JAWA BARAT',
  email: '-',
  notes: '-',
  created_at: '2026-01-01 00:00:00',
  status: 'active',
};

async function superToken() {
  const ctl = new AuthController();
  const r: any = await ctl.signIn({ email: 'popisa@revota.id', password: 'password123' }, {});
  return r.token as string;
}
const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

async function lastLog(actionLike: string) {
  const r: any = await db().execute(
    `SELECT who, action, category, detail, record_uuid FROM activity_logs WHERE action LIKE '%${esc(actionLike)}%' ORDER BY created_at DESC LIMIT 1` as any,
  );
  return (r.rows || r)[0];
}

describe('popinava endpoint + activity logs', () => {
  let token: string;
  let ctl: PopinavaController;

  before(async () => {
    setupTables();
    await seedUser('Super Admin', 'popisa@revota.id');
    token = await superToken();
    ctl = new PopinavaController();
  });

  it('POST create → 201 baris tersimpan + activity log kategori popinava', async () => {
    const created: any = await ctl.create({ ...OUTLET }, reqWith(token));
    assert.equal(created.uuid, OUTLET.uuid);
    assert.equal(created.brand_name, 'HAPPY GO LUCKY');
    const log = await lastLog('Tambah outlet');
    assert.ok(log, 'activity log Tambah outlet harus tertulis');
    assert.equal(log.category, 'popinava');
    assert.equal(log.record_uuid, OUTLET.uuid);
    assert.notEqual(log.who, 'system', 'pelaku harus dari sesi, bukan system');
  });

  it('POST dengan dept_code bukan 8 digit → VALIDATION_FAILED', async () => {
    await assert.rejects(
      () => ctl.create({ ...OUTLET, uuid: '22222222-2222-4222-8222-222222222222', dept_code: '1234' }, reqWith(token)),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED' && String(e.response.message).includes('dept_code'),
    );
  });

  it('POST uuid duplikat → DUPLICATE_UUID', async () => {
    await assert.rejects(
      () => ctl.create({ ...OUTLET }, reqWith(token)),
      (e: any) => e?.response?.code === 'DUPLICATE_UUID',
    );
  });

  it('GET list → items/total/page/pageSize + facets; search, filter, sort, pagination', async () => {
    await ctl.create(
      { ...OUTLET, uuid: '33333333-3333-4333-8333-333333333333', brand_name: 'MAYOUTFIT', rvt_custcode: 'RVT-MYF', city: 'Jakarta', address: 'Jl. Sudirman 9', dept_code: '10000002' },
      reqWith(token),
    );
    const all: any = await ctl.list({ page: '1', pageSize: '50' } as any);
    assert.ok(Array.isArray(all.items));
    assert.equal(all.total, 2);
    assert.equal(all.page, 1);
    assert.ok(all.facets.brands.includes('HAPPY GO LUCKY'));
    assert.ok(all.facets.cities.includes('Bekasi'));
    assert.ok(all.facets.statuses.includes('active'));

    const filtered: any = await ctl.list({ brand: 'MAYOUTFIT' } as any);
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].brand_name, 'MAYOUTFIT');

    const searched: any = await ctl.list({ search: 'Merdeka' } as any);
    assert.equal(searched.total, 1, 'search menemukan alamat Jl. Merdeka 1');

    const sorted: any = await ctl.list({ sort: 'brand_name:desc' } as any);
    assert.equal(sorted.items[0].brand_name, 'MAYOUTFIT');

    const paged: any = await ctl.list({ page: '1', pageSize: '1' } as any);
    assert.equal(paged.items.length, 1);
    assert.equal(paged.total, 2);
    assert.equal(paged.pageSize, 1);
  });

  it('GET /:uuid → baris; tidak ada → NOT_FOUND', async () => {
    const row: any = await ctl.getById(OUTLET.uuid);
    assert.equal(row.rvt_custcode, 'RVT-HGL');
    await assert.rejects(() => ctl.getById('99999999-9999-4999-8999-999999999999'), (e: any) => e?.response?.code === 'NOT_FOUND');
  });

  it('PATCH → terupdate + activity log; uuid tak ada → NOT_FOUND', async () => {
    const upd: any = await ctl.update(OUTLET.uuid, { city: 'Depok', status: 'inactive' }, reqWith(token));
    assert.equal(upd.city, 'Depok');
    assert.equal(upd.status, 'inactive');
    const log = await lastLog('Ubah outlet');
    assert.ok(log, 'activity log Ubah outlet harus tertulis');
    assert.equal(log.record_uuid, OUTLET.uuid);
    await assert.rejects(
      () => ctl.update('99999999-9999-4999-8999-999999999999', { city: 'X' }, reqWith(token)),
      (e: any) => e?.response?.code === 'NOT_FOUND',
    );
  });

  it('DELETE → 204 + activity log; uuid tak ada → NOT_FOUND', async () => {
    const gone = await ctl.remove('33333333-3333-4333-8333-333333333333', reqWith(token));
    assert.equal(gone, undefined, 'DELETE mengembalikan 204 tanpa body');
    const log = await lastLog('Hapus outlet');
    assert.ok(log, 'activity log Hapus outlet harus tertulis');
    assert.equal(log.record_uuid, '33333333-3333-4333-8333-333333333333');
    await assert.rejects(
      () => ctl.remove('99999999-9999-4999-8999-999999999999', reqWith(token)),
      (e: any) => e?.response?.code === 'NOT_FOUND',
    );
  });

  it('POST /bulk set-status → affected + log per outlet (aksi/uuids tak valid → VALIDATION_FAILED)', async () => {
    const r: any = await ctl.bulk({ action: 'set-status', uuids: [OUTLET.uuid], status: 'active' }, reqWith(token));
    assert.equal(r.affected, 1);
    const log = await lastLog('Aktifkan outlet');
    assert.ok(log, 'activity log per outlet tertulis');
    assert.equal(log.category, 'popinava');
    assert.equal(log.record_uuid, OUTLET.uuid, 'log membawa uuid outlet (filter riwayat)');

    await assert.rejects(
      () => ctl.bulk({ action: 'explode', uuids: [OUTLET.uuid] }, reqWith(token)),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED',
    );
    await assert.rejects(
      () => ctl.bulk({ action: 'delete', uuids: Array.from({ length: 1001 }, (_, i) => `u-${i}`) }, reqWith(token)),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED',
    );
  });

  it('bulk set-status inactive → log "Nonaktifkan outlet" per baris: pelaku sesi + transisi status', async () => {
    const r: any = await ctl.bulk({ action: 'set-status', uuids: [OUTLET.uuid], status: 'inactive' }, reqWith(token));
    assert.equal(r.affected, 1);
    const log = await lastLog('Nonaktifkan outlet');
    assert.ok(log, 'log Nonaktifkan outlet tertulis');
    assert.equal(log.record_uuid, OUTLET.uuid);
    assert.equal(log.category, 'popinava');
    assert.notEqual(log.who, 'system', 'pelaku harus dari sesi, bukan system');
    assert.match(String(log.detail), /active → inactive/, 'detail membawa transisi status');
  });

  it('GET :uuid/history → riwayat outlet terurut (kapan & siapa, tanpa log outlet lain)', async () => {
    // Lapisan kedua endpoint ini (khusus Super Admin) diuji terpisah di
    // popinava.history.logs.test.ts; di sini alur normal dengan Super Admin.
    const h: any = await ctl.history(OUTLET.uuid, reqWith(token));
    assert.ok(Array.isArray(h) && h.length >= 2, 'entri minimal create + set-status');
    assert.ok(h.some((x: any) => x.action === 'Tambah outlet'));
    assert.ok(h.some((x: any) => x.action === 'Nonaktifkan outlet'));
    assert.ok(h.every((x: any) => x.who && x.action && x.time), 'tiap entri punya who/action/time');
    const other: any = await ctl.history('99999999-9999-4999-8999-999999999999', reqWith(token));
    assert.equal(other.length, 0, 'uuid tanpa riwayat → kosong');
  });

  it('semua method tulis membawa metadata permModule = popinava', () => {
    const proto: any = PopinavaController.prototype;
    for (const m of ['create', 'update', 'remove', 'bulk']) {
      assert.equal(Reflect.getMetadata('permModule', proto[m]), m === 'remove' ? 'popinava' : 'popinava', `${m} harus dijaga @Perm('popinava')`);
    }
  });
});
