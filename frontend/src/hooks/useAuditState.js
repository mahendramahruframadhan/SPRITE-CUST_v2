import { useCallback, useEffect, useRef, useState } from 'react';
import { patchAudit, getStatusOptions, putStatusOptions, renameStatusOption } from '../lib/api.js';

// Status validasi Billing & Audit — dibagikan ke Finance Audit via localStorage
export const DEFAULT_ACTIONS = ['BELUM DIVALIDASI', 'VALID - SIAP INVOICE', 'PERLU DICEK ULANG'];
export const DEFAULT_AUDIT_STATUS = 'BELUM DIVALIDASI';
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

  // Cermin reaktif daftar aksi agar fallback status default tidak yatim
  // bila status default di-rename/hapus (pakai aksi pertama sebagai pengganti).
  const actionsRef = useRef(auditActions);
  actionsRef.current = auditActions;
  const defaultAuditStatus = auditActions.includes(DEFAULT_AUDIT_STATUS)
    ? DEFAULT_AUDIT_STATUS
    : (auditActions[0] || DEFAULT_AUDIT_STATUS);

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
    const fallback = actionsRef.current.includes(DEFAULT_AUDIT_STATUS)
      ? DEFAULT_AUDIT_STATUS
      : (actionsRef.current.filter((a) => a !== action)[0] || DEFAULT_AUDIT_STATUS);
    setCaseAuditStatus((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((uuid) => {
        if (next[uuid] === action) next[uuid] = fallback;
      });
      return next;
    });
  }, []);

  // Ubah nama (rename) satu status master: backend mengganti daftar + migrasi
  // SEMUA kasus yang memakai nama lama; lokal disinkron setelah sukses.
  // Melempar Error dengan pesan ramah bila validasi backend gagal / 403.
  const renameAuditAction = useCallback(async (from, to) => {
    const v = String(to || '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();
    if (!v) throw new Error('Nama status tidak boleh kosong.');
    if (v === from) return { unchanged: true };
    if (actionsRef.current.some((a) => a !== from && a.toLowerCase() === v.toLowerCase())) {
      throw new Error(`Status "${v}" sudah ada.`);
    }
    let r;
    try {
      r = await renameStatusOption({ scope: 'auditActions', from, to: v });
    } catch (e) {
      // Sinkron ulang dari sumber kebenaran agar daftar lokal tidak melenceng
      getStatusOptions()
        .then((rr) => {
          if (Array.isArray(rr?.auditActions) && rr.auditActions.length) {
            setAuditActions([...new Set(rr.auditActions.map((a) => MIGRATE_ACTION[a] || a))]);
          }
        })
        .catch(() => {});
      throw new Error(e?.status === 403 ? 'Hanya role dengan akses Billing yang dapat mengubah.' : (e?.message || 'Gagal mengubah nama status.'));
    }
    if (Array.isArray(r?.auditActions) && r.auditActions.length) {
      setAuditActions([...new Set(r.auditActions)]);
    } else {
      setAuditActions((prev) => prev.map((a) => (a === from ? v : a)));
    }
    const finalName = r?.to || v;
    setCaseAuditStatus((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((uuid) => {
        if (next[uuid] === from) next[uuid] = finalName;
      });
      return next;
    });
    return r;
  }, []);

  return { auditActions, caseAuditStatus, defaultAuditStatus, updateAudit, addAction, removeAction, renameAuditAction };
}
