// Validasi rentang tanggal halaman Analitik — murni tanpa React agar bisa
// diuji unit terpisah. Pesan kembali dipakai sebagai banner validasi
// (tanpa prefix "Backend tidak terjangkau" yang menyesatkan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsRangeError } from '../src/lib/analyticsRange.js';

test('from melebihi to mengembalikan pesan validasi', () => {
  assert.equal(analyticsRangeError('2026-10-02', '2026-10-01'), 'Rentang tanggal tidak valid (Date From melebihi Date Until)');
});

test('rentang valid atau kosong mengembalikan null', () => {
  assert.equal(analyticsRangeError('2026-10-01', '2026-10-31'), null);
  assert.equal(analyticsRangeError('', ''), null);
  assert.equal(analyticsRangeError('2026-10-01', ''), null);
});
