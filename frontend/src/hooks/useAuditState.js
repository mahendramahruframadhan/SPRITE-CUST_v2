import { useCallback, useEffect, useState } from 'react';
import { patchAudit, getStatusOptions, putStatusOptions } from '../lib/api.js';

// Status validasi Billing & Audit — dibagikan ke Finance Audit via localStorage
export const DEFAULT_ACTIONS = ['BELUM DIVALIDASI', 'VALID - SIAP INVOICE', 'PERLU DICEK ULANG'];
const MIGRATE_ACTION = {
  'BELUM DI AUDIT': 'BELUM DIVALIDASI',
  'DONE BLM DI AUDIT': 'VALID - SIAP INVOICE',
  'FOLLOW UP FINANCE': 'PERLU DICEK ULANG',
  PAID: 'VALID - SIAP INVOICE',
};

function loadActions() {
  let arr = JSON.parse(localStorage.getItem('auditActions')) || [...DEFAULT_ACTIONS];
  arr = [...new Set(arr.map((a) => MIGRATE_ACTION[a] || a))];
  return arr;
}

function loadCaseStatus() {
  const st = JSON.parse(localStorage.getItem('caseAuditStatus')) || {};
  Object.keys(st).forEach((k) => {
    st[k] = MIGRATE_ACTION[st[k]] || st[k];
  });
  return st;
}

export function useAuditState() {
  const [auditActions, setAuditActions] = useState(loadActions);
  const [caseAuditStatus, setCaseAuditStatus] = useState(loadCaseStatus);

  useEffect(() => {
    localStorage.setItem('auditActions', JSON.stringify(auditActions));
  }, [auditActions]);

  useEffect(() => {
    localStorage.setItem('caseAuditStatus', JSON.stringify(caseAuditStatus));
  }, [caseAuditStatus]);

  // Daftar master dari backend (DB, disharing semua user); localStorage tetap cache/fallback
  useEffect(() => {
    let ignore = false;
    getStatusOptions()
      .then((r) => {
        if (ignore || !r || !Array.isArray(r.auditActions) || !r.auditActions.length) return;
        // Backend sumber kebenaran (disharing); timpa cache lokal
        setAuditActions([...new Set(r.auditActions.map((a) => MIGRATE_ACTION[a] || a))]);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const updateAudit = useCallback((uuid, action) => {
    setCaseAuditStatus((prev) => ({ ...prev, [uuid]: action }));
    patchAudit(uuid, action).catch(() => {}); // backend sumber kebenaran; localStorage tetap cache instan
  }, []);

  const addAction = useCallback((val) => {
    const v = String(val || '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();
    if (!v) return;
    setAuditActions((prev) => {
      if (prev.some((a) => a.toLowerCase() === v.toLowerCase())) return prev;
      const next = [...prev, v];
      putStatusOptions({ auditActions: next }).catch(() => {}); // sinkron ke DB (best-effort)
      return next;
    });
  }, []);

  const removeAction = useCallback((action) => {
    setAuditActions((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((a) => a !== action);
      putStatusOptions({ auditActions: next }).catch(() => {}); // sinkron ke DB (best-effort)
      return next;
    });
    setCaseAuditStatus((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((uuid) => {
        if (next[uuid] === action) next[uuid] = 'BELUM DIVALIDASI';
      });
      return next;
    });
  }, []);

  return { auditActions, caseAuditStatus, updateAudit, addAction, removeAction };
}
