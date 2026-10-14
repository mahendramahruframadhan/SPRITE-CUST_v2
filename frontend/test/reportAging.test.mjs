// Unit lib reportAging (halaman /report): bucket umur tunggakan,
// top outstanding, breakdown grup. Murni tanpa React.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgingBuckets, getTopOutstanding, buildGroupBreakdown, ageDays } from '../src/lib/reportAging.js';

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
const item = (dateIssue, subtotal, extra = {}) => ({ dateIssue, charges: subtotal, ppn: 0, subtotal, ...extra });

test('ageDays: beda hari kalender dari YYYYMMDD', () => {
  assert.equal(ageDays(daysAgo(0)), 0);
  assert.equal(ageDays(daysAgo(30)), 30);
  assert.equal(ageDays('bukan-tanggal'), null);
});

test('bucket batas: 30→Baik, 31→Normal, 61→Perhatian, 91→Risiko, 181→Risiko', () => {
  const rows = [30, 31, 60, 61, 90, 91, 180, 181].map((n) => item(daysAgo(n), 1000));
  const r = buildAgingBuckets(rows);
  const byKey = Object.fromEntries(r.buckets.map((b) => [b.key, b]));
  assert.equal(byKey['0-30'].count, 1);
  assert.equal(byKey['0-30'].status, 'Baik');
  assert.equal(byKey['31-60'].count, 2);
  assert.equal(byKey['31-60'].status, 'Normal');
  assert.equal(byKey['61-90'].count, 2);
  assert.equal(byKey['61-90'].status, 'Perhatian');
  assert.equal(byKey['91-180'].count, 2);
  assert.equal(byKey['91-180'].status, 'Risiko');
  assert.equal(byKey['>180'].count, 1);
  assert.equal(byKey['>180'].status, 'Risiko');
  assert.equal(r.total.count, 8);
  assert.equal(r.total.subtotal, 8000);
});

test('tanggal tak valid dikecualikan + dihitung', () => {
  const r = buildAgingBuckets([item('20261399', 500), item(daysAgo(5), 1000)]);
  assert.equal(r.total.count, 1);
  assert.equal(r.invalid, 1);
});

test('getTopOutstanding: 10 terbesar desc, tanpa merusak input', () => {
  const rows = Array.from({ length: 12 }, (_, i) => item(daysAgo(40), (i + 1) * 1000, { recordUuid: `u${i}` }));
  const top = getTopOutstanding(rows, 10);
  assert.equal(top.length, 10);
  assert.equal(top[0].subtotal, 12000);
  assert.equal(top[9].subtotal, 3000);
  assert.equal(rows.length, 12);
});

test('buildGroupBreakdown: grup + persen + urut subtotal', () => {
  const rows = [
    item(daysAgo(10), 1000, { client: 'A' }),
    item(daysAgo(10), 3000, { client: 'B' }),
    item(daysAgo(10), 1000, { client: 'A' }),
  ];
  const g = buildGroupBreakdown(rows, (r) => r.client);
  assert.equal(g.length, 2);
  assert.equal(g[0].name, 'B');
  assert.equal(g[0].percentage, 60);
  assert.equal(g[1].name, 'A');
  assert.equal(g[1].percentage, 40);
});
