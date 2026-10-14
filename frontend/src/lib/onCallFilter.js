// Filter baris detail Analytics/Report: hanya ON-CALL yang boleh tampil.
// Monthly berbeda jalur dan tidak boleh masuk ke pool ini.
import { isTaxableRow } from './taxSummary.js';

export function filterOnCallRows(rows) {
  return (rows || []).filter((r) => isTaxableRow(r?.billingStatus));
}
