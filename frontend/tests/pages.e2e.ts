import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('modul: halaman termuat', { tags: ['pages', 'smoke'] }, () => {
  test('dashboard: tombol sinkronisasi tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/dashboard');
    await expect(screen.getByRole('button', 'Sinkron & Muat Ulang')).toBeVisible();
  });

  test('kasus: paginasi tabel tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/kasus');
    await expect(screen.getByRole('button', 'Halaman berikutnya')).toBeVisible();
  });

  test('mockup: kotak cari tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/mockup');
    await expect(screen.getByPlaceholder('Cari client / pic / issue...')).toBeVisible();
  });

  test('form: field keluhan tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/form');
    await expect(screen.getByPlaceholder('Jelaskan masalah yang dilaporkan...')).toBeVisible();
  });

  test('clients: field nama brand tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/clients');
    await expect(screen.getByPlaceholder('cth. Flora Dera')).toBeVisible();
  });

  test('hrreport: filter periode tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/hrreport');
    await expect(screen.getByLabel('Nama PIC')).toBeVisible();
  });

  test('cfg: kategori konfigurasi tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/cfg');
    await expect(screen.getByLabel('Kategori konfigurasi')).toBeVisible();
  });

  test('popinava: kotak cari outlet tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/popinava');
    await expect(screen.getByPlaceholder(/Cari uuid/)).toBeVisible();
  });

  test('billing: kotak cari tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/billing');
    await expect(screen.getByPlaceholder('Cari brand…').first()).toBeVisible();
  });

  test('finance: kotak cari tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/finance');
    await expect(screen.getByPlaceholder('Cari brand…').first()).toBeVisible();
  });

  test('roles: kotak cari user tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/roles');
    await expect(screen.getByPlaceholder('Cari nama atau email...')).toBeVisible();
  });

  test('logs: kotak cari tampil', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/logs');
    await expect(screen.getByPlaceholder('Cari pelaku / aktivitas...')).toBeVisible();
  });

  test('settings: pemilih tema tampil di tab Tampilan', { session: 'admin' }, async ({ app, screen }) => {
    await app.open('/settings');
    await screen
      .getByRole('navigation', 'Navigasi pengaturan')
      .getByRole('button', { name: /Tampilan/ })
      .tap();
    await expect(screen.getByRole('radiogroup', 'Pilih tema')).toBeVisible();
  });
});
