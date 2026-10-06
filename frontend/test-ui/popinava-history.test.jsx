// Riwayat log POPI NAVA — tombol Super Admin + modal InvoiceHistoryModal.
// Jalankan: npm run test:ui
// Mencakup: tombol "Riwayat Log" hanya untuk Super Admin, state memuat,
// saringan kategori 'popinava', dan state gagal (jujur tanpa server).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import { ConfirmProvider } from '../src/components/ui/ConfirmProvider.jsx';
import PopiNavaPage from '../src/pages/PopiNavaPage.jsx';
import { getLogs } from '../src/lib/api.js';

const izin = vi.hoisted(() => ({ canWrite: true, role: 'Super Admin' }));

// Render penuh (88 baris seed + probe) bisa >5s saat file test paralel.
vi.setConfig({ testTimeout: 15000 });

// Sebagian: hanya getLogs yang dimock; ekspor/drawer tetap asli.
vi.mock('../src/lib/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getLogs: vi.fn(),
}));

vi.mock('../src/hooks/usePermissions.js', () => ({
  usePermissions: () => ({ can: () => izin.canWrite, perms: {}, role: izin.role }),
  DEFAULT_PERMS: {},
  ROUTE_PERM: {},
  menuPerm: (x) => x,
}));

// Probe fetch sengaja biarkan gagal → mode lokal (pola popinava.test.jsx).
vi.stubGlobal('fetch', () => Promise.reject(new TypeError('network down')));

function renderPage() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <PopiNavaPage />
      </ConfirmProvider>
    </ToastProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  izin.canWrite = true;
  izin.role = 'Super Admin';
  getLogs.mockReset();
});

describe('PopiNavaPage — Riwayat Log', () => {
  it('Super Admin: state memuat → hanya baris kategori popinava yang tampil', async () => {
    let settle;
    getLogs.mockReturnValue(new Promise((r) => { settle = r; }));
    renderPage();
    await screen.findByText('13 brand · 88 outlet');

    fireEvent.click(screen.getByRole('button', { name: 'Riwayat Log' }));
    expect(await screen.findByText('Memuat riwayat…')).toBeInTheDocument();

    settle([
      { id: 1, created_at: '2026-01-02T10:00:00', who: 'IT Integrasi', action: 'Ubah outlet', detail: 'Toko A', category: 'popinava' },
      { id: 2, created_at: '2026-01-01T09:00:00', who: 'Sistem', action: 'Menambah kasus', detail: 'Kasus B', category: 'Penambahan' },
      { id: 3, created_at: '2026-01-03T08:00:00', who: 'IT Integrasi', action: 'Hapus outlet', category: 'popinava' },
    ]);

    const dlg = await screen.findByRole('dialog', { name: 'Aktivitas POPI NAVA' });
    expect(await within(dlg).findByText('Ubah outlet')).toBeInTheDocument();
    expect(within(dlg).getByText('Hapus outlet')).toBeInTheDocument();
    // Baris non-POPI NAVA tidak ikut; jumlah = 2 aktivitas POPI NAVA.
    expect(within(dlg).queryByText('Menambah kasus')).toBeNull();
    expect(within(dlg).getByText('2 aktivitas')).toBeInTheDocument();
    expect(within(dlg).getByText('Riwayat Log')).toBeInTheDocument();
    expect(within(dlg).getByText('oleh IT Integrasi · POPI NAVA · Toko A')).toBeInTheDocument();

    fireEvent.click(within(dlg).getByRole('button', { name: 'Tutup riwayat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('gagal memuat log → pesan jujur tanpa server', async () => {
    getLogs.mockRejectedValue(new TypeError('network down'));
    renderPage();
    await screen.findByText('13 brand · 88 outlet');

    fireEvent.click(screen.getByRole('button', { name: 'Riwayat Log' }));
    expect(await screen.findByText(/Riwayat hanya tersedia saat terhubung ke server/)).toBeInTheDocument();
    expect(screen.queryByText('Memuat riwayat…')).toBeNull();
  });

  it('tanpa Super Admin: tombol Riwayat Log maupun riwayat baris tak tampil', async () => {
    izin.role = 'Admin CS';
    renderPage();
    await screen.findByText('13 brand · 88 outlet');
    expect(screen.queryByRole('button', { name: 'Riwayat Log' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Riwayat / })).toBeNull();
    expect(getLogs).not.toHaveBeenCalled();
  });
});
