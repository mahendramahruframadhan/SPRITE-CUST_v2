// Uji akses Super Admin pada riwayat & log POPI NAVA — node:test, pg-mem.
// Kontrak: GET /popinava/:uuid/history dan GET /popinava/logs khusus Super
// Admin (403 POPI_NAVA_HISTORY_FORBIDDEN / POPI_NAVA_LOGS_FORBIDDEN) di samping
// PermGuard popinava; log menyaring kategori 'popinava', limit di-clamp 1..500,
// q memakai placeholder terparameterisasi. Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { PopinavaController } from '../src/popinava/popinava.controller.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { PermGuard } from '../src/auth/perm.guard.ts';

const OUTLET = '11111111-1111-4111-8111-111111111111';

const reqWith = (token?: string) => ({ headers: { ...(token ? { 'x-auth-token': token } : {}) } });
const codeOf = (e: any) => e?.response?.code || e?.code;

async function tokenFor(role: string, email: string): Promise<string> {
  await seedUser(role, email);
  const r: any = await new AuthController().signIn({ email, password: 'password123' }, {});
  return r.token as string;
}

describe('popinava: riwayat & log khusus Super Admin', () => {
  let saToken: string;
  let csToken: string;
  let ctl: PopinavaController;

  before(async () => {
    setupTables();
    saToken = await tokenFor('Super Admin', 'pi-hist-sa@revota.id');
    csToken = await tokenFor('Admin CS', 'pi-hist-cs@revota.id');
    ctl = new PopinavaController();
    await db().execute(
      `INSERT INTO activity_logs (id, who, action, category, detail, record_uuid, created_at) VALUES
       ('l-pi-1','IT Integrasi','Tambah outlet','popinava','Toko A','${OUTLET}','2026-01-03T10:00:00.000Z'),
       ('l-pi-2','IT Integrasi','Ubah outlet','popinava','Toko B','22222222-2222-4222-8222-222222222222','2026-01-02T10:00:00.000Z'),
       ('l-pi-3','Sistem','Menambah kasus','Penambahan','Kasus B','case-1','2026-01-04T10:00:00.000Z')` as any,
    );
  });

  it('history: Super Admin → riwayat per outlet; Admin CS → 403', async () => {
    const h: any = await ctl.history(OUTLET, reqWith(saToken));
    assert.equal(h.length, 1, 'hanya log outlet itu');
    assert.equal(h[0].action, 'Tambah outlet');
    assert.equal(h[0].category, 'popinava');
    await assert.rejects(
      () => ctl.history(OUTLET, reqWith(csToken)),
      (e: any) => codeOf(e) === 'POPI_NAVA_HISTORY_FORBIDDEN',
      'Admin CS (izin popinava=1) tetap ditolak di level API',
    );
  });

  it('logs: Super Admin → hanya kategori popinava, terbaru di atas', async () => {
    const rows: any = await ctl.logs(undefined, undefined, reqWith(saToken));
    assert.ok(rows.length >= 2, 'minimal dua baris popinava');
    assert.ok(rows.every((r: any) => r.category === 'popinava'), 'kategori non-popinava tak boleh bocor');
    assert.ok(!rows.some((r: any) => r.action === 'Menambah kasus'), 'log kasus tidak ikut');
    assert.equal(rows[0].action, 'Tambah outlet', 'terbaru (2026-01-03) di atas 01-02');
    assert.ok(rows.every((r: any) => r.who && r.action && r.time), 'tiap baris punya who/action/time');
  });

  it('logs: limit di-clamp 1..500 (default 200)', async () => {
    const one: any = await ctl.logs('1', undefined, reqWith(saToken));
    assert.equal(one.length, 1, 'limit=1 → satu baris terbaru');
    const clamped: any = await ctl.logs('99999', undefined, reqWith(saToken));
    assert.ok(clamped.length <= 500, 'limit di atas 500 tidak dipakai mentah');
    const garbage: any = await ctl.logs('bukan-angka', undefined, reqWith(saToken));
    assert.ok(Array.isArray(garbage) && garbage.length >= 2, 'limit rusak → default 200 tetap jalan');
  });

  it('logs: q menyaring action/detail/who tanpa injeksi SQL', async () => {
    const hit: any = await ctl.logs(undefined, 'TOKO a', reqWith(saToken));
    assert.ok(hit.length >= 1 && hit.every((r: any) => r.category === 'popinava'), 'q case-insensitive menemukan Toko A');
    assert.ok(!hit.some((r: any) => r.action === 'Menambah kasus'));
    const miss: any = await ctl.logs(undefined, 'tidak-ada-cocok', reqWith(saToken));
    assert.equal(miss.length, 0, 'q tanpa cocok → kosong');
    // Input berbahaya dipadam (wildcard dibuang), bukan dieksekusi.
    const evil: any = await ctl.logs(undefined, `'; DROP TABLE activity_logs;--`, reqWith(saToken));
    assert.equal(evil.length, 0, 'payload SQL tidak cocok apa pun');
    const count: any = await db().execute(`SELECT COUNT(*) as c FROM activity_logs` as any);
    assert.ok(Number((count.rows || count)[0].c) >= 3, 'tabel activity_logs utuh');
  });

  it('logs: Admin CS → 403 POPI_NAVA_LOGS_FORBIDDEN', async () => {
    await assert.rejects(
      () => ctl.logs(undefined, undefined, reqWith(csToken)),
      (e: any) => codeOf(e) === 'POPI_NAVA_LOGS_FORBIDDEN',
    );
    await assert.rejects(
      () => ctl.logs(undefined, undefined, reqWith()),
      (e: any) => codeOf(e) === 'POPI_NAVA_LOGS_FORBIDDEN',
      'tanpa sesi pun ditolak (403, PermGuard-nya sendiri tetap 401 untuk sesi hilang)',
    );
  });

  it('metadata: logs dijaga PermGuard + @Perm popinava, dan terdaftar sebelum :uuid', () => {
    const proto: any = PopinavaController.prototype;
    assert.equal(Reflect.getMetadata('permModule', proto.logs), 'popinava', 'logs wajib @Perm("popinava")');
    const methodGuards: any[] = Reflect.getMetadata('__guards__', proto.logs) || [];
    assert.ok(methodGuards.includes(PermGuard), 'logs wajib PermGuard di method');
    // Urutan deklarasi menentukan kecocokan rute Nest: 'logs' harus menang
    // sebelum @Get(':uuid') menangkapnya sebagai uuid.
    const names = Object.getOwnPropertyNames(proto);
    assert.ok(names.indexOf('logs') < names.indexOf('getById'), "'logs' harus dideklarasi sebelum getById");
    assert.equal(Reflect.getMetadata('path', proto.logs), 'logs');
    assert.equal(Reflect.getMetadata('path', proto.getById), ':uuid');
  });
});
