// Metadata 10 tab rekap /report. Satu sumber untuk tab bar, kartu KPI,
// tabel, dan ekspor CSV. Tanpa React agar bisa diuji unit.
export const RECAP_TABS = [
  {
    id: 'workload',
    label: 'Beban Kerja User',
    description: 'Sebaran kasus per user, status billing, penyelesaian, dan validasi.',
    basis: 'Kasus periode · date_issue',
    empty: 'Tidak ada kasus pada periode ini.',
    kpis: [
      { key: 'total', label: 'Total Kasus', type: 'number' },
      { key: 'activeUsers', label: 'User Aktif', type: 'number' },
      { key: 'onCall', label: 'ON-CALL', type: 'number' },
      { key: 'open', label: 'Open', type: 'number' },
      { key: 'validated', label: 'Tervalidasi', type: 'number' },
    ],
    columns: [
      { key: 'user', label: 'User' },
      { key: 'count', label: 'Total', type: 'number' },
      { key: 'onCall', label: 'ON-CALL', type: 'number' },
      { key: 'monthly', label: 'MONTHLY', type: 'number' },
      { key: 'free', label: 'FREE', type: 'number' },
      { key: 'lainnya', label: 'LAINNYA', type: 'number' },
      { key: 'done', label: 'DONE', type: 'number' },
      { key: 'open', label: 'Open', type: 'number' },
      { key: 'validated', label: 'Tervalidasi', type: 'number' },
      { key: 'onCallSubtotal', label: 'Nilai ON-CALL', type: 'money' },
      { key: 'brandCount', label: 'Brand', type: 'number' },
      { key: 'moduleCount', label: 'Modul', type: 'number' },
    ],
  },
  {
    id: 'brands',
    label: 'Brand 360',
    description: 'Kasus, validasi, nilai ON-CALL, dan status kontrak per brand.',
    basis: 'Kasus periode · status kontrak per hari ini',
    empty: 'Tidak ada brand pada periode ini.',
    kpis: [
      { key: 'brands', label: 'Brand', type: 'number' },
      { key: 'withContract', label: 'Punya Kontrak', type: 'number' },
      { key: 'noContract', label: 'Tanpa Kontrak', type: 'number' },
      { key: 'monthly', label: 'Kontrak Monthly', type: 'number' },
      { key: 'expiring30', label: 'Segera Habis', type: 'number' },
    ],
    columns: [
      { key: 'brand', label: 'Brand' },
      { key: 'count', label: 'Kasus', type: 'number' },
      { key: 'onCall', label: 'ON-CALL', type: 'number' },
      { key: 'validated', label: 'Tervalidasi', type: 'number' },
      { key: 'onCallSubtotal', label: 'Nilai ON-CALL', type: 'money' },
      { key: 'contractType', label: 'Kontrak' },
      { key: 'expiredAt', label: 'Berakhir', type: 'date' },
      { key: 'daysLeft', label: 'Sisa Hari', type: 'days' },
      { key: 'contractStatus', label: 'Status' },
    ],
  },
  {
    id: 'billing',
    label: 'Billing & Revenue',
    description: 'Charges, PPN, subtotal, pembayaran, dan sisa tagihan ON-CALL tervalidasi.',
    basis: 'Hanya ON-CALL tervalidasi pada periode',
    empty: 'Belum ada ON-CALL tervalidasi pada periode ini.',
    kpis: [
      { key: 'charges', label: 'Charges', type: 'money' },
      { key: 'ppn', label: 'PPN', type: 'money' },
      { key: 'subtotal', label: 'Subtotal', type: 'money' },
      { key: 'paid', label: 'Paid', type: 'money' },
      { key: 'outstanding', label: 'Outstanding', type: 'money' },
    ],
    columns: [
      { key: 'brand', label: 'Brand' },
      { key: 'count', label: 'Kasus', type: 'number' },
      { key: 'charges', label: 'Charges', type: 'money' },
      { key: 'ppn', label: 'PPN', type: 'money' },
      { key: 'subtotal', label: 'Subtotal', type: 'money' },
      { key: 'paid', label: 'Paid', type: 'money' },
      { key: 'outstanding', label: 'Outstanding', type: 'money' },
    ],
  },
  {
    id: 'audit',
    label: 'Audit & Validasi',
    description: 'Funnel validasi sampai invoice dan kasus yang perlu dicek ulang.',
    basis: 'Semua kasus periode · date_issue',
    empty: 'Tidak ada kasus pada periode ini.',
    kpis: [
      { key: 'total', label: 'Total Kasus', type: 'number' },
      { key: 'validated', label: 'Tervalidasi', type: 'number' },
      { key: 'invoiceIssued', label: 'Invoice Terbit', type: 'number' },
      { key: 'invoiceSent', label: 'Invoice Dikirim', type: 'number' },
      { key: 'needCheck', label: 'Perlu Dicek', type: 'number' },
    ],
    columns: [
      { key: 'brand', label: 'Brand' },
      { key: 'total', label: 'Total', type: 'number' },
      { key: 'validated', label: 'Tervalidasi', type: 'number' },
      { key: 'invoiceIssued', label: 'Terbit', type: 'number' },
      { key: 'invoiceSent', label: 'Dikirim', type: 'number' },
      { key: 'paid', label: 'PAID', type: 'number' },
      { key: 'needCheck', label: 'Perlu Dicek', type: 'number' },
    ],
  },
  {
    id: 'popinava',
    label: 'POPI NAVA',
    description: 'Status outlet, jadwal audit, realisasi, dan bukti foto bulan terkait.',
    basis: 'Bulan jadwal POPI NAVA',
    empty: 'Belum ada outlet atau jadwal pada bulan ini.',
    kpis: [
      { key: 'outlets', label: 'Outlet', type: 'number' },
      { key: 'active', label: 'Aktif', type: 'number' },
      { key: 'scheduled', label: 'Terjadwal', type: 'number' },
      { key: 'audited', label: 'Sudah Audit', type: 'number' },
      { key: 'pending', label: 'Belum Audit', type: 'number' },
    ],
    columns: [
      { key: 'brand', label: 'Brand' },
      { key: 'outlets', label: 'Outlet', type: 'number' },
      { key: 'active', label: 'Aktif', type: 'number' },
      { key: 'scheduled', label: 'Terjadwal', type: 'number' },
      { key: 'audited', label: 'Sudah', type: 'number' },
      { key: 'pending', label: 'Belum', type: 'number' },
      { key: 'shots', label: 'Foto', type: 'number' },
    ],
  },
  {
    id: 'modules',
    label: 'Modul, Issue & Channel',
    description: 'Sebaran kasus per modul beserta sub-modul, kategori, dan channel terbanyak.',
    basis: 'Kasus periode · date_issue',
    empty: 'Tidak ada kasus pada periode ini.',
    kpis: [
      { key: 'modules', label: 'Modul', type: 'number' },
      { key: 'channels', label: 'Channel', type: 'number' },
      { key: 'categories', label: 'Kategori', type: 'number' },
      { key: 'topModule', label: 'Modul Teratas' },
      { key: 'topChannel', label: 'Channel Teratas' },
    ],
    columns: [
      { key: 'module', label: 'Modul' },
      { key: 'count', label: 'Kasus', type: 'number' },
      { key: 'onCall', label: 'ON-CALL', type: 'number' },
      { key: 'done', label: 'DONE', type: 'number' },
      { key: 'open', label: 'Open', type: 'number' },
      { key: 'topSubModule', label: 'Sub-modul Teratas' },
      { key: 'topCategory', label: 'Kategori Teratas' },
      { key: 'topChannel', label: 'Channel Teratas' },
    ],
  },
  {
    id: 'sla',
    label: 'SLA & Follow-up',
    description: 'Umur kasus open dan follow-up yang terlambat atau jatuh tempo hari ini.',
    basis: 'Kasus open periode · follow-up per hari ini',
    empty: 'Tidak ada kasus open atau follow-up aktif.',
    kpis: [
      { key: 'open', label: 'Kasus Open', type: 'number' },
      { key: 'avgAgeDays', label: 'Rata-rata Umur', type: 'days' },
      { key: 'over7', label: 'Lewat 7 Hari', type: 'number' },
      { key: 'over14', label: 'Lewat 14 Hari', type: 'number' },
      { key: 'followupsOverdue', label: 'Follow-up Terlambat', type: 'number' },
    ],
    columns: [
      { key: 'client', label: 'Brand' },
      { key: 'title', label: 'Judul' },
      { key: 'priority', label: 'Prioritas' },
      { key: 'status', label: 'Status' },
      { key: 'followupDate', label: 'Follow-up', type: 'date' },
      { key: 'daysLate', label: 'Hari Telat', type: 'days' },
      { key: 'pic', label: 'PIC' },
    ],
  },
  {
    id: 'contracts',
    label: 'Kontrak Maintenance',
    description: 'Status seluruh kontrak per hari ini dan jumlah kasus brand pada periode.',
    basis: 'Status kontrak per hari ini · kasus periode',
    empty: 'Belum ada data kontrak.',
    kpis: [
      { key: 'total', label: 'Total Kontrak', type: 'number' },
      { key: 'monthly', label: 'Monthly', type: 'number' },
      { key: 'gratis', label: 'Gratis', type: 'number' },
      { key: 'expiring30', label: 'Segera Habis', type: 'number' },
      { key: 'expired', label: 'Expired', type: 'number' },
    ],
    columns: [
      { key: 'brand', label: 'Brand' },
      { key: 'type', label: 'Tipe' },
      { key: 'startAt', label: 'Mulai', type: 'date' },
      { key: 'expiredAt', label: 'Berakhir', type: 'date' },
      { key: 'daysLeft', label: 'Sisa Hari', type: 'days' },
      { key: 'status', label: 'Status' },
      { key: 'monthlyFee', label: 'Biaya Bulanan', type: 'money' },
      { key: 'pic', label: 'PIC' },
      { key: 'cases', label: 'Kasus Periode', type: 'number' },
    ],
  },
  {
    id: 'activity',
    label: 'Aktivitas & Produktivitas',
    description: 'Jumlah aktivitas per user dan jenis aksi pada periode terpilih.',
    basis: 'Aktivitas periode · activity_logs.created_at',
    empty: 'Tidak ada aktivitas pada periode ini.',
    kpis: [
      { key: 'actions', label: 'Aktivitas', type: 'number' },
      { key: 'users', label: 'User Aktif', type: 'number' },
      { key: 'inputCases', label: 'Input Kasus', type: 'number' },
      { key: 'updateCases', label: 'Update Kasus', type: 'number' },
      { key: 'validation', label: 'Validasi', type: 'number' },
    ],
    columns: [
      { key: 'user', label: 'User' },
      { key: 'actions', label: 'Aktivitas', type: 'number' },
      { key: 'inputCases', label: 'Input', type: 'number' },
      { key: 'updateCases', label: 'Update', type: 'number' },
      { key: 'validation', label: 'Validasi', type: 'number' },
      { key: 'lastAt', label: 'Terakhir', type: 'datetime' },
    ],
  },
  {
    id: 'quality',
    label: 'Data Quality & Sync',
    description: 'Sepuluh pemeriksaan data kasus periode dan status sync terakhir.',
    basis: 'Pemeriksaan periode · sync snapshot',
    empty: 'Tidak ada temuan pada periode ini.',
    kpis: [
      { key: 'findings', label: 'Total Temuan', type: 'number' },
      { key: 'checksFailed', label: 'Pemeriksaan Gagal', type: 'number' },
      { key: 'missingTax', label: 'ON-CALL Tanpa Pajak', type: 'number' },
      { key: 'lastSyncStatus', label: 'Sync Terakhir' },
      { key: 'lastSyncAt', label: 'Waktu Sync', type: 'datetime' },
    ],
    columns: [
      { key: 'check', label: 'Pemeriksaan' },
      { key: 'count', label: 'Temuan', type: 'number' },
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'note', label: 'Catatan' },
    ],
  },
];

export const RECAP_TAB_IDS = RECAP_TABS.map((t) => t.id);

export const ALL_REPORT_TABS = [{ id: 'ringkasan', label: 'Ringkasan' }, ...RECAP_TABS];

export function findRecapTab(id) {
  if (!id) return null;
  return RECAP_TABS.find((t) => t.id === id) || null;
}

export function formatRecapValue(type, value) {
  if (type === 'money') {
    const n = Number(value) || 0;
    return `Rp ${n.toLocaleString('id-ID')}`;
  }
  if (type === 'number') return (Number(value) || 0).toLocaleString('id-ID');
  if (type === 'days') {
    if (value === null || value === undefined || value === '') return '—';
    return `${Number(value) || 0} hari`;
  }
  if (type === 'date') {
    const s = String(value || '');
    if (!s) return '—';
    const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
    if (!m) return s;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  if (type === 'datetime') {
    const s = String(value || '');
    if (!s) return '—';
    return s.replace('T', ' ').slice(0, 16);
  }
  const s = String(value ?? '');
  return s || '—';
}
