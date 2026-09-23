import { useCallback, useEffect, useRef, useState } from 'react';
import { getStatusOptions, putStatusOptions, renameStatusOption } from '../lib/api.js';

// Status invoice Finance Audit — alur terkunci 4 status (tidak bisa dikonfigurasi
// user): MENUNGGU INVOICE → INVOICE TERBIT (otomatis upload PDF) → DIKIRIM
// (klik, menunggu pembayaran) → PAID (modal keterangan).
export const DEFAULT_INVOICE = ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'DIKIRIM', 'PAID'];
export const DEFAULT_INVOICE_STATUS = 'MENUNGGU INVOICE';

// Normalisasi kosakata lama (UNPAID → INVOICE TERBIT) + jamin DIKIRIM ada,
// dipakai untuk cache localStorage maupun daftar dari backend.
function normalizeActions(arr) {
  const mapped = (arr || []).map((a) => (String(a).toUpperCase() === 'UNPAID' ? 'INVOICE TERBIT' : a));
  const out = [...new Set(mapped)].filter((a) => typeof a === 'string' && a);
  if (!out.includes('DIKIRIM')) {
    const i = out.indexOf('INVOICE TERBIT');
    out.splice(i >= 0 ? i + 1 : out.length, 0, 'DIKIRIM');
  }
  return out.length ? out : [...DEFAULT_INVOICE];
}

function loadActions() {
  try {
    const arr = JSON.parse(localStorage.getItem('invoiceActions'));
    if (Array.isArray(arr) && arr.length) return normalizeActions(arr);
  } catch {}
  return [...DEFAULT_INVOICE];
}

function loadCaseStatus() {
  try {
    const map = JSON.parse(localStorage.getItem('caseInvoiceStatus')) || {};
    for (const k of Object.keys(map)) {
      if (String(map[k]).toUpperCase() === 'UNPAID') map[k] = 'INVOICE TERBIT';
    }
    return map;
  } catch {
    return {};
  }
}

// Meta per-invoice yang diisi tim finance: nomor invoice, tanggal terbit,
// tanggal paid, dan keterangan. Key: recordUuid (localStorage `caseInvoiceMeta`).
function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem('caseInvoiceMeta')) || {};
  } catch {
    return {};
  }
}

