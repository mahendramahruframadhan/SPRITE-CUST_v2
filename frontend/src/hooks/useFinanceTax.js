// Pengait pajak per transaksi: map server adalah kebenaran, localStorage
// `finance-tax-v2` adalah outbox (hanya entri belum terkonfirmasi server).
// Sukses PATCH menghapus key dari outbox (evict-on-ack); gagal/offline
// key tetap ditahan dan dicoba ulang.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON, set as storageSet } from '../lib/storage.js';
import { sanitizeTaxMap, normalizeServerRow, mergeTaxMaps, applySaveResult } from '../lib/taxSummary.js';
import { getTaxMap, patchTax } from '../lib/api.js';

const STORAGE_KEY = 'finance-tax-v2';
const EMPTY_ROW = { ppn: null, pph: false };

export function useFinanceTax({ notify } = {}) {
  const [serverMap, setServerMap] = useState({});
  const [outbox, setOutbox] = useState(() => sanitizeTaxMap(getJSON(STORAGE_KEY, null)));
  const serverMapRef = useRef(serverMap);
  serverMapRef.current = serverMap;
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    storageSet(STORAGE_KEY, outboxRef.current);
  }, [outbox]);

  // Dorong satu baris ke server; sukses terapkan kebenaran server + evict,
  // gagal tahan di outbox + beri tahu user.
  const pushRow = useCallback(async (uuid, row) => {
    try {
      const r = await patchTax(uuid, { ppn: row.ppn, pph: row.pph });
      if (r?.tax) setServerMap((prev) => ({ ...prev, [uuid]: normalizeServerRow(r.tax) }));
      setOutbox((prev) => applySaveResult(prev, uuid, true));
    } catch {
      if (notifyRef.current) notifyRef.current('Gagal menyimpan pajak, ditahan dan dicoba lagi.', 'err');
    }
  }, []);

  // Kirim ulang seluruh antrean (dipakai saat load, online, sebelum save).
  const flushOutbox = useCallback(async () => {
    for (const uuid of Object.keys(outboxRef.current || {})) {
      await pushRow(uuid, outboxRef.current[uuid]);
    }
  }, [pushRow]);

  // Load: kebenaran server, tumpangi outbox, lalu flush background.
  useEffect(() => {
    let ignore = false;
    getTaxMap()
      .then((r) => {
        if (ignore) return;
        const map = {};
        const raw = r?.map && typeof r.map === 'object' ? r.map : {};
        for (const k of Object.keys(raw)) map[k] = normalizeServerRow(raw[k]);
        setServerMap(map);
        flushOutbox();
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, [flushOutbox]);

  useEffect(() => {
    const onOnline = () => { flushOutbox(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushOutbox]);

  const saveRow = useCallback((uuid, row) => {
    if (!uuid) return;
    setOutbox((prev) => ({ ...prev, [uuid]: row }));
    flushOutbox().then(() => pushRow(uuid, row));
  }, [flushOutbox, pushRow]);

  // Simpan entri PPN satu baris (entry valid dari TaxModal, atau null = reset).
  const setPpn = useCallback((uuid, entry) => {
    if (!uuid) return;
    const cur = { ...(serverMapRef.current[uuid] || EMPTY_ROW), ...(outboxRef.current[uuid] || {}) };
    saveRow(uuid, { ...cur, ppn: entry && entry.enabled === true ? entry : null });
  }, [saveRow]);

  // Saklar status PPH satu baris (tanpa angka, tanpa potongan).
  const togglePph = useCallback((uuid) => {
    if (!uuid) return;
    const cur = { ...(serverMapRef.current[uuid] || EMPTY_ROW), ...(outboxRef.current[uuid] || {}) };
    saveRow(uuid, { ...cur, pph: !(cur.pph === true) });
  }, [saveRow]);

  const taxMap = mergeTaxMaps(serverMap, outbox);
  return { taxMap, pendingUuids: Object.keys(outbox), setPpn, togglePph, flushOutbox };
}
