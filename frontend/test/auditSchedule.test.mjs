// Uji lib jadwal audit mingguan POPI NAVA — node:test bawaan, tanpa deps.
// Jalankan: npm test
// Kontrak: pembagian W1-W4 (hari kerja Sen-Jum, sisa -> W4) + adapter
// penyimpanan yang siap diganti backend (async, bentuk {month, weeks}).
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

// Semua hari kerja (Sen-Jum) dalam satu bulan, untuk membandingkan hasil.
function weekdaysOf(year, month) {
  const out = [];
  const d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCMonth() === month) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe('monthWeeks', () => {
  it('selalu menghasilkan 4 minggu berlabel W1-W4', () => {
    for (const [y, m] of [[2026, 1], [2026, 0], [2027, 0], [2026, 11]]) {
      const weeks = monthWeeks(y, m);
      assert.equal(weeks.length, 4);
      assert.deepEqual(weeks.map((w) => w.key), ['W1', 'W2', 'W3', 'W4']);
    }
  });

  it('hanya berisi hari kerja (Sen-Jum), Sabtu & Minggu tidak pernah muncul', () => {
    const weeks = monthWeeks(2026, 1);
    for (const w of weeks) {
      for (const d of w.dates) {
        const wd = d.getUTCDay();
        assert.ok(wd >= 1 && wd <= 5, `tanggal ${d.toISOString()} bukan hari kerja`);
      }
    }
  });

  it('cakupan tepat: seluruh hari kerja bulan muncul persis sekali', () => {
    const expected = weekdaysOf(2026, 1).map((d) => d.toISOString().slice(0, 10));
    const got = monthWeeks(2026, 1)
      .flatMap((w) => w.dates)
      .map((d) => d.toISOString().slice(0, 10));
    assert.deepEqual(got, expected);
  });

  it('pembagian: 3 blok pertama sama besar, sisa masuk W4', () => {
    // Feb 2026 = 20 hari kerja -> 5,5,5,5. Mar 2026 = 22 -> 5,5,5,7.
    const feb = monthWeeks(2026, 1).map((w) => w.dates.length);
    assert.deepEqual(feb, [5, 5, 5, 5]);
    const mar = monthWeeks(2026, 2).map((w) => w.dates.length);
    assert.equal(mar[0] + mar[1] + mar[2], 15);
    assert.equal(mar[3], 22 - 15);
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

  it('formatWeekRange menampilkan rentang hari kerja pertama-terakhir', () => {
    const weeks = monthWeeks(2026, 1);
    assert.equal(formatWeekRange(weeks[0]), '2-6 Feb');
    assert.equal(formatWeekRange(weeks[3]), '23-27 Feb');
  });
});

describe('adapter jadwal (siap backend)', () => {
  it('getSchedule mengembalikan {month, weeks} kosong untuk bulan baru', async () => {
    const s = await getSchedule('2026-02');
    assert.deepEqual(s, { month: '2026-02', weeks: emptyWeeks() });
  });

  it('saveSchedule -> getSchedule roundtrip', async () => {
    const weeks = emptyWeeks();
    weeks.W1.push({ id: 'a1', type: 'brand', brand: 'Chambers' });
    await saveSchedule('2026-02', weeks);
    const back = await getSchedule('2026-02');
    assert.equal(back.month, '2026-02');
    assert.equal(back.weeks.W1.length, 1);
    assert.equal(back.weeks.W1[0].brand, 'Chambers');
    const other = await getSchedule('2026-03');
    assert.equal(other.weeks.W1.length, 0);
  });

  it('addItem / removeItem / moveItem bekerja tanpa merusak minggu lain', async () => {
    const weeks = emptyWeeks();
    const item = { id: 'x1', type: 'outlet', brand: 'SCH', name: 'SCH Tebet' };
    const withItem = addItem(weeks, 'W2', item);
    assert.equal(withItem.W2.length, 1);
    const moved = moveItem(withItem, 'W2', 'W4', 'x1');
    assert.equal(moved.W2.length, 0);
    assert.equal(moved.W4.length, 1);
    const removed = removeItem(moved, 'W4', 'x1');
    assert.equal(removed.W4.length, 0);
    // weeks asal tidak berubah (immutable).
    assert.equal(weeks.W2.length, 0);
  });
});
