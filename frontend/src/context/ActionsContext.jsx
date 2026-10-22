// Context "Yang Harus Dicek": satu agregator 4 sumber data operasional —
// client follow-up (overdue/jatuh tempo hari ini), jadwal audit Popi Nava
// (item minggu berjalan yang belum ditandai audit), kontrak client GRATIS
// (hampir/sudah habis), dan kasus berbayar yang belum tervalidasi — untuk
// lonceng notifikasi di topbar + panel Agenda Hari Ini di dashboard.
// Semua fetch di provider agar bell (AppLayout) dan panel (DashboardPage)
// berbagi satu sumber, tidak dobel request.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useCases } from '../hooks/useCases.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { useInvoiceState } from '../hooks/useInvoiceState.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { isDueToday, isOverdue, overdueDays, todayStr } from '../hooks/useFollowups.js';
import { getFollowups, getBrandStatuses } from '../lib/api.js';
import { formatWeekRange, getSchedule, monthKeyOf, monthWeeks } from '../lib/auditSchedule.js';
import { daysLeft, expiryState, fmtDateID } from '../utils/contract.js';

const ActionsContext = createContext(null);

const MONTH_ITEMS = 4; // maksimal item contoh per grup (detail penuh di halamannya)

// Minggu jadwal audit yang memuat hari ini: minggu Senin-penentu-bulan bisa
// lintas bulan (Senin akhir bulan lalu), jadi cek bulan tetangga; kalau
// hari ini bukan hari kerja (Sabtu/Minggu), pakai minggu Seninnya berikut.
function findActiveWeek(today) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const keyOf = (date) => date.toISOString().slice(0, 10);
  const todayKey = keyOf(today);
  let fallback = null;
  for (const delta of [0, -1, 1]) {
    const base = new Date(y, m + delta, 1);
    for (const week of monthWeeks(base.getFullYear(), base.getMonth())) {
      const keys = week.dates.map(keyOf);
      if (keys.includes(todayKey)) return week;
      if (keys[0] > todayKey && !fallback) fallback = week;
    }
  }
  return fallback;
}

