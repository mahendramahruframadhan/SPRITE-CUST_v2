// Uji endpoint /api/audit-schedule (jadwal audit per bulan) — node:test, pg-mem.
// Kontrak: GET {month,weeks} terbuka untuk sesi login; PUT upsert dijaga
// @Perm('popinava') + validasi month/weeks; activity log kategori popinava;
// guard: 401 tanpa sesi, 403 role tanpa izin popinava. Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuditScheduleController } from '../src/popinava/audit-schedule.controller.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { PermGuard } from '../src/auth/perm.guard.ts';
import { Reflector } from '@nestjs/core';

async function tokenFor(email: string) {
  const ctl = new AuthController();
  const r: any = await ctl.signIn({ email, password: 'password123' }, {});
  return r.token as string;
}
const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

const OUTLET_ITEM = {
  id: 'i-1',
  type: 'outlet',
  uuid: '11111111-1111-4111-8111-111111111111',
  brand: 'HAPPY GO LUCKY',
  name: 'Toko Pusat',
};
const BRAND_ITEM = { id: 'i-5', type: 'brand', brand: 'MAYOUTFIT' };

async function lastLog(actionLike: string) {
  const r: any = await db().execute(
    `SELECT who, action, category, detail FROM activity_logs WHERE action LIKE '%${actionLike}%' ORDER BY created_at DESC LIMIT 1` as any,
  );
  return (r.rows || r)[0];
}

function permCtx(handler: any) {
  return {
    getHandler: () => handler,
    getClass: () => AuditScheduleController,
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
  } as any;
}

describe('audit-schedule endpoint', () => {
  let superToken: string;
  let ctl: AuditScheduleController;

  before(async () => {
    setupTables();
    await seedUser('Super Admin', 'jisa@revota.id');
    await seedUser('Viewer', 'viewer@revota.id');
    superToken = await tokenFor('jisa@revota.id');
    ctl = new AuditScheduleController();
  });

  it('GET bulan baru → {month, weeks} kosong W1..W5', async () => {
    const r: any = await ctl.get('2026-12');
    assert.equal(r.month, '2026-12');
    assert.deepEqual(r.weeks, { W1: [], W2: [], W3: [], W4: [], W5: [] });
  });

  it('GET month format salah (bukan YYYY-MM / bulan 13) → VALIDATION_FAILED', async () => {
    await assert.rejects(
      () => ctl.get('Desember 2026' as any),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED' && e?.getStatus?.() === 400,
    );
    await assert.rejects(
      () => ctl.get('2026-13' as any),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED',
    );
  });

  it('PUT upsert → GET roundtrip s/d W5 + activity log kategori popinava + baris tunggal', async () => {
    const weeks = { W1: [OUTLET_ITEM], W2: [], W3: [], W4: [], W5: [BRAND_ITEM] };
    const saved: any = await ctl.put({ month: '2026-10', weeks }, reqWith(superToken));
    assert.equal(saved.ok, true);
    assert.equal(saved.month, '2026-10');

    const back: any = await ctl.get('2026-10');
    assert.deepEqual(back.weeks, weeks, 'roundtrip W1..W5 termasuk W5 utuh');

    const log = await lastLog('Simpan jadwal audit');
    assert.ok(log, 'activity log Simpan jadwal audit harus tertulis');
    assert.equal(log.category, 'popinava');
    assert.notEqual(log.who, 'system', 'pelaku harus dari sesi, bukan system');

    await ctl.put({ month: '2026-10', weeks: { ...weeks, W2: [OUTLET_ITEM] } }, reqWith(superToken));
    const count: any = await db().pq(`SELECT COUNT(*) as c FROM audit_schedule WHERE month='2026-10'`, []);
    assert.equal(Number((count.rows || count)[0]?.c), 1, 'PUT ulang bulan sama = upsert, bukan baris baru');
    const again: any = await ctl.get('2026-10');
    assert.equal(again.weeks.W2.length, 1, 'data terbaru yang menang');
  });

  it('PUT weeks tidak valid → VALIDATION_FAILED; key di luar W1..W5 diabaikan', async () => {
    await assert.rejects(
      () => ctl.put({ month: '2026-11', weeks: { W1: 'bukan-array' } }, reqWith(superToken)),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED',
    );
    await assert.rejects(
      () => ctl.put({ month: '2026-11', weeks: { W1: [null] } }, reqWith(superToken)),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED',
    );
    await assert.rejects(
      () => ctl.put({ month: '2026-11' } as any, reqWith(superToken)),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED',
      'weeks wajib diisi',
    );
    await assert.rejects(
      () =>
        ctl.put(
          { month: '2026-11', weeks: { W1: Array.from({ length: 20001 }, (_, i) => ({ id: `x${i}` })) } },
          reqWith(superToken),
        ),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED',
      'total item dibatasi',
    );
    await assert.rejects(
      () => ctl.put({ month: '13-2026', weeks: { W1: [] } }, reqWith(superToken)),
      (e: any) => e?.response?.code === 'VALIDATION_FAILED',
    );

    const cleared: any = await ctl.put({ month: '2027-01', weeks: {} }, reqWith(superToken));
    assert.deepEqual(cleared.weeks, { W1: [], W2: [], W3: [], W4: [], W5: [] }, 'weeks {} sah = kosongkan bulan');

    const saved: any = await ctl.put(
      { month: '2026-11', weeks: { W1: [OUTLET_ITEM], W6: [BRAND_ITEM] } },
      reqWith(superToken),
    );
    assert.ok(!('W6' in saved.weeks), 'key di luar W1..W5 tidak disimpan');
    assert.equal(saved.weeks.W1.length, 1);
  });

  it('guard: PUT membawa permModule popinava + kelas ber-SessionGuard', () => {
    const proto: any = AuditScheduleController.prototype;
    assert.equal(Reflect.getMetadata('permModule', proto.put), 'popinava', 'PUT harus dijaga @Perm(\'popinava\')');
    const guards: any[] = Reflect.getMetadata('__guards__', AuditScheduleController) || [];
    assert.ok(guards.length, 'controller harus ber-guard kelas (SessionGuard)');
  });

  it('PermGuard: tanpa sesi → 401; role Viewer tanpa izin popinava → 403', async () => {
    const g = new PermGuard(new Reflector());
    await assert.rejects(
      () => g.canActivate(permCtx(AuditScheduleController.prototype.put)),
      (e: any) => e?.status === 401 || e?.response?.code === 'SESSION_EXPIRED',
      'tanpa token → 401 SESSION_EXPIRED',
    );
    const viewerToken = await tokenFor('viewer@revota.id');
    const ok = await g.canActivate({
      ...permCtx(AuditScheduleController.prototype.put),
      switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-auth-token': viewerToken } }) }),
    } as any);
    assert.equal(ok, false, 'Viewer tanpa izin modul popinava → false (403)');
  });
});
