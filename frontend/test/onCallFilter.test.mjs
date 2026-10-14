// Filter detail Analytics/Report: hanya ON-CALL yang boleh masuk.
// Monthly dan FREE harus dikecualikan.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterOnCallRows } from '../src/lib/onCallFilter.js';

describe('filterOnCallRows', () => {
  it('hanya mempertahankan billing status ON-CALL', () => {
    const rows = [
      { recordUuid: 'a', billingStatus: 'ON-CALL' },
      { recordUuid: 'b', billingStatus: 'On Call' },
      { recordUuid: 'c', billingStatus: 'MONTHLY' },
      { recordUuid: 'd', billingStatus: 'FREE' },
      { recordUuid: 'e' },
    ];
    const out = filterOnCallRows(rows);
    assert.deepEqual(out.map((r) => r.recordUuid), ['a', 'b']);
  });

  it('array kosong aman', () => {
    assert.deepEqual(filterOnCallRows([]), []);
  });
});
