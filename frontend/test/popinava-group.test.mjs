// grouping view PopiNava (kategori brand): helper murni groupRowsByBrand.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupRowsByBrand } from '../src/lib/popinavaGroup.js';

const row = (uuid, brandName, city = 'BANDUNG') => ({ uuid, brandName, city, deptChannelName: `ch-${uuid}` });

describe('groupRowsByBrand', () => {
  it('mengelompokkan per brand dengan urutan grup A→Z', () => {
    const groups = groupRowsByBrand([
      row('u1', 'MAYOUTFIT'),
      row('u2', 'AMIMI'),
      row('u3', 'MAYOUTFIT'),
      row('u4', 'AMIMI'),
    ]);
    assert.deepEqual(groups.map((g) => g.brand), ['AMIMI', 'MAYOUTFIT']);
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[1].items.length, 2);
    assert.deepEqual(groups[1].ids, ['u1', 'u3'], 'ids sinkron dengan items');
  });

  it('urutan dalam grup mengikuti urutan input (sort aktif dari hook)', () => {
    const groups = groupRowsByBrand([
      row('a', 'X', 'JAKARTA'),
      row('b', 'X', 'BANDUNG'),
      row('c', 'X', 'YOGYA'),
    ]);
    assert.deepEqual(groups[0].items.map((r) => r.uuid), ['a', 'b', 'c'], 'urutan input dipertahankan');
  });

  it('brand kosong masuk grup "(Tanpa brand)"', () => {
    const groups = groupRowsByBrand([row('u1', ''), row('u2', null), row('u3', 'OK')]);
    assert.deepEqual(groups.map((g) => g.brand).sort(), ['(Tanpa brand)', 'OK']);
    const kosong = groups.find((g) => g.brand === '(Tanpa brand)');
    assert.equal(kosong.items.length, 2);
  });

  it('input kosong → []', () => {
    assert.deepEqual(groupRowsByBrand([]), []);
  });
});
