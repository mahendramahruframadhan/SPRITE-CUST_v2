// Riwayat log POPI NAVA — tombol Super Admin + modal InvoiceHistoryModal.
// Jalankan: npm run test:ui
// Mencakup: tombol "Riwayat Log" hanya untuk Super Admin, state memuat,
// pemetaan baris endpoint /popinava/logs (server sudah saring kategori
// 'popinava' — lihat backend test popinava.history.logs.test.ts), dan
// state gagal (jujur tanpa server).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import { ConfirmProvider } from '../src/components/ui/ConfirmProvider.jsx';
import PopiNavaPage from '../src/pages/PopiNavaPage.jsx';
import { getPopinavaLogs } from '../src/lib/api.js';

const izin = vi.hoisted(() => ({ canWrite: true, role: 'Super Admin' }));

// Render penuh (88 baris seed + probe) bisa >5s saat file test paralel.
vi.setConfig({ testTimeout: 15000 });

// Sebagian: hanya getPopinavaLogs yang dimock; ekspor/drawer tetap asli.
vi.mock('../src/lib/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getPopinavaLogs: vi.fn(),
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
  getPopinavaLogs.mockReset();
});

describe('PopiNavaPage — Riwayat Log', () => {
  it('Super Admin: state memuat → baris /popinava/logs tampil terurut seperti kiriman server', async () => {
    let settle;
    getPopinavaLogs.mockReturnValue(new Promise((r) => { settle = r; }));
    renderPage();
    await screen.findByText('13 brand · 88 outlet');

    fireEvent.click(screen.getByRole('button', { name: 'Riwayat Log' }));
    expect(await screen.findByText('Memuat riwayat…')).toBeInTheDocument();

    settle([
      { id: 1, time: '2026-01-03T08:00:00.000Z', who: 'IT Integrasi', action: 'Hapus outlet', detail: null, category: 'popinava' },
      { id: 2, time: '2026-01-02T10:00:00.000Z', who: 'IT Integrasi', action: 'Ubah outlet', detail: 'Toko A', category: 'popinava' },
    ]);

    const dlg = await screen.findByRole('dialog', { name: 'Aktivitas POPI NAVA' });
    expect(await within(dlg).findByText('Ubah outlet')).toBeInTheDocument();
    expect(within(dlg).getByText('Hapus outlet')).toBeInTheDocument();
    // Urutan mengikuti server (terbaru di atas): Hapus (03-01) sebelum Ubah (02-01).
    const names = within(dlg).getAllByRole('listitem').map((li) => li.textContent);
    expect(names[0]).toContain('Hapus outlet');
    expect(names[1]).toContain('Ubah outlet');
    expect(within(dlg).getByText('2 aktivitas')).toBeInTheDocument();
    expect(within(dlg).getByText('Riwayat Log')).toBeInTheDocument();
    expect(within(dlg).getByText('oleh IT Integrasi · POPI NAVA · Toko A')).toBeInTheDocument();
    expect(getPopinavaLogs).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dlg).getByRole('button', { name: 'Tutup riwayat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('gagal memuat log → pesan jujur tanpa server', async () => {
    getPopinavaLogs.mockRejectedValue(new TypeError('network down'));
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
    expect(getPopinavaLogs).not.toHaveBeenCalled();
  });
});
