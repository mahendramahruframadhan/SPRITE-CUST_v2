// Uji M-4 (review): POST /roles/logs harus membawa PermGuard @Perm('logs').
// Tanpa guard, endpoint menulis aktivitas oleh CLIENT (self-attribution):
// role mana pun bisa menyuntik baris log palsu atas namanya sendiri dengan
// action/category/detail bebas. Dengan @Perm('logs'): hanya role berizin
// modul logs (matriks default: SA/Admin CS/Finance) yang lolos; Support/Viewer
// ditolak (pemanggil Settings pakai .catch() sehingga UI tak patah).
// logActivity server-side (billing dsb.) tidak lewat endpoint ini — tak terdampak.
// node:test bawaan; jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { PermGuard } from '../src/auth/perm.guard.ts';
import { SessionGuard } from '../src/auth/session.guard.ts';
import { RolesController } from '../src/roles/roles.controller.ts';

const reqWith = (token?: string) => ({
  headers: { ...(token ? { 'x-auth-token': token } : {}) },
});
const guardCtx = (req: any) => ({
  getHandler: () => (RolesController.prototype as any).addLog,
  getClass: () => RolesController,
  switchToHttp: () => ({ getRequest: () => req }),
});

// Simulasi pipeline guard persis urutan Nest: guard kelas dulu, lalu guard
// method. refector membaca metadata dari handler method addLog.
const runAddLogPipeline = async (req: any) => {
  const proto = RolesController.prototype as any;
  const clsGuards: any[] = Reflect.getMetadata('__guards__', RolesController) || [];
  const methGuards: any[] = Reflect.getMetadata('__guards__', proto.addLog) || [];
  const reflector = { getAllAndOverride: (_k: string) => Reflect.getMetadata('permModule', proto.addLog) };
  const permResults: boolean[] = [];
  for (const G of [...clsGuards, ...methGuards]) {
    const g = new G(reflector);
    const r = await g.canActivate(guardCtx(req));
    if (G === PermGuard) permResults.push(r);
  }
  return { sawPermGuard: methGuards.includes(PermGuard), permResults };
};

describe('M-4 POST /roles/logs dijaga izin logs', () => {
  before(() => {
    setupTables();
  });

  it('membawa PermGuard + @Perm("logs") pada method addLog', () => {
    const proto = RolesController.prototype as any;
    assert.equal(
      Reflect.getMetadata('permModule', proto.addLog),
      'logs',
      'addLog harus membawa @Perm("logs")',
    );
    const methGuards: any[] = Reflect.getMetadata('__guards__', proto.addLog) || [];
    assert.ok(methGuards.includes(PermGuard), 'addLog harus memakai PermGuard di method');
  });

  it('pipeline: Support (logs=0) ditolak, Finance (logs=1) lolos, Super Admin lolos', async () => {
    await db().execute(`DELETE FROM role_permissions` as any);
    await db().execute(`INSERT INTO role_permissions (role,module,allowed) VALUES ('Support','logs',0),('Finance','logs',1)` as any);

    const signIn = async (role: string, email: string) => {
      await seedUser(role, email);
      const ctl = new AuthController();
      const r: any = await ctl.signIn({ email, password: 'password123' }, {});
      return r.token;
    };
    const supToken = await signIn('Support', 'sup-m4@revota.id');
    const finToken = await signIn('Finance', 'fin-m4@revota.id');
    const saToken = await signIn('Super Admin', 'sa-m4@revota.id');

    const sup = await runAddLogPipeline(reqWith(supToken));
    assert.equal(sup.sawPermGuard, true, 'pipeline addLog harus memuat PermGuard');
    assert.deepEqual(sup.permResults, [false], 'Support tanpa izin logs harus ditolak');

    const fin = await runAddLogPipeline(reqWith(finToken));
    assert.deepEqual(fin.permResults, [true], 'Finance dengan izin logs harus lolos');

    const sa = await runAddLogPipeline(reqWith(saToken));
    assert.deepEqual(sa.permResults, [true], 'Super Admin selalu lolos');
  });
});