export function ActionsProvider({ children }) {
  const { cases, reload } = useCases();
  const { caseAuditStatus } = useAuditState();
  const { invoiceStatus } = useInvoiceState();
  const { can } = usePermissions();

  const [followups, setFollowups] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [brands, setBrands] = useState([]);
  const [ready, setReady] = useState(false);

  const fetchExtra = useCallback(
    () =>
      Promise.allSettled([getFollowups(), getSchedule(monthKeyOf(new Date())), getBrandStatuses()]).then(
        ([fu, sch, br]) => {
          if (Array.isArray(fu.value)) setFollowups(fu.value);
          if (sch.value && sch.value.weeks) setSchedule(sch.value.weeks);
          if (Array.isArray(br.value)) setBrands(br.value);
        }
      ),
    []
  );

  useEffect(() => {
    let ignore = false;
    fetchExtra().finally(() => {
      if (!ignore) setReady(true);
    });
    return () => {
      ignore = true;
    };
  }, [fetchExtra]);

  const refresh = useCallback(() => Promise.all([reload(), fetchExtra()]), [reload, fetchExtra]);

  const groups = useMemo(() => {
    const out = [];
    const today = todayStr();

    // 1) Client follow-up: overdue dulu, lalu jatuh tempo hari ini.
    if (can('followups')) {
      const overdue = followups
        .filter((r) => isOverdue(r, today))
        .sort((a, b) => String(a.followupDate).localeCompare(String(b.followupDate)));
      const dueToday = followups.filter((r) => isDueToday(r, today));
      const items = [
        ...overdue.map((r) => ({
          label: `${r.client} — ${r.title}`,
          sub: `Overdue ${overdueDays(r, today)} hari · follow-up ${fmtDateID(r.followupDate)}`,
        })),
        ...dueToday.map((r) => ({
          label: `${r.client} — ${r.title}`,
          sub: `Jatuh tempo hari ini · ${fmtDateID(r.followupDate)}`,
        })),
      ];
      if (items.length) {
        out.push({ id: 'followups', title: 'Client Follow-Up', path: '/followups', count: items.length, note: '', items: items.slice(0, MONTH_ITEMS), left: items.length - MONTH_ITEMS });
      }
    }

    // 2) Kasus & tagihan: kasus berbayar yang belum tervalidasi audit
    //    (pekerjaan di Billing & Audit); outstanding belum PAID sebagai catatan.
    if (can('billing')) {
      const pendingAudit = cases.filter(
        (c) =>
          (c.billingStatus === 'ON-CALL' || c.billingStatus === 'MONTHLY') &&
          (caseAuditStatus[c.recordUuid] || 'BELUM DIVALIDASI') !== 'VALID - SIAP INVOICE'
      );
      if (pendingAudit.length) {
        const items = pendingAudit
          .slice()
          .sort((a, b) => String(b.dateIssue || '').localeCompare(String(a.dateIssue || '')))
          .slice(0, MONTH_ITEMS)
          .map((c) => ({
            label: `${(c.client || '-').trim()} — ${c.issue || c.module || 'kasus'}`,
            sub: `${c.billingStatus} · masuk ${c.dateIssue || '-'} · ${caseAuditStatus[c.recordUuid] || 'BELUM DIVALIDASI'}`,
          }));
        const outstanding = cases.filter(
          (c) =>
            (c.billingStatus === 'ON-CALL' || c.billingStatus === 'MONTHLY') &&
            caseAuditStatus[c.recordUuid] === 'VALID - SIAP INVOICE' &&
            (invoiceStatus[c.recordUuid] || 'MENUNGGU INVOICE') !== 'PAID'
        ).length;
        out.push({
          id: 'kasus',
          title: 'Kasus & Tagihan',
          path: '/billing',
          count: pendingAudit.length,
          note: outstanding ? `${outstanding} kasus tervalidasi menunggu pembayaran` : '',
          items,
          left: pendingAudit.length - items.length,
        });
      }
    }

    // 3) Jadwal audit Popi Nava: item minggu berjalan yang belum ditandai.
    if (can('popinava')) {
      const week = findActiveWeek(new Date());
      const list = week && Array.isArray(schedule?.[week.key]) ? schedule[week.key].filter((it) => !it.audited) : [];
      if (list.length) {
        const items = list.slice(0, MONTH_ITEMS).map((it) => ({
          label: it.type === 'brand' ? it.brand : `${it.brand || 'Outlet'}`,
          sub: it.type === 'brand' ? 'Audit brand' : 'Audit outlet',
        }));
        out.push({
          id: 'audit',
          title: 'Jadwal Audit Popi Nava',
          path: '/popinava',
          count: list.length,
          note: week ? `Minggu ${formatWeekRange(week)}` : '',
          items,
          left: list.length - items.length,
        });
      }
    }

    // 4) Kontrak client GRATIS: hampir habis (≤30 hari) / sudah habis.
    if (can('clients')) {
      const atRisk = brands
        .filter((b) => b.type === 'GRATIS' && (expiryState(b.expired_at) === 'soon' || expiryState(b.expired_at) === 'expired'))
        .sort((a, b) => String(a.expired_at || '9999').localeCompare(String(b.expired_at || '9999')));
      if (atRisk.length) {
        const items = atRisk.slice(0, MONTH_ITEMS).map((b) => {
          const d = daysLeft(b.expired_at);
          return {
            label: b.brand,
            sub: d < 0 ? `Habis ${fmtDateID(b.expired_at)}` : `Sisa ${d} hari · habis ${fmtDateID(b.expired_at)}`,
          };
        });
        out.push({ id: 'kontrak', title: 'Kontrak Client', path: '/clients', count: atRisk.length, note: '', items, left: atRisk.length - items.length });
      }
    }

    return out;
  }, [caseAuditStatus, brands, can, cases, followups, invoiceStatus, schedule]);

  const total = useMemo(() => groups.reduce((s, g) => s + g.count, 0), [groups]);

  return <ActionsContext.Provider value={{ groups, total, ready, refresh }}>{children}</ActionsContext.Provider>;
}

export function useActions() {
  const ctx = useContext(ActionsContext);
  return ctx || { groups: [], total: 0, ready: false, refresh: () => {} };
}
