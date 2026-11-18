// CSV per tab rekap: judul, periode/basis, blok KPI, tabel, dan anti formula.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecapCsv, recapCsvFilename } from '../src/lib/recapExport.js';
import { findRecapTab } from '../src/config/recapTabs.js';

const tab = findRecapTab('workload');
const data = {
  kpis: { total: 3, activeUsers: 2, onCall: 2, open: 1, validated: 1 },
  rows: [
    { user: '=cmd', count: 2, onCall: 2, monthly: 0, free: 0, lainnya: 0, done: 1, open: 1, validated: 1, onCallSubtotal: 1500000, brandCount: 1, moduleCount: 1 },
  ],
};

describe('buildRecapCsv', () => {
  it('memuat judul tab, periode, basis, label KPI, dan label kolom', () => {
    const csv = buildRecapCsv(tab, data, { periode: '2026-11-01 s.d. 2026-11-30', basis: 'Kasus periode' });
    assert.match(csv, /Beban Kerja User/);
    assert.match(csv, /2026-11-01 s\.d\. 2026-11-30/);
    assert.match(csv, /Kasus periode/);
    assert.match(csv, /Total Kasus/);
    assert.match(csv, /User Aktif/);
    assert.match(csv, /ON-CALL/);
  });

  it('menetralkan nilai yang diawali formula dan menulis angka apa adanya', () => {
    const csv = buildRecapCsv(tab, data, { periode: 'x', basis: 'y' });
    assert.ok(csv.includes("'=cmd"), csv);
    assert.ok(csv.includes('1500000'), csv);
  });

  it('tanpa baris tetap menulis header tabel', () => {
    const csv = buildRecapCsv(tab, { kpis: {}, rows: [] }, { periode: '', basis: '' });
    assert.match(csv, /User/);
    assert.doesNotMatch(csv, /undefined/);
  });
});

describe('recapCsvFilename', () => {
  it('memakai tanggal akhir periode', () => {
    assert.equal(recapCsvFilename('workload', '2026-11-30'), 'recap-workload-20261130.csv');
  });

  it('fallback ke tanggal hari ini bila akhir periode kosong', () => {
    assert.match(recapCsvFilename('quality', ''), /^recap-quality-\d{8}\.csv$/);
  });
});
