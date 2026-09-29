// Aturan validasi + normalisasi POPI NAVA (spec §8) — node:test murni.
// Jalankan: npm test
// Test emas memakai seed 88 baris asli dari sheet POPI NAVA untuk membuktikan
// acceptance §15.1: 88 baris, 0 error, 44 baris peringatan, 53 koreksi shift.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareRow,
  validateRow,
  validatePreview,
  buildFacets,
} from '../src/lib/popinavaValidate.js';
import { POPINAVA_SEED } from '../src/data/popinavaSeed.js';

const shifted = () => ({
  uuid: '83e50b99-ecf6-4f58-a7a4-386def231b2f',
  brand_name: 'HAPPY GO LUCKY',
  rvt_custcode: 'RVT-HGL',
  dept_code: '03010301',
  dept_name: 'DISTRIBUTION',
  dept_channel_name: 'HQ CIKINI',
  dept_reference: '-',
  iso_code: 'ID-JK',
  address: 'JL. CIKINI RAYA',
  city: 'JAKARTA PUSAT',
  province: 'DKI JAKARTA',
  postcode: '10330',
  country: 'P.JAWA',
  area: 'WIB',
  region: 'INDONESIA',
  email: '-',
  notes: '-',
  created_at: '2023-01-15 00:00:00',
});

const aligned = () => ({
  ...shifted(),
  country: 'INDONESIA',
  area: 'P.JAWA',
  region: 'WIB',
});

describe('prepareRow (normalisasi §8.3)', () => {
  it('koreksi shift kolom country/area/region dan mencatat catatan', () => {
    const { row, notes } = prepareRow(shifted());
    assert.equal(row.country, 'INDONESIA');
    assert.equal(row.area, 'P.JAWA');
    assert.equal(row.region, 'WIB');
    const shift = notes.find((n) => n.field === 'country/area/region');
    assert.ok(shift, 'catatan shift harus tercatat');
    assert.equal(shift.from, 'P.JAWA|WIB|INDONESIA');
    assert.equal(shift.to, 'INDONESIA|P.JAWA|WIB');
  });

  it('baris selaras tidak diubah (tanpa catatan shift)', () => {
    const { row, notes } = prepareRow(aligned());
    assert.equal(row.country, 'INDONESIA');
    assert.equal(row.area, 'P.JAWA');
    assert.equal(row.region, 'WIB');
    assert.equal(notes.filter((n) => n.field === 'country/area/region').length, 0);
  });

  it('postcode numerik Excel jadi string tanpa desimal', () => {
    assert.equal(prepareRow({ ...aligned(), postcode: 40114.0 }).row.postcode, '40114');
    assert.equal(prepareRow({ ...aligned(), postcode: '40114.0' }).row.postcode, '40114');
    assert.equal(prepareRow({ ...aligned(), postcode: 40114 }).row.postcode, '40114');
  });

  it('placeholder "-" pada reference/email/notes/address jadi kosong + catatan', () => {
    const { row, notes } = prepareRow(aligned());
    assert.equal(row.dept_reference, '');
    assert.equal(row.email, '');
    assert.equal(row.notes, '');
    assert.equal(row.address, 'JL. CIKINI RAYA'); // alamat asli tidak disentuh
    assert.ok(notes.some((n) => n.field === 'dept_reference'));
    const dashAddr = prepareRow({ ...aligned(), address: '-' });
    assert.equal(dashAddr.row.address, '');
    assert.ok(dashAddr.notes.some((n) => n.field === 'address'));
  });

  it('teks dirapikan (trim + spasi ganda) tanpa memaksa huruf besar', () => {
    const { row } = prepareRow({ ...aligned(), dept_channel_name: '  HQ   Cikini  ' });
    assert.equal(row.dept_channel_name, 'HQ Cikini');
    assert.equal(row.brand_name, 'HAPPY GO LUCKY');
  });
});

