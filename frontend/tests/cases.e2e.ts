import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('data kasus', { tags: ['cases'] }, () => {
  test('filter pencarian menyaring baris tabel', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/kasus');
    await expect(screen.getByRole('button', 'Detail').first()).toBeVisible();
    const search = screen.getByPlaceholder('Cari client / pic / issue...').first();
    await search.fill('zzzzzz-tidak-ada');
    // Teks ini muncul di tabel (desktop) dan kartu (mobile) sekaligus.
    await expect(screen.getByText('Tidak ada data yang cocok').first()).toBeVisible();
    await screen.getByRole('button', 'Reset Filter').tap();
    await expect(search).toHaveValue('');
    await expect(screen.getByRole('button', 'Detail').first()).toBeVisible();
  });

  test('tombol Detail membuka modal detail kasus', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/kasus');
    await screen.getByRole('button', 'Detail').first().tap();
    await expect(screen.getByRole('button', 'Tutup detail')).toBeVisible();
    await screen.getByRole('button', 'Tutup detail').tap();
    await expect(screen.getByRole('button', 'Tutup detail')).toBeHidden();
  });

  test('paginasi berpindah halaman', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/kasus');
    // Catatan bug (menunggu perbaikan): tombol "Halaman berikutnya" berada di
    // kanan bawah, tertutup tombol mengambang "Buka asisten AI" yang fixed di
    // kanan bawah viewport, sehingga panah itu tak bisa diklik. Tes ini memakai
    // tombol nomor halaman (di sebelah kirinya, tidak tertutup) sampai tombol
    // panah diperbaiki atau FAB dipindah.
    await expect(screen.getByRole('button', 'Halaman berikutnya')).toBeVisible();
    await screen.getByRole('button', { name: '2', exact: true }).tap();
    await expect(screen.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(screen.getByRole('button', 'Halaman sebelumnya')).toBeEnabled();
  });
});
