// mergeServerRows: saat probe server sukses, server = sumber kebenaran TAPI
// baris yang hanya ada lokal (dibuat/diedit saat offline) tidak boleh ditelan.
// Seed bawaan (fallback offline) tetap dibuang agar mode server tidak pernah
// memaksakan seed saat server kosong. Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeServerRows } from '../src/lib/popinavaRecord.js';

const seedA = { uuid: 'seed-a', brandName: 'HAPPY GO LUCKY', city: 'Jakarta', status: 'active', createdAt: 't-load', updatedAt: 't-load' };
const seedB = { uuid: 'seed-b', brandName: 'MARUBOX', city: 'Bandung', status: 'active', createdAt: 't-load', updatedAt: 't-load' };
const seeds = [seedA, seedB];
const srv = { uuid: 'srv-1', brandName: 'MARUBOX', city: 'Depok' };

describe('mergeServerRows', () => {
  it('server kosong + seed pristine → hasil kosong (seed tidak dipaksa)', () => {
    // buildSeed() memakai nowIso() baru tiap dipanggil: timestamp berbeda
    // antara saat load dan saat probe BUKAN editan user.
    const localAtLoad = [seedA, seedB];
    const seedAtProbe = [
      { ...seedA, createdAt: 't-probe', updatedAt: 't-probe' },
      { ...seedB, createdAt: 't-probe', updatedAt: 't-probe' },
    ];
    assert.deepEqual(mergeServerRows(localAtLoad, [], seedAtProbe), []);
  });

  it('server kosong + seed + baris buatan offline → hanya baris offline yang bertahan', () => {
    const offline = { uuid: 'off-1', brandName: 'BRAND X', city: 'Depok' };
    assert.deepEqual(mergeServerRows([seedA, offline, seedB], [], seeds), [offline]);
  });

  it('baris server menang atas salinan lokal yang sama (tanpa duplikat)', () => {
    const localSame = { uuid: 'srv-1', brandName: 'MARUBOX', city: 'Bekasi' };
    assert.deepEqual(mergeServerRows([localSame, seedA], [srv], seeds), [srv]);
  });

  it('edit lokal atas baris server → versi server dipakai, lokal tidak diduplikasi', () => {
    const editedLocal = { ...srv, city: 'Edited Offline' };
    assert.deepEqual(mergeServerRows([editedLocal, seedA], [srv], seeds), [srv]);
  });

  it('seed yang diedit user saat offline → dipertahankan (bukan seed pristine)', () => {
    const editedSeed = { ...seedA, city: 'Surabaya' };
    assert.deepEqual(mergeServerRows([editedSeed, seedB], [], seeds), [editedSeed]);
  });
});