describe('validateRow (wajib §8.1 + peringatan §8.2)', () => {
  it('baris valid: tanpa error', () => {
    const { row } = prepareRow(aligned());
    const { errors } = validateRow(row);
    assert.deepEqual(errors, []);
  });

  it('field wajib kosong → REQUIRED', () => {
    const { row } = prepareRow({ ...aligned(), brand_name: '', city: '' });
    const { errors } = validateRow(row);
    assert.ok(errors.some((e) => e.field === 'brand_name' && e.code === 'REQUIRED'));
    assert.ok(errors.some((e) => e.field === 'city' && e.code === 'REQUIRED'));
  });

  it('format salah → INVALID_FORMAT', () => {
    const bad = {
      ...aligned(),
      uuid: 'bukan-uuid',
      rvt_custcode: 'XX-1',
      dept_code: '0301',
      dept_name: 'OFFICE',
      iso_code: 'ID-JAKARTA',
    };
    const { errors } = validateRow(prepareRow(bad).row);
    const fields = errors.map((e) => e.field);
    for (const f of ['uuid', 'rvt_custcode', 'dept_code', 'dept_name', 'iso_code']) {
      assert.ok(fields.includes(f), `${f} harus error`);
    }
  });

  it('country bukan INDONESIA → COUNTRY_INCONSISTENT', () => {
    const { row } = prepareRow({ ...shifted(), region: 'WIB' }); // shift tidak terpicu
    const { errors } = validateRow(row);
    assert.ok(errors.some((e) => e.code === 'COUNTRY_INCONSISTENT'));
  });

  it('postcode placeholder → peringatan, bukan error', () => {
    for (const pc of ['0', '12345', '4000', '40000', '40197', '4265106', '']) {
      const { errors, warnings } = validateRow(prepareRow({ ...aligned(), postcode: pc }).row);
      assert.equal(errors.length, 0, `postcode ${pc} bukan error`);
      assert.ok(warnings.some((w) => w.code === 'POSTCODE_SUSPECT'), `postcode ${pc} harus peringatan`);
    }
  });

  it('address kosong → peringatan ADDRESS_EMPTY', () => {
    const { warnings } = validateRow(prepareRow({ ...aligned(), address: '' }).row);
    assert.ok(warnings.some((w) => w.code === 'ADDRESS_EMPTY'));
  });

  it('created_at tidak terbaca → peringatan DATE_UNREADABLE', () => {
    const { warnings } = validateRow(prepareRow({ ...aligned(), created_at: 'bukan-tanggal' }).row);
    assert.ok(warnings.some((w) => w.code === 'DATE_UNREADABLE'));
  });
});

describe('validatePreview (lintas-baris §8.1)', () => {
  const prep = (raw, rowNo) => {
    const { row, notes } = prepareRow(raw);
    return { row: rowNo, data: row, notes };
  };

  it('uuid duplikat dalam file → DUPLICATE_UUID dengan nomor baris', () => {
    const a = prep(aligned(), 6);
    const b = prep({ ...aligned(), rvt_custcode: 'RVT-ABC', dept_code: '03010599' }, 7);
    const report = validatePreview([a, b]);
    assert.equal(report.valid, 1);
    const dup = report.errors.find((e) => e.code === 'DUPLICATE_UUID');
    assert.ok(dup);
    assert.equal(dup.row, 7);
    assert.match(dup.message, /baris 6/);
  });

  it('pasangan custcode + dept_code duplikat → DUPLICATE_PAIR', () => {
    const a = prep(aligned(), 6);
    const b = prep({ ...aligned(), uuid: '11111111-1111-4111-8111-111111111111' }, 7);
    const report = validatePreview([a, b]);
    const dup = report.errors.find((e) => e.code === 'DUPLICATE_PAIR');
    assert.ok(dup);
    assert.equal(dup.row, 7);
  });

  it('hitung valid, withWarnings, details, dan normalisasi', () => {
    const good = prep(aligned(), 6);
    const warn = prep(
      { ...aligned(), uuid: '22222222-2222-4222-8222-222222222222', rvt_custcode: 'RVT-DEF', dept_code: '03010501', postcode: '0' },
      7
    );
    const bad = prep(
      { ...aligned(), uuid: '33333333-3333-4333-8333-333333333333', rvt_custcode: 'RVT-GHI', dept_code: '123' },
      8
    );
    const report = validatePreview([good, warn, bad]);
    assert.equal(report.totalRows, 3);
    assert.equal(report.valid, 2);
    assert.equal(report.withWarnings, 1);
    assert.equal(report.errors.length, 1);
    assert.equal(report.details.length, 3);
    assert.equal(report.details[2].errors[0].field, 'dept_code');
  });
});

describe('acceptance §15.1: seluruh seed asli 88 baris', () => {
  const entries = POPINAVA_SEED.map((raw, i) => {
    const { row, notes } = prepareRow(raw);
    return { row: i + 1, data: row, notes };
  });
  const report = validatePreview(entries);

  it('88 baris terbaca, 0 error', () => {
    assert.equal(report.totalRows, 88);
    assert.equal(report.valid, 88);
    assert.equal(report.errors.length, 0);
  });

  it('44 baris peringatan (43 postcode + 2 address, satu baris keduanya)', () => {
    assert.equal(report.withWarnings, 44);
    const pcRows = new Set(
      report.details.filter((d) => d.warnings.some((w) => w.code === 'POSTCODE_SUSPECT')).map((d) => d.row)
    );
    const addrRows = new Set(
      report.details.filter((d) => d.warnings.some((w) => w.code === 'ADDRESS_EMPTY')).map((d) => d.row)
    );
    assert.equal(pcRows.size, 43);
    assert.equal(addrRows.size, 2);
    const both = [...addrRows].filter((r) => pcRows.has(r));
    assert.equal(both.length, 1);
  });

  it('53 koreksi shift country/area/region', () => {
    const shifts = report.normalized.filter((n) => n.field === 'country/area/region');
    assert.equal(shifts.length, 53);
  });

  it('13 brand muncul di facet (spec §15.2)', () => {
    const records = POPINAVA_SEED.map((raw) => prepareRow(raw).row);
    const facets = buildFacets(
      records.map((r) => ({
        brandName: r.brand_name,
        city: r.city,
        area: r.area,
        status: 'active',
      }))
    );
    assert.equal(facets.brands.length, 13);
    assert.ok(facets.brands.includes('MAYOUTFIT'));
  });
});
