import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('billing: validasi tagihan sebelum invoice', { tags: ['billing'] }, () => {
  test('klik tombol ubah status mengubah badge status kasus', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/billing');
    await expect(screen.getByRole('heading', 'Billing & Audit').first()).toBeVisible();

    // Tombol per-baris: "Ubah status kasus #<no> menjadi <status berikut>".
    const advance = screen.getByRole('button', { name: /^Ubah status kasus #\d+ menjadi / }).first();
    await expect(advance).toBeVisible();
    const label = await advance.getAttribute('aria-label');
    const nextStatus = label.split(' menjadi ')[1];
    await advance.tap();
    await expect(screen.getByText(nextStatus, { exact: true }).first()).toBeVisible();
  });

  test('tombol Master Status Validasi membuka panel', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/billing');
    await screen.getByRole('button', 'Master Status Validasi').tap();
    await expect(screen.getByRole('button', 'Tutup')).toBeVisible();
    await screen.getByRole('button', 'Tutup').tap();
    await expect(screen.getByRole('button', 'Master Status Validasi')).toBeVisible();
  });

  test('filter brand dan reset filter bekerja', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/billing');
    const brand = screen.getByPlaceholder('Cari brand…').first();
    await brand.fill('a');
    await screen.getByRole('button', 'Reset').tap();
    await expect(brand).toHaveValue('');
  });

  test('dropdown export menawarkan kategori ini dan semua kategori', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/billing');
    const trigger = screen.getByRole('button', 'Export CSV');
    await trigger.tap();

    const menu = screen.getByRole('menu', { name: 'Opsi export CSV' });
    await expect(menu).toBeVisible();
    const perKat = screen.getByRole('menuitem', { name: /^Kategori ini/ });
    const semua = screen.getByRole('menuitem', { name: /^Semua kategori/ });
    await expect(perKat).toBeVisible();
    await expect(semua).toBeVisible();

    // Escape menutup menu tanpa ikut mengekspor
    await semua.press('Escape');
    await expect(menu).toBeHidden();

    // Semua kategori: nama file unduhan tetap dan toast menyebut "semua kategori"
    await trigger.tap();
    const dl = await browser.waitForDownload(
      () => screen.getByRole('menuitem', { name: /^Semua kategori/ }).tap(),
    );
    expect(dl.suggestedFilename).toBe('billing-audit-semua-kategori.csv');
    await expect(screen.getByText(/semua kategori.*berhasil diunduh/)).toBeVisible();

    // Kategori ini: perilaku lama tetap, toast menyebut kategori aktif
    await trigger.tap();
    await screen.getByRole('menuitem', { name: /^Kategori ini/ }).tap();
    await expect(screen.getByText(/kasus ON-CALL berhasil diunduh/)).toBeVisible();
  });
});

describe('finance: penerbitan invoice', { tags: ['finance'] }, () => {
  test('tabel finance tampil dengan kolom dan tombol aksi', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/finance');
    await expect(screen.getByRole('heading', 'Finance Audit').first()).toBeVisible();
    await expect(screen.getByPlaceholder('Cari brand…').first()).toBeVisible();
    await expect(screen.getByRole('columnheader', 'Upload PDF')).toBeVisible();
  });

  test('tombol riwayat per baris membuka modal riwayat', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/finance');
    const history = screen.getByRole('button', 'Riwayat invoice, validasi dan PDF kasus ini').first();
    await expect(history).toBeVisible();
    await history.tap();
    await expect(screen.getByText(/aktivitas tercatat/).first()).toBeVisible();
  });
});