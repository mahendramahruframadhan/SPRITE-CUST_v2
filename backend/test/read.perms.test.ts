// Uji M-3 (review): read-perm per modul pada GET yang datanya sensitif,
// ditambah filter respons GET /users.
// Prinsipnya sama dengan matriks tulis di init.ts — UI memang meng-gate route
// dengan RequirePerm, tapi server juga harus menegakkan; tanpa ini role mana
// pun (API-level) bisa membaca tagihan, daftar pengguna, log, dsb.
// Endpoint yang SENGAJA tetap sesi-saja (alasan terdata di laporan review):
//   - roles/permissions: alur login (usePermissions semua role)
//   - cases / brand-status / config/status-options / sync logs: Dashboard
//     semua role (Finance cases=0)
//   - ai connections: AiChat global di AppLayout, output tanpa key
//   - config/ai GET: output ter-mask, by design (lihat controller)
// node:test bawaan; jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { PermGuard } from '../src/auth/perm.guard.ts';
import { RolesController } from '../src/roles/roles.controller.ts';
import { BillingController } from '../src/billing/billing.controller.ts';
import { ClientsController } from '../src/clients/clients.controller.ts';
import { MastersController } from '../src/masters/masters.controller.ts';
import { PdfController } from '../src/pdf/pdf.controller.ts';
import { ConfigController } from '../src/config/config.controller.ts';
import { PopinavaController } from '../src/popinava/popinava.controller.ts';
import { AuditScheduleController } from '../src/popinava/audit-schedule.controller.ts';
import { CasesController } from '../src/cases/cases.controller.ts';
import { SyncController } from '../src/sync/sync.controller.ts';
import { AiController } from '../src/ai/ai.controller.ts';
import { AiConfigController } from '../src/config/ai-config.controller.ts';

// [controller, method, perm yang diwajibkan]
const MUST_GATE: [any, string, string][] = [
  [RolesController, 'logs', 'logs'],
  [BillingController, 'stats', 'billing'],
  [BillingController, 'invoiceMap', 'billing'],
  [BillingController, 'auditMap', 'billing'],
  [ClientsController, 'listClients', 'clients'],
  [MastersController, 'all', 'form'],
  [PdfController, 'byCase', 'finance'],
  [PdfController, 'state', 'finance'],
  [PdfController, 'history', 'finance'],
  [ConfigController, 'get', 'cfg'],
  [PopinavaController, 'list', 'popinava'],
  [PopinavaController, 'getById', 'popinava'],
  [PopinavaController, 'history', 'popinava'],
  [AuditScheduleController, 'get', 'popinava'],
];

// [controller, method] yang wajib TANPA permModule (tetap sesi-saja)
const MUST_STAY_OPEN: [any, string][] = [
  [RolesController, 'getPerms'], // alur login frontend
  [CasesController, 'list'], // Dashboard semua role
  [ClientsController, 'listStatuses'], // Dashboard brand status
  [ConfigController, 'statusOptions'], // hook Dashboard
  [SyncController, 'logs'], // Dashboard sync log
  [AiController, 'connections'], // AiChat global, tanpa key
  [AiConfigController, 'get'], // ter-mask, by design
];

const guardsOf = (C: any, m: string): any[] => [
  ...(Reflect.getMetadata('__guards__', C) || []),
  ...(Reflect.getMetadata('__guards__', C.prototype[m]) || []),
];

describe('M-3 read-perm per modul pada GET', () => {
  it('route sensitif membawa PermGuard + @Perm(modul) yang benar', () => {
    for (const [C, m, perm] of MUST_GATE) {
      const proto = C.prototype;
      assert.equal(
        Reflect.getMetadata('permModule', proto[m]),
        perm,
        `${C.name}.${m} harus membawa @Perm('${perm}')`,
      );
      assert.ok(
        guardsOf(C, m).includes(PermGuard),
        `${C.name}.${m} harus dijaga PermGuard`,
      );
    }
  });

  it('endpoint sesi-saja TIDAK ikut terkunci (regresi login/Dashboard/AI)', () => {
    for (const [C, m] of MUST_STAY_OPEN) {
      assert.equal(
        Reflect.getMetadata('permModule', C.prototype[m]),
        undefined,
        `${C.name}.${m} seharusnya tetap sesi-saja`,
      );
    }
  });
});

describe('M-3 GET /users: daftar lengkap hanya untuk role berizin roles', () => {
  before(() => {
    setupTables();
  });

  const signIn = async (role: string, email: string) => {
    await seedUser(role, email);
    const ctl = new AuthController();
    const r: any = await ctl.signIn({ email, password: 'password123' }, {});
    return r.token;
  };
  const reqWith = (token: string) => ({ headers: { 'x-auth-token': token } });

  it('Super Admin → daftar lengkap; Support (roles=0) → hanya baris sendiri; di-grant → lengkap', async () => {
    const ctl = new RolesController();
    const saToken = await signIn('Super Admin', 'sa-m3@revota.id');
    const supEmail = 'sup-m3@revota.id';
    const supToken = await signIn('Support', supEmail);

    await db().execute(`DELETE FROM role_permissions` as any);
    await db().execute(`INSERT INTO role_permissions (role,module,allowed) VALUES ('Support','roles',0)` as any);

    const asSa = await ctl.users(reqWith(saToken));
    assert.ok(asSa.length >= 2, 'Super Admin harus melihat semua pengguna');

    const asSup = await ctl.users(reqWith(supToken));
    assert.equal(asSup.length, 1, 'Support tanpa izin roles hanya boleh melihat dirinya sendiri');
    assert.equal(asSup[0].email, supEmail, 'baris yang diterima harus akun sendiri');

    await db().execute(`UPDATE role_permissions SET allowed=1 WHERE role='Support' AND module='roles'` as any);
    const asSupGranted = await ctl.users(reqWith(supToken));
    assert.ok(asSupGranted.length >= 2, 'setelah izin roles diberikan, daftar lengkap kembali terbuka');
  });
});
