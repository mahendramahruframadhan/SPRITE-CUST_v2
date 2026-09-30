import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Controller, Get, Post, Body } from '@nestjs/common';
import 'reflect-metadata';

// M8 — kontrak: SETIAP route butuh guard sesi/izin, kecuali allowlist publik.
// Guard metadata: class-level @UseGuards atau method-level. PermGuard juga
// menegakkan sesi (tanpa token → 401, terbukti di auth.session.test).
const GUARDS = '__guards__', PATH = 'path', METHOD = 'method';

const controllers: [string, any][] = [
  ['Health', require('../src/health.controller').HealthController],
  ['Cases', require('../src/cases/cases.controller').CasesController],
  ['Sync', require('../src/sync/sync.controller').SyncController],
  ['Billing', require('../src/billing/billing.controller').BillingController],
  ['Config', require('../src/config/config.controller').ConfigController],
  ['AiConfig', require('../src/config/ai-config.controller').AiConfigController],
  ['Masters', require('../src/masters/masters.controller').MastersController],
  ['Auth', require('../src/auth/auth.controller').AuthController],
  ['Setup', require('../src/setup/setup.controller').SetupController],
  ['Roles', require('../src/roles/roles.controller').RolesController],
  ['Ai', require('../src/ai/ai.controller').AiController],
  ['Pdf', require('../src/pdf/pdf.controller').PdfController],
  ['Clients', require('../src/clients/clients.controller').ClientsController],
  ['Popinava', require('../src/popinava/popinava.controller').PopinavaController],
];

// Allowlist publik — endpoint yang MEMANG tanpa sesi (by design).
const PUBLIC_ROUTES = new Set([
  'Health.health', 'Health.root',
  'Auth.signUp', 'Auth.signIn', 'Auth.signOut', 'Auth.session',
  'Setup.status', 'Setup.firstAdmin',
]);

function routesOf(name: string, C: any) {
  const classGuards: string[] = (Reflect.getMetadata(GUARDS, C) || []).map((g: any) => g?.name);
  const out: { id: string; guards: string[] }[] = [];
  const proto = C.prototype;
  for (const k of Object.getOwnPropertyNames(proto)) {
    if (k === 'constructor') continue;
    const d = Object.getOwnPropertyDescriptor(proto, k);
    if (typeof d?.value !== 'function') continue;
    if (!Reflect.getMetadata(PATH, proto[k])) continue;
    const methGuards: string[] = (Reflect.getMetadata(GUARDS, proto[k]) || []).map((g: any) => g?.name);
    out.push({ id: `${name}.${k}`, guards: [...classGuards, ...methGuards] });
  }
  return out;
}

describe('Imp#4 kontrak auth seluruh endpoint (M8)', () => {
  it('semua route: punya SessionGuard/PermGuard ATAU ada di allowlist publik', () => {
    const unguarded: string[] = [];
    const publicSeen: string[] = [];
    for (const [name, C] of controllers) {
      for (const r of routesOf(name, C)) {
        const ok = r.guards.includes('SessionGuard') || r.guards.includes('PermGuard');
        if (ok) continue;
        if (PUBLIC_ROUTES.has(r.id)) publicSeen.push(r.id);
        else unguarded.push(r.id);
      }
    }
    assert.deepEqual(unguarded, [], `route tanpa guard sesi: ${unguarded.join(', ')}`);
    // allowlist harus ketat: semua entri publik memang ada route-nya
    assert.deepEqual(
      [...publicSeen].sort(),
      [...PUBLIC_ROUTES].sort(),
      'allowlist publik tidak sinkron dengan route yang benar-benar publik',
    );
  });

  it('sweep TIDAK vaktif — dummy controller tanpa guard terdeteksi', () => {
    @Controller('dummy-contract')
    class DummyController {
      @Post('open')
      open(@Body() b: any) { return b; }
    }
    const found = routesOf('Dummy', DummyController);
    assert.equal(found.length, 1, 'dummy harus punya 1 route');
    const ok = found[0].guards.includes('SessionGuard') || found[0].guards.includes('PermGuard');
    assert.equal(ok, false, 'route dummy tanpa guard harus dianggap unguarded');
    assert.equal(PUBLIC_ROUTES.has('Dummy.open'), false, 'dummy tidak boleh ada di allowlist');
  });
});
