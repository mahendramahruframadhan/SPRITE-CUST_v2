import { useCallback, useEffect, useState } from 'react';
import { patchInvoice } from '../lib/api.js';

// Status invoice Finance Audit — cermin useAuditState.js (billing).
// Daftar aksi bisa dikonfigurasi user (localStorage `invoiceActions`);
// peta per-kasus tersimpan di `caseInvoiceStatus` (key lama dipertahankan).
export const DEFAULT_INVOICE = ['MENUNGGU INVOICE', 'INVOICE TERBIT', 'PAID'];
export const DEFAULT_INVOICE_STATUS = 'MENUNGGU INVOICE';

function loadActions() {
  try {
    const arr = JSON.parse(localStorage.getItem('invoiceActions'));
    if (Array.isArray(arr) && arr.length) return [...new Set(arr)];
  } catch {}
  return [...DEFAULT_INVOICE];
}

function loadCaseStatus() {
  try {
    return JSON.parse(localStorage.getItem('caseInvoiceStatus')) || {};
  } catch {
    return {};
  }
}

export function useInvoiceState() {
  const [invoiceActions, setInvoiceActions] = useState(loadActions);
  const [invoiceStatus, setInvoiceStatus] = useState(loadCaseStatus);

  useEffect(() => {
    localStorage.setItem('invoiceActions', JSON.stringify(invoiceActions));
  }, [invoiceActions]);

  useEffect(() => {
    localStorage.setItem('caseInvoiceStatus', JSON.stringify(invoiceStatus));
  }, [invoiceStatus]);

  const updateInvoice = useCallback((uuid, status) => {
    setInvoiceStatus((prev) => ({ ...prev, [uuid]: status }));
    patchInvoice(uuid, status).catch(() => {}); // backend sumber kebenaran; localStorage tetap cache instan
  }, []);

  // Isi status default untuk kasus yang belum punya (tanpa memanggil API)
  const ensureDefaults = useCallback((uuids) => {
    setInvoiceStatus((prev) => {
      const next = { ...prev };
      let changed = false;
      (uuids || []).forEach((u) => {
        if (!next[u]) {
          next[u] = DEFAULT_INVOICE_STATUS;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const addInvoiceAction = useCallback((val) => {
    setInvoiceActions((prev) => (prev.includes(val) ? prev : [...prev, val]));
  }, []);

  const removeInvoiceAction = useCallback((status) => {
    setInvoiceActions((prev) => prev.filter((a) => a !== status));
    setInvoiceStatus((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((uuid) => {
        if (next[uuid] === status) next[uuid] = DEFAULT_INVOICE_STATUS;
      });
      return next;
    });
  }, []);

  return { invoiceActions, invoiceStatus, updateInvoice, addInvoiceAction, removeInvoiceAction, ensureDefaults };
}
