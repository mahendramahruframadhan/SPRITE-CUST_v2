// Warna & ikon grup aksi "Yang Harus Dicek" — satu sumber untuk lonceng
// topbar dan panel Agenda Hari Ini agar tampilannya tak pernah loler salah
// arah. Warna per grup = identitas halamannya (fungsi, bukan dekorasi — R-09).
export const GROUP_META = {
  kasus: {
    soft: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    dot: 'bg-amber-400',
    name: 'Billing & Audit',
  },
  followups: {
    soft: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    dot: 'bg-rose-400',
    name: 'Follow-Up',
  },
  audit: {
    soft: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    dot: 'bg-violet-400',
    name: 'Popi Nava',
  },
  kontrak: {
    soft: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    dot: 'bg-sky-400',
    name: 'Client & Brand',
  },
  notif: {
    soft: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400',
    chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
    dot: 'bg-indigo-400',
    name: 'Notifikasi dari tim',
  },
};

export const ICON_BY_ID = { kasus: 'billing', followups: 'followups', audit: 'store', kontrak: 'clients', notif: 'mail' };

// Fallback bila grup baru muncul tanpa meta (jangan sampai kosong di UI).
export function groupMeta(id) {
  return GROUP_META[id] || GROUP_META.kasus;
}
