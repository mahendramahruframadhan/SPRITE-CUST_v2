// Pengait pajak per transaksi halaman Finance: peta
// { recordUuid: { ppn, pph } } + persistensi localStorage `finance-tax-v2`
// (frontend saja; backend untuk pajak per transaksi belum ada).
import { useCallback, useEffect, useState } from 'react';
import { getJSON, set as storageSet } from '../lib/storage.js';
import { sanitizeTaxMap } from '../lib/taxSummary.js';

const STORAGE_KEY = 'finance-tax-v2';
const EMPTY_ROW = { ppn: null, pph: false };

export function useFinanceTax() {
  const [taxMap, setTaxMap] = useState(() => sanitizeTaxMap(getJSON(STORAGE_KEY, null)));

  useEffect(() => {
    storageSet(STORAGE_KEY, taxMap);
  }, [taxMap]);

  // Simpan entri PPN satu baris (entry valid dari TaxModal, atau null = reset).
  const setPpn = useCallback((uuid, entry) => {
    if (!uuid) return;
    setTaxMap((prev) => ({
      ...prev,
      [uuid]: { ...(prev[uuid] || EMPTY_ROW), ppn: entry && entry.enabled === true ? entry : null },
    }));
  }, []);

  // Saklar status PPH satu baris (tanpa angka, tanpa potongan).
  const togglePph = useCallback((uuid) => {
    if (!uuid) return;
    setTaxMap((prev) => ({
      ...prev,
      [uuid]: { ...(prev[uuid] || EMPTY_ROW), pph: !(prev[uuid]?.pph === true) },
    }));
  }, []);

  return { taxMap, setPpn, togglePph };
}
