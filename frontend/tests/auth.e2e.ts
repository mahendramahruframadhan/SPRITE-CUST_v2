import { describe, test } from '@e2e-dev/web';
import { expect, credentials } from 'e2e';

describe('auth', { tags: ['auth', 'smoke'] }, () => {
  test('login gagal dengan kredensial salah menampilkan error', async ({ app, screen }) => {
    await app.open('/login');
    await screen.getByPlaceholder('nama@perusahaan.id').fill('e2e@revota.id');
    await screen.getByPlaceholder('••••••••').fill('salah123');
    await screen.getByRole('button', 'Login').tap();
    await expect(screen.getByText(/salah|gagal|tidak/i)).toBeVisible();
  });

  // Pakai akun 'cs', bukan 'admin': login ulang pada akun yang sama
  // membatalkan token sesi sebelumnya (backend hanya menyimpan satu sesi
  // aktif per user), sehingga sesi 'admin' dari setup test ikut mati.
  test('login sukses masuk ke dashboard', async ({ app, screen, browser }) => {
    const cs = credentials.user('cs');
    await app.open('/login');
    await screen.getByPlaceholder('nama@perusahaan.id').fill(cs.username);
    await screen.getByPlaceholder('••••••••').fill(cs.password);
    await screen.getByRole('button', 'Login').tap();
    await expect(browser).toHaveURL(/\/dashboard/);
  });

  test('akses /dashboard tanpa login diarahkan ke /login', async ({ app, browser }) => {
    await app.open('/dashboard');
    await expect(browser).toHaveURL(/\/login/);
  });
});
