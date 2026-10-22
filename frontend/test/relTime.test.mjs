// Uji util waktu relatif utk notifikasi — node:test bawaan, tanpa deps.
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { relTimeID } from '../src/utils/relTime.js';

describe('relTimeID', () => {
  const now = new Date('2026-10-22T12:00:00Z');

  it('baru saja bila < 60 detik', () => {
    assert.equal(relTimeID(new Date('2026-10-22T11:59:30Z').toISOString(), now), 'baru saja');
  });

  it('X menit lalu bila < 1 jam', () => {
    assert.equal(relTimeID(new Date('2026-10-22T11:50:00Z').toISOString(), now), '10 menit lalu');
  });

  it('X jam lalu bila < 24 jam', () => {
    assert.equal(relTimeID(new Date('2026-10-22T09:00:00Z').toISOString(), now), '3 jam lalu');
  });

  it('X hari lalu bila < 7 hari', () => {
    assert.equal(relTimeID(new Date('2026-10-20T12:00:00Z').toISOString(), now), '2 hari lalu');
  });

  it('tanggal singkat id-ID bila >= 7 hari', () => {
    const out = relTimeID(new Date('2026-10-01T12:00:00Z').toISOString(), now);
    assert.match(out, /Okt|okt|Oct/);
    assert.match(out, /1/);
  });
});
