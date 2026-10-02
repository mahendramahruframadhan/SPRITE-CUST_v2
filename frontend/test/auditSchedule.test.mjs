// Uji lib jadwal audit mingguan POPI NAVA — node:test bawaan, tanpa deps.
// Jalankan: npm test
// Kontrak (revisi kalender 2026-10-02): W1 mulai Senin pertama bulan; satu
// minggu = Senin penentu bulan (1-2 Okt ikut W4 September); bulan boleh
// punya 4 atau 5 minggu; adapter {month, weeks} siap diganti backend.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthWeeks,
  monthKeyOf,
  shiftMonthKey,
  formatMonthLabel,
  formatWeekRange,
  emptyWeeks,
  getSchedule,
  saveSchedule,
  addItem,
  removeItem,
  moveItem,
} from '../src/lib/auditSchedule.js';

// Stub localStorage sederhana untuk mode node (storage.js membaca global ini).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

beforeEach(() => store.clear());

const iso = (week) => week.dates.map((d) => d.toISOString().slice(0, 10));

describe('monthWeeks — mengikuti minggu kalender (Senin penentu bulan)', () => {
  it('Oktober 2026: W1 mulai Senin pertama 5 Okt; 1-2 Okt tidak ada di sini', () => {
    const weeks = monthWeeks(2026, 9);
    assert.equal(weeks.length, 4);
    assert.deepEqual(weeks.map((w) => w.key), ['W1', 'W2', 'W3', 'W4']);
    assert.deepEqual(iso(weeks[0]), [
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09',
    ]);
    assert.deepEqual(iso(weeks[3]), [
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
    ]);
    const all = weeks.flatMap((w) => iso(w));
    assert.ok(!all.includes('2026-10-01'), '1 Okt milik September');
    assert.ok(!all.includes('2026-10-02'), '2 Okt milik September');
  });

  it('September 2026: W4 = 28 Sep - 2 Okt (membawa 1-2 Okt)', () => {
    const weeks = monthWeeks(2026, 8);
    assert.equal(weeks.length, 4);
    assert.deepEqual(iso(weeks[3]), [
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
    ]);
    assert.equal(iso(weeks[0])[0], '2026-09-07', '1-4 Sep milik W5 Agustus');
  });

  it('Agustus 2026: 5 minggu; W5 = 31 Agu - 4 Sep', () => {
    const weeks = monthWeeks(2026, 7);
    assert.equal(weeks.length, 5);
    assert.deepEqual(weeks.map((w) => w.key), ['W1', 'W2', 'W3', 'W4', 'W5']);
    assert.deepEqual(iso(weeks[4]), [
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
    ]);
  });

  it('November 2026: 5 minggu; W5 = 30 Nov - 4 Des', () => {
    const weeks = monthWeeks(2026, 10);
    assert.equal(weeks.length, 5);
    assert.deepEqual(iso(weeks[4]), [
      '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04',
    ]);
  });

  it('jumlah minggu = jumlah Senin dalam bulan (4 atau 5)', () => {
    const cases = [
      [2026, 9, 4], // Okt 2026
      [2026, 8, 4], // Sep 2026
      [2026, 7, 5], // Agu 2026
      [2026, 10, 5], // Nov 2026
      [2026, 11, 4], // Des 2026
      [2026, 1, 4], // Feb 2026
      [2026, 2, 5], // Mar 2026
    ];
    for (const [y, m, n] of cases) {
      assert.equal(monthWeeks(y, m).length, n, `${y}-${m + 1}`);
    }
  });

  it('tiap minggu persis 5 hari kerja Sen-Jum berurutan', () => {
    for (const [y, m] of [[2026, 9], [2026, 7], [2026, 10], [2026, 1]]) {
      for (const w of monthWeeks(y, m)) {
        assert.equal(w.dates.length, 5, `${w.key} harus 5 hari kerja`);
        w.dates.forEach((d, i) => {
          assert.equal(d.getUTCDay(), i + 1, `${w.key} urutan Sen=1..Jum=5`);
        });
      }
    }
  });
});

describe('navigasi & label bulan', () => {
  it('monthKeyOf / shiftMonthKey menyeberangi tahun', () => {
    assert.equal(monthKeyOf(new Date(2026, 0, 15)), '2026-01');
    assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
    assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
  });

  it('formatMonthLabel memakai nama bulan Indonesia', () => {
    assert.equal(formatMonthLabel('2026-02'), 'Februari 2026');
    assert.equal(formatMonthLabel('2026-12'), 'Desember 2026');
  });

  it('formatWeekRange: dalam bulan sama, tanpa nama bulan ganda', () => {
    assert.equal(formatWeekRange(monthWeeks(2026, 1)[0]), '2-6 Feb');
    assert.equal(formatWeekRange(monthWeeks(2026, 9)[0]), '5-9 Okt');
  });

  it('formatWeekRange lintas bulan: "28 Sep - 2 Okt"', () => {
    assert.equal(formatWeekRange(monthWeeks(2026, 8)[3]), '28 Sep - 2 Okt');
    assert.equal(formatWeekRange(monthWeeks(2026, 7)[4]), '31 Agu - 4 Sep');
    assert.equal(formatWeekRange(monthWeeks(2026, 2)[4]), '30 Mar - 3 Apr');
  });
});

describe('adapter jadwal (siap backend)', () => {
  it('getSchedule mengembalikan {month, weeks} kosong untuk bulan baru', async () => {
    const s = await getSchedule('2026-02');
    assert.deepEqual(s, { month: '2026-02', weeks: emptyWeeks() });
  });

  it('saveSchedule -> getSchedule roundtrip termasuk W5', async () => {
    const weeks = emptyWeeks();
    weeks.W1.push({ id: 'a1', type: 'brand', brand: 'Chambers' });
    weeks.W5.push({ id: 'a5', type: 'brand', brand: 'SCH' });
    await saveSchedule('2026-08', weeks);
    const back = await getSchedule('2026-08');
    assert.equal(back.month, '2026-08');
    assert.equal(back.weeks.W1.length, 1);
    assert.equal(back.weeks.W5.length, 1);
    const other = await getSchedule('2026-03');
    assert.equal(other.weeks.W1.length, 0);
  });

  it('data lama {W1..W4} tetap terbaca (tanpa migrasi)', async () => {
    const legacy = { '2026-10': { month: '2026-10', weeks: { W1: [{ id: 'l1', type: 'brand', brand: 'X' }], W2: [], W3: [], W4: [] } } };
    globalThis.localStorage.setItem('sprite.auditSchedule.v1', JSON.stringify(legacy));
    const back = await getSchedule('2026-10');
    assert.equal(back.weeks.W1.length, 1);
    assert.deepEqual(back.weeks.W5, []);
  });

  it('addItem / removeItem / moveItem bekerja tanpa merusak minggu lain', async () => {
    const weeks = emptyWeeks();
    const item = { id: 'x1', type: 'outlet', brand: 'SCH', name: 'SCH Tebet' };
    const withItem = addItem(weeks, 'W2', item);
    assert.equal(withItem.W2.length, 1);
    const moved = moveItem(withItem, 'W2', 'W5', 'x1');
    assert.equal(moved.W2.length, 0);
    assert.equal(moved.W5.length, 1);
    const removed = removeItem(moved, 'W5', 'x1');
    assert.equal(removed.W5.length, 0);
    assert.equal(weeks.W2.length, 0);
  });
});
