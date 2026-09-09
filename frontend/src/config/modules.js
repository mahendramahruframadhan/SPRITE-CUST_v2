// Konfigurasi modul / routing aplikasi.
// Catatan: master & pricelist disembunyikan karena sudah masuk ke Konfigurasi Sheet.
export const MODULES = [
  { group: 'Menu Utama' },
  { path: '/dashboard', id: 'dashboard', title: 'Dashboard', sub: 'Ringkasan, percakapan, status & laporan bantuan' },
  { path: '/kasus', id: 'kasus', title: 'Data Kasus', sub: 'Semua data kasus support dari Google Sheets' },
  { path: '/mockup', id: 'mockup', title: 'Dashboard Mockup', sub: 'Visualisasi data Google Sheets' },
  { group: 'Operasional' },
  { path: '/form', id: 'form', title: 'Form Kasus', sub: 'Input data kasus support baru' },
  { path: '/hrreport', id: 'hrreport', title: 'HR Report', sub: 'Rekap performa tim & detail ticket per periode' },
  { path: '/cfg', id: 'cfg', title: 'Konfigurasi Sheet', sub: 'Master config sheet: master data, pricelist, brand, mapping' },
  { group: 'Keuangan' },
  { path: '/billing', id: 'billing', title: 'Billing & Audit', sub: 'Validasi tagihan sebelum diterbitkan invoice' },
  { path: '/finance', id: 'finance', title: 'Finance Audit', sub: 'Penerbitan invoice kasus tervalidasi' },
  { group: 'Administrasi' },
  { path: '/roles', id: 'roles', title: 'Hak Akses', sub: 'Kelola pengguna, role & izin modul' },
  { path: '/logs', id: 'logs', title: 'Logs Aktivitas', sub: 'Riwayat perubahan status & penambahan data' },
  { group: 'Akun' },
  { path: '/settings', id: 'settings', title: 'Pengaturan', sub: 'Pengaturan akun, keamanan & akses saya' },
];

// Redirect lama: /master & /pricelist (dulu config.html & pricelist.html)
export const LEGACY_REDIRECTS = {
  master: '/cfg',
  pricelist: '/cfg',
};

export const NAV_MODULES = MODULES.filter((m) => m.id);
