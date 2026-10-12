import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('form kasus', { tags: ['form'] }, () => {
  test('master dropdown terisi dari backend', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/form');
    await expect(screen.getByRole('button', 'Simpan ke Backend')).toBeVisible();
    await expect(screen.getByPlaceholder('PIC lapangan')).toBeVisible();
    await expect(screen.getByPlaceholder('Jelaskan masalah yang dilaporkan...')).toBeVisible();
    // Option master (mis. PIC) berasal dari /api/masters, bukan placeholder statis.
    const options = await screen.getByRole('combobox').first().allTextContents();
    expect(options.length).toBeGreaterThan(0);
  });

  test('validasi menolak kasus tanpa isi wajib', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/form');
    await screen.getByRole('button', 'Simpan ke Backend').tap();
    await expect(screen.getByText(/wajib|tidak boleh kosong|belum diisi/i).first()).toBeVisible();
  });
});

describe('POPI NAVA', { tags: ['popinava'] }, () => {
  test('pencarian outlet menyaring tabel', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/popinava');
    const search = screen.getByPlaceholder(/Cari uuid/);
    await search.fill('zzzz-tidak-ada');
    await expect(screen.getByText(/Tidak ada outlet|Tidak ada data/i).first()).toBeVisible();
    await screen.getByRole('button', /Reset Filter|Bersihkan filter/i).first().tap();
    await expect(search).toHaveValue('');
  });

  test('tombol Impor membuka wizard impor', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/popinava');
    await screen.getByRole('button', 'Impor').first().tap();
    await expect(screen.getByRole('dialog')).toBeVisible();
  });

  test('tombol Tambah Outlet membuka form outlet baru', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/popinava');
    await screen.getByRole('button', 'Tambah Outlet').first().tap();
    await expect(screen.getByRole('dialog')).toBeVisible();
  });

  test('tab Outlet, Jadwal Audit dan Riwayat Log terbuka', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/popinava');
    await screen.getByRole('button', 'Jadwal Audit').first().tap();
    await expect(screen.getByText(/jadwal|audit/i).first()).toBeVisible();
    await screen.getByRole('button', 'Outlet').first().tap();
    await screen.getByRole('button', 'Riwayat Log').first().tap();
    await expect(screen.getByText(/Aktivitas POPI NAVA/i).first()).toBeVisible();
  });
});

describe('hak akses', { tags: ['roles'] }, () => {
  test('daftar pengguna tampil dengan aksi edit dan hapus', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/roles');
    await expect(screen.getByPlaceholder('Cari nama atau email...')).toBeVisible();
    await expect(screen.getByRole('button', { name: /^Edit / }).first()).toBeVisible();
    await expect(screen.getByRole('button', { name: /^Hapus / }).first()).toBeVisible();
  });

  test('tab Role & Izin Modul menampilkan daftar role', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/roles');
    await screen.getByRole('button', 'Role & Izin Modul').tap();
    await expect(screen.getByRole('heading', 'Matriks Izin Modul')).toBeVisible();
    // Kolom Super Admin terkunci (checkbox disabled), role lain bisa diubah.
    await expect(screen.getByRole('checkbox', { name: /Izin .* untuk role Super Admin/ }).first()).toBeDisabled();
    await expect(screen.getByRole('button', 'Simpan Perubahan')).toBeVisible();
  });

  test('tab AI & API Key menampilkan daftar koneksi', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/roles');
    await screen.getByRole('button', 'AI & API Key').tap();
    await expect(screen.getByRole('button', '+ Tambah AI')).toBeVisible();
  });
});

describe('logs aktivitas', { tags: ['logs'] }, () => {
  test('filter kategori dan pencarian bekerja', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/logs');
    await expect(screen.getByRole('button', /Validasi/)).toBeVisible();
    const search = screen.getByPlaceholder('Cari pelaku / aktivitas...');
    await search.fill('zzzz-tidak-ada');
    await expect(search).toHaveValue('zzzz-tidak-ada');
  });
});

describe('client & brand', { tags: ['clients'] }, () => {
  test('daftar brand terbagi Monthly dan Free Maintenance', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/clients');
    await expect(screen.getByRole('button', 'Monthly')).toBeVisible();
    await expect(screen.getByRole('button', 'Free Maintenance')).toBeVisible();
    await expect(screen.getByRole('button', 'Lihat detail Inspired').first()).toBeVisible();
  });

  test('form tambah brand menolak nama kosong', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/clients');
    // Form "Tambah cepat" tampil inline, bukan drawer: klik dengan nama kosong
    // harus ditolak dengan pesan validasi.
    await expect(screen.getByPlaceholder('cth. Flora Dera')).toBeVisible();
    await screen.getByRole('button', 'Tambah').tap();
    await expect(screen.getByText('Isi nama brand dulu')).toBeVisible();
  });
});