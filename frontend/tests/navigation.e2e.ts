import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

const MODULES = [
  ['Dashboard', '/dashboard'],
  ['Data Kasus', '/kasus'],
  ['Dashboard Mockup', '/mockup'],
  ['Form Kasus', '/form'],
  ['Client & Brand', '/clients'],
  ['HR Report', '/hrreport'],
  ['Konfigurasi Sheet', '/cfg'],
  ['POPI NAVA', '/popinava'],
  ['Billing & Audit', '/billing'],
  ['Finance Audit', '/finance'],
  ['Pengaturan', '/settings'],
] as const;

// Satu tes per modul: halaman dimuat dari URL langsung sehingga tiap tes
// mulai dari konteks bersih. Mengklik 11 link beruntun dalam satu tes membuat
// halaman yang baru dimuat (ribuan kasus) tetap sibuk dan tap berikutnya
// gagal karena main thread sibuk.
describe('navigasi antar modul', { tags: ['nav', 'smoke'] }, () => {
  for (const [title, path] of MODULES) {
    test(`modul ${title} terbuka dari sidebar`, { session: 'admin' }, async ({ app, screen, browser }) => {
      await app.open(path);
      await expect(browser).toHaveURL(new RegExp(`${path}$`));
      await expect(screen.getByRole('heading', title).first()).toBeVisible();
      await expect(screen.getByRole('link', { name: title, visible: true }).first()).toBeVisible();
    });
  }

  test('klik link sidebar berpindah halaman', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/dashboard');
    await screen.getByRole('link', { name: 'POPI NAVA', visible: true }).first().tap();
    await expect(browser).toHaveURL(/\/popinava$/);
    await expect(screen.getByRole('heading', 'POPI NAVA').first()).toBeVisible();
  });

  test('tombol collapse sidebar dan logout ada', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/dashboard');
    await expect(screen.getByRole('button', /Ciutkan sidebar|Luaskan sidebar/)).toBeVisible();
    await expect(screen.getByRole('button', 'Logout')).toBeVisible();
  });
});