export function useInvoiceState() {
  const [invoiceActions, setInvoiceActions] = useState(loadActions);
  const [invoiceStatus, setInvoiceStatus] = useState(loadCaseStatus);
  const [invoiceMeta, setInvoiceMeta] = useState(loadMeta);

  // Cermin reaktif daftar aksi agar fallback status default tidak yatim
  // bila status default di-rename/hapus (pakai aksi pertama sebagai pengganti).
  const actionsRef = useRef(invoiceActions);
  actionsRef.current = invoiceActions;
  const defaultInvoiceStatus = invoiceActions.includes(DEFAULT_INVOICE_STATUS)
    ? DEFAULT_INVOICE_STATUS
    : (invoiceActions[0] || DEFAULT_INVOICE_STATUS);

  useEffect(() => {
    localStorage.setItem('invoiceActions', JSON.stringify(invoiceActions));
  }, [invoiceActions]);

  useEffect(() => {
    localStorage.setItem('caseInvoiceStatus', JSON.stringify(invoiceStatus));
  }, [invoiceStatus]);

  useEffect(() => {
    localStorage.setItem('caseInvoiceMeta', JSON.stringify(invoiceMeta));
  }, [invoiceMeta]);

  // Daftar master dari backend (DB); dinormalisasi agar kosakata lama
  // (UNPAID) terpetakan ke INVOICE TERBIT dan DIKIRIM selalu ada.
  useEffect(() => {
    let ignore = false;
    getStatusOptions()
      .then((r) => {
        if (ignore || !r || !Array.isArray(r.invoiceActions) || !r.invoiceActions.length) return;
        setInvoiceActions(normalizeActions(r.invoiceActions));
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  // P1: updateInvoice dihapus — manual invoice kini lewat patchInvoice langsung
  // di halaman (dengan validasi 422 server), sinkron lokal via syncInvoiceStatus.
  // Sinkron lokal SAJA dari kebenaran backend (dipakai otomasi PDF: confirm/hapus
  // mengembalikan invoiceStatus terbaru) — tanpa PATCH balik agar tak duplikat request.
  const syncInvoiceStatus = useCallback((uuid, status) => {
    if (!uuid || !status) return;
    setInvoiceStatus((prev) => (prev[uuid] === status ? prev : { ...prev, [uuid]: status }));
  }, []);

  // Isi status default untuk kasus yang belum punya (tanpa memanggil API)
  const ensureDefaults = useCallback((uuids) => {
    const fallback = actionsRef.current.includes(DEFAULT_INVOICE_STATUS)
      ? DEFAULT_INVOICE_STATUS
      : (actionsRef.current[0] || DEFAULT_INVOICE_STATUS);
    setInvoiceStatus((prev) => {
      const next = { ...prev };
      let changed = false;
      (uuids || []).forEach((u) => {
        if (!next[u]) {
          next[u] = fallback;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const addInvoiceAction = useCallback((val) => {
    const v = String(val || '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();
    if (!v) return;
    setInvoiceActions((prev) => {
      if (prev.some((a) => a.toLowerCase() === v.toLowerCase())) return prev;
      const next = [...prev, v];
      putStatusOptions({ invoiceActions: next }).catch(() => {}); // sinkron ke DB (best-effort)
      return next;
    });
  }, []);

  const removeInvoiceAction = useCallback((status) => {
    setInvoiceActions((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((a) => a !== status);
      putStatusOptions({ invoiceActions: next }).catch(() => {}); // sinkron ke DB (best-effort)
      return next;
    });
    const fallback = actionsRef.current.includes(DEFAULT_INVOICE_STATUS)
      ? DEFAULT_INVOICE_STATUS
      : (actionsRef.current.filter((a) => a !== status)[0] || DEFAULT_INVOICE_STATUS);
    setInvoiceStatus((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((uuid) => {
        if (next[uuid] === status) next[uuid] = fallback;
      });
      return next;
    });
  }, []);

  // Ubah nama (rename) satu status master: backend mengganti daftar + migrasi
  // SEMUA kasus yang memakai nama lama; lokal dioptimistic-update setelah sukses.
  // Melempar Error dengan pesan ramah bila validasi backend gagal / 403.
  const renameInvoiceAction = useCallback(async (from, to) => {
    const v = String(to || '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();
    if (!v) throw new Error('Nama status tidak boleh kosong.');
    if (v === from) return { unchanged: true };
    if (actionsRef.current.some((a) => a !== from && a.toLowerCase() === v.toLowerCase())) {
      throw new Error(`Status "${v}" sudah ada.`);
    }
    let r;
    try {
      r = await renameStatusOption({ scope: 'invoiceActions', from, to: v });
    } catch (e) {
      // Sinkron ulang dari sumber kebenaran agar daftar lokal tidak melenceng
      getStatusOptions()
        .then((rr) => {
          if (Array.isArray(rr?.invoiceActions) && rr.invoiceActions.length) {
            setInvoiceActions([...new Set(rr.invoiceActions)]);
          }
        })
        .catch(() => {});
      throw new Error(e?.status === 403 ? 'Hanya role dengan akses Billing yang dapat mengubah.' : (e?.message || 'Gagal mengubah nama status.'));
    }
    if (Array.isArray(r?.invoiceActions) && r.invoiceActions.length) {
      setInvoiceActions([...new Set(r.invoiceActions)]);
    } else {
      setInvoiceActions((prev) => prev.map((a) => (a === from ? v : a)));
    }
    const finalName = r?.to || v;
    setInvoiceStatus((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((uuid) => {
        if (next[uuid] === from) next[uuid] = finalName;
      });
      return next;
    });
    return r;
  }, []);

  const updateInvoiceMeta = useCallback((uuid, patch) => {
    setInvoiceMeta((prev) => ({ ...prev, [uuid]: { ...(prev[uuid] || {}), ...patch } }));
  }, []);

  return { invoiceActions, invoiceStatus, defaultInvoiceStatus, syncInvoiceStatus, addInvoiceAction, removeInvoiceAction, renameInvoiceAction, ensureDefaults, invoiceMeta, updateInvoiceMeta };
}
