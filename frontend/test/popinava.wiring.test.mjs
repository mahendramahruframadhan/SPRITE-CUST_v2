// Registrasi modul POPI NAVA: menu, route, dan matriks izin (spec §4/§10).
// Test ini yang menjamin tombol tulis tersembunyi tanpa izin: RequirePerm
// memakai ROUTE_PERM + DEFAULT_PERMS, dan halaman memakai can('popinava').
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, NAV_MODULES } from '../src/config/modules.js';
import { DEFAULT_PERMS, ROUTE_PERM, menuPerm } from '../src/config/permissions.js';

describe('registrasi modul popinava', () => {
  it('menu sidebar punya entri /popinava di grup Operasional', () => {
    const menu = MODULES.find((m) => m.id === 'popinava');
    assert.ok(menu, 'entri menu popinava harus ada');
    assert.equal(menu.path, '/popinava');
    assert.ok(!menu.hide, 'menu harus terlihat di sidebar');
    const idxGroup = MODULES.findIndex((m) => m.group === 'Operasional');
    const idxMenu = MODULES.indexOf(menu);
    assert.ok(idxGroup > -1 && idxMenu > idxGroup, 'harus setelah grup Operasional');
    assert.ok(NAV_MODULES.some((m) => m.id === 'popinava'));
  });

  it('route /popinava dipetakan ke modul izin popinava', () => {
    assert.equal(ROUTE_PERM['/popinava'], 'popinava');
    assert.equal(menuPerm('popinava'), 'popinava');
  });

  it('matriks default: Super Admin & Admin CS izin 1, lainnya 0 (pola cfg, §4)', () => {
    assert.equal(DEFAULT_PERMS['Super Admin'].popinava, 1);
    assert.equal(DEFAULT_PERMS['Admin CS'].popinava, 1);
    assert.equal(DEFAULT_PERMS['Support'].popinava, 0);
    assert.equal(DEFAULT_PERMS['Finance'].popinava, 0);
    assert.equal(DEFAULT_PERMS['Viewer'].popinava, 0);
  });

  it('semua role punya kunci popinava (matrix di /roles tidak bolong)', () => {
    for (const [role, perms] of Object.entries(DEFAULT_PERMS)) {
      assert.ok('popinava' in perms, `role ${role} wajib punya kunci popinava`);
    }
  });

  it('semua route menu punya pasangan ROUTE_PERM', () => {
    for (const m of NAV_MODULES) {
      assert.ok(ROUTE_PERM[m.path], `route ${m.path} harus punya ROUTE_PERM`);
    }
  });
});
