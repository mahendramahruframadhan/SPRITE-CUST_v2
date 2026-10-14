// Guard regresi: matriks backend wajib punya modul 'analytics' (cermin
// DEFAULT_PERMS frontend) — tanpanya Finance terkunci 403 dari halaman Analitik.
// node:test murni, tanpa DB.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_PERMS } from '../src/db/init.ts';

describe('analytics perms seed', () => {
  it("ROLE_PERMS memuat modul 'analytics': Super Admin + Finance = 1", () => {
    assert.equal(ROLE_PERMS['Super Admin']?.analytics, 1);
    assert.equal(ROLE_PERMS['Finance']?.analytics, 1);
    assert.equal(ROLE_PERMS['Admin CS']?.analytics, 0);
    assert.equal(ROLE_PERMS['Support']?.analytics, 0);
    assert.equal(ROLE_PERMS['Viewer']?.analytics, 0);
  });
});
