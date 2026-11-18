// Metadata 10 tab rekap /report: urutan, label, dan fallback id.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RECAP_TABS, RECAP_TAB_IDS, ALL_REPORT_TABS, findRecapTab } from '../src/config/recapTabs.js';

describe('recapTabs', () => {
  it('berisi 10 tab dengan urutan sesuai spesifikasi', () => {
    assert.deepEqual(RECAP_TAB_IDS, [
      'workload',
      'brands',
      'billing',
      'audit',
      'popinava',
      'modules',
      'sla',
      'contracts',
      'activity',
      'quality',
    ]);
    assert.equal(RECAP_TABS.length, 10);
    assert.equal(RECAP_TAB_IDS.length, new Set(RECAP_TAB_IDS).size);
  });

  it('label tab sesuai judul yang diminta', () => {
    assert.deepEqual(RECAP_TABS.map((t) => t.label), [
      'Beban Kerja User',
      'Brand 360',
      'Billing & Revenue',
      'Audit & Validasi',
      'POPI NAVA',
      'Modul, Issue & Channel',
      'SLA & Follow-up',
      'Kontrak Maintenance',
      'Aktivitas & Produktivitas',
      'Data Quality & Sync',
    ]);
  });

  it('setiap tab punya KPI, kolom, deskripsi, dan basis', () => {
    for (const tab of RECAP_TABS) {
      assert.ok(tab.description.length > 0, tab.id);
      assert.ok(tab.basis.length > 0, tab.id);
      assert.ok(tab.empty.length > 0, tab.id);
      assert.ok(tab.kpis.length >= 3, tab.id);
      assert.ok(tab.columns.length >= 3, tab.id);
      for (const k of tab.kpis) assert.ok(k.key && k.label, tab.id);
      for (const c of tab.columns) assert.ok(c.key && c.label, tab.id);
    }
  });

  it('findRecapTab mengembalikan null untuk id tak dikenal', () => {
    assert.equal(findRecapTab('brands')?.id, 'brands');
    assert.equal(findRecapTab('nope'), null);
    assert.equal(findRecapTab(''), null);
  });

  it('tab bar diawali Ringkasan lalu 10 tab rekap', () => {
    assert.equal(ALL_REPORT_TABS[0].id, 'ringkasan');
    assert.deepEqual(ALL_REPORT_TABS.slice(1).map((t) => t.id), RECAP_TAB_IDS);
  });
});
