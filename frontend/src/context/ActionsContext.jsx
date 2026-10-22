// Context "Yang Harus Dicek": satu agregator 4 sumber data operasional —
// client follow-up (overdue/jatuh tempo hari ini), jadwal audit Popi Nava
// (item minggu berjalan yang belum ditandai audit), kontrak client GRATIS
// (hampir/sudah habis), dan kasus berbayar yang belum tervalidasi — untuk
// lonceng notifikasi di topbar + panel Agenda Hari Ini di dashboard.
// Source ke-5: notifikasi antar-user dari backend (GET /api/notifications,
// polling 60s, interval di-hentikan saat logout) → grup "Notifikasi dari tim".
// Semua fetch di provider agar bell (AppLayout) dan panel (DashboardPage)
// berbagi satu sumber, tidak dobel request.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useCases } from '../hooks/useCases.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { isDueToday, isOverdue, overdueDays, todayStr, useFollowups } from '../hooks/useFollowups.js';
import { getBrandStatuses, deleteNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/api.js';
import { formatWeekRange, getSchedule, monthKeyOf, monthWeeks } from '../lib/auditSchedule.js';
import { daysLeft, expiryState, fmtDateID } from '../utils/contract.js';
import { relTimeID } from '../utils/relTime.js';
import { useAuth } from './AuthContext.jsx';

const ActionsContext = createContext(null);

const MONTH_ITEMS = 4; // maksimal item contoh per grup (detail penuh di halamannya)

const NOTIF_ITEMS = 4; // maksimal item contoh grup notifikasi (sisa "N lainnya")

const NOTIF_POLL_MS = 60_000; // polling antar-user tanpa websocket (sederhana)

const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Pengingat audit bulanan hanya aktif tanggal 1-7 tiap bulan — segera setelah
// bulan berganti, sebelum daftar menumpuk sepanjang bulan.
export const REMINDER_WINDOW_DAYS = 7;

// "20261001" (yyyymmdd) → Date tengah hari; null bila bentuknya aneh.
export function parseIssueDate(ds) {
  const s = String(ds || '').replace(/\D/g, '').padStart(8, '0');
  if (s.length !== 8 || s === '00000000') return null;
  const y = +s.slice(0, 4);
  const m = +s.slice(4, 6);
  const d = +s.slice(6, 8);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
}

// Jendela bulan sebelumnya ( inclusif awal, eksklusif akhir ) + labelnya:
// dipakai filter kasus ON-CALL yang issue-nya jatuh di bulan lalu.
export function prevMonthWindow(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const label = `${MONTH_ID[start.getMonth()]} ${start.getFullYear()}`;
  return { start, end, label };
}

export function inReminderWindow(now = new Date()) {
  return now.getDate() <= REMINDER_WINDOW_DAYS;
}

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
  // Sumber follow-up = hook yang sama dengan halaman /followups (HTML fallback
  // offline localStorage + seed), agar lonceng/panel tidak kalah data saat
  // backend belum terjangkau — selaras dengan halaman yang sedang dilihat user.
  const { items: followups, retryConnection } = useFollowups();
  const { cases, reload } = useCases();
  const { caseAuditStatus } = useAuditState();
  const { can } = usePermissions();

  const [schedule, setSchedule] = useState(null);
  const [brands, setBrands] = useState([]);
  const [ready, setReady] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const { user } = useAuth(); // polling hanya saat ada sesi (tanpa loop 401)

  const fetchExtra = useCallback(
    () =>
      Promise.allSettled([getSchedule(monthKeyOf(new Date())), getBrandStatuses()]).then(([sch, br]) => {
        if (sch.value && sch.value.weeks) setSchedule(sch.value.weeks);
        if (Array.isArray(br.value)) setBrands(br.value);
      }),
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

  // Polling notifikasi: hanya jalan bila user login; tick pertama langsung,
  // lalu tiap 60 detik. Gagal (mis. sesi mati) → diam; req() yang mengurus
  // redirect login sekali — interval berhenti saat user tak ada (depak effect).
  const refreshNotifs = useCallback(async () => {
    try {
      const d = await fetchNotifications();
      setNotifs(Array.isArray(d?.notifications) ? d.notifications : []);
    } catch {
      // sesi/fetch gagal — biarkan data lama, tidur sampai tick berikutnya
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifs([]);
      return undefined;
    }
    let alive = true;
    refreshNotifs();
    const t = setInterval(() => {
      if (alive) refreshNotifs();
    }, NOTIF_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user, refreshNotifs]);

  // Mark read/hapus: optimis di UI, bila API gagal → refetch utk membalik.
  const markNotifRead = useCallback(
    async (id) => {
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      try {
        await markNotificationRead(id);
      } catch {
        refreshNotifs();
      }
    },
    [refreshNotifs],
  );

  const markAllNotifsRead = useCallback(async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    try {
      await markAllNotificationsRead();
    } catch {
      refreshNotifs();
    }
  }, [refreshNotifs]);

  const deleteNotif = useCallback(
    async (id) => {
      setNotifs((prev) => prev.filter((n) => n.id !== id));
      try {
        await deleteNotification(id);
      } catch {
        refreshNotifs();
      }
    },
    [refreshNotifs],
  );

  // Muat ulang: sekaligus coba tersambung lagi (ikutan sinkron follow-up offline), lalu segarkan sumber lainnya.
  const refresh = useCallback(
    () => Promise.all([retryConnection().catch(() => {}), reload(), fetchExtra(), refreshNotifs()]),
    [retryConnection, reload, fetchExtra, refreshNotifs]
  );

  const groups = useMemo(() => {
    const out = [];
    const today = todayStr();
    const nowTs = new Date(); // Date utuh untuk fungsi kalender; today = string untuk perbanding follow-up

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

    // 2) Pengingat audit bulanan: setiap tanggal 1-7, kasus ON-CALL dari bulan
    //    sebelumnya yang belum tervalidasi diingatkan — dicek & diaudit di
    //    Billing & Audit dulu sebelum invoice-nya dicetak (kasus terlambat
    //    diingat sepanjang bulan biar dashboard tidak menumpuk pengingat).
    if (can('billing') && inReminderWindow(nowTs)) {
      const win = prevMonthWindow(nowTs);
      const pendingAudit = cases.filter((c) => {
        if (c.billingStatus !== 'ON-CALL') return false;
        const dt = parseIssueDate(c.dateIssue);
        if (!dt || dt < win.start || dt >= win.end) return false;
        return (caseAuditStatus[c.recordUuid] || 'BELUM DIVALIDASI') !== 'VALID - SIAP INVOICE';
      });
      if (pendingAudit.length) {
        const items = pendingAudit
          .slice()
          .sort((a, b) => String(b.dateIssue || '').localeCompare(String(a.dateIssue || '')))
          .slice(0, MONTH_ITEMS)
          .map((c) => {
            const dt = parseIssueDate(c.dateIssue);
            const when = dt ? `${dt.getDate()} ${MONTH_ID[dt.getMonth()]} ${dt.getFullYear()}` : '-';
            return {
              label: `${(c.client || '-').trim()} — ${c.issue || c.module || 'kasus'}`,
              sub: `Masuk ${when} · ${caseAuditStatus[c.recordUuid] || 'BELUM DIVALIDASI'}`,
            };
          });
        out.push({
          id: 'kasus',
          title: 'Pengingat Audit ON-CALL',
          path: '/billing',
          count: pendingAudit.length,
          note: `Kasus ON-CALL ${win.label} — audit dulu sebelum invoice dicetak`,
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

    // 5) Notifikasi dari tim: unread dulu, lalu terbaru. Grup ini TANPA path —
    //    navigasi per item ke `link`-nya (dari NotificationBell), bukan jump path.
    if (notifs.length > 0) {
      const sorted = notifs.slice().sort((a, b) => (!!a.readAt ? 1 : 0) - (!!b.readAt ? 1 : 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const items = sorted.map((n) => ({
        id: n.id,
        label: n.title,
        sub: [n.body, relTimeID(n.createdAt)].filter(Boolean).join(' · '),
        link: n.link || '/dashboard',
        read: !!n.readAt,
      }));
      const unread = sorted.filter((n) => !n.readAt).length;
      out.push({
        id: 'notif',
        title: 'Notifikasi dari tim',
        path: undefined,
        count: unread,
        note: unread ? `${unread} belum dibaca` : '',
        items: items.slice(0, NOTIF_ITEMS),
        left: items.length - Math.min(items.length, NOTIF_ITEMS),
      });
    }

    return out;
  }, [caseAuditStatus, brands, can, cases, followups, schedule, notifs]);

  const total = useMemo(() => groups.reduce((s, g) => s + g.count, 0), [groups]);

  return <ActionsContext.Provider value={{ groups, total, ready, refresh, notifs, markNotifRead, markAllNotifsRead, deleteNotif }}>{children}</ActionsContext.Provider>;
}

export function useActions() {
  const ctx = useContext(ActionsContext);
  return ctx || { groups: [], total: 0, ready: false, refresh: () => {}, notifs: [], markNotifRead: async () => {}, markAllNotifsRead: async () => {}, deleteNotif: async () => {} };
}
