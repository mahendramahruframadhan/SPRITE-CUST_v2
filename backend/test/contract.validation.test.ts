// Uji validasi murni kontrak client/brand — node:test bawaan, tanpa deps.
// Jalankan: npm test   (Node 22+ via type-stripping, tanpa flag)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkClientInput,
  checkStatusInput,
  ContractError,
  DATE_RE,
  normalizeBrand,
  STATUS_TYPES,
} from '../src/clients/contract.validation.ts';

describe('contract.validation', () => {
  it('menerima input GRATIS lengkap', () => {
    assert.deepEqual(checkStatusInput({ brand: ' Flora Dera ', type: 'gratis', expiredAt: '2026-10-06' }), {
      brand: 'Flora Dera',
      type: 'GRATIS',
      expiredAt: '2026-10-06',
    });
  });

  it('MONTHLY tanpa tanggal tetap lolos', () => {
    assert.equal(checkStatusInput({ brand: 'Chambers', type: 'MONTHLY' }).expiredAt, '');
  });

  it('menolak brand kosong (BRAND_REQUIRED)', () => {
    assert.throws(() => checkStatusInput({ brand: '   ', type: 'MONTHLY' }), (e) => e instanceof ContractError && e.code === 'BRAND_REQUIRED');
  });

  it('menolak tipe asing (TYPE_INVALID)', () => {
    assert.throws(() => checkStatusInput({ brand: 'X', type: 'TAHUNAN' }), (e) => e instanceof ContractError && e.code === 'TYPE_INVALID');
  });

  it('GRATIS tanpa expired ditolak (EXPIRED_REQUIRED)', () => {
    assert.throws(() => checkStatusInput({ brand: 'X', type: 'GRATIS' }), (e) => e instanceof ContractError && e.code === 'EXPIRED_REQUIRED');
  });

  it('format tanggal salah ditolak (DATE_INVALID)', () => {
    assert.throws(() => checkStatusInput({ brand: 'X', type: 'GRATIS', expiredAt: '06-10-2026' }), (e) => e instanceof ContractError && e.code === 'DATE_INVALID');
    assert.ok(DATE_RE.test('2027-06-15'));
    assert.ok(!DATE_RE.test('2027-6-5'));
  });

  it('client: brand wajib, spasi dipangkas', () => {
    assert.equal(checkClientInput({ brand: '  Kopi Arena ' }), 'Kopi Arena');
    assert.throws(() => checkClientInput({ brand: '' }), (e) => e instanceof ContractError && e.code === 'BRAND_REQUIRED');
  });

  it('normalisasi + daftar tipe stabil', () => {
    assert.equal(normalizeBrand(null), '');
    assert.deepEqual(STATUS_TYPES, ['MONTHLY', 'BARU', 'GRATIS']);
  });
});
