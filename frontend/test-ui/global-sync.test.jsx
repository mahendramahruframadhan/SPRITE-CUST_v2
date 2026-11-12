// GlobalSyncButton — tombol ikon sinkron Google Sheets di header semua halaman.
// Jalankan: npm run test:ui
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import GlobalSyncButton from '../src/components/GlobalSyncButton.jsx';
import { triggerSync } from '../src/lib/api.js';

const izin = vi.hoisted(() => ({ boleh: true }));

vi.mock('../src/hooks/usePermissions.js', () => ({
  usePermissions: () => ({ can: () => izin.boleh, perms: {}, role: 'Super Admin' }),
  DEFAULT_PERMS: {},
  ROUTE_PERM: {},
  menuPerm: (x) => x,
}));

vi.mock('../src/lib/api.js', () => ({
  triggerSync: vi.fn(),
}));

function renderTombol(props = {}) {
  return render(
    <ToastProvider>
      <GlobalSyncButton {...props} />
    </ToastProvider>
  );
}

beforeEach(() => {
  izin.boleh = true;
  triggerSync.mockReset();
});

describe('GlobalSyncButton', () => {
  it('tampil sebagai tombol ikon berlabel untuk pengguna berizin roles', () => {
    renderTombol();
    const btn = screen.getByRole('button', { name: 'Sinkron dari Google Sheets' });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeEnabled();
  });

  it('tersembunyi untuk pengguna tanpa izin roles', () => {
    izin.boleh = false;
    renderTombol();
    expect(screen.queryByRole('button', { name: 'Sinkron dari Google Sheets' })).toBeNull();
  });

  it('klik memicu triggerSync lalu onSynced setelah sukses, dengan toast hasil', async () => {
    const onSynced = vi.fn();
    triggerSync.mockResolvedValue({ ok: true, rows: 12, readRows: 12, unchanged: 0, durationMs: 1500 });
    renderTombol({ onSynced });

    fireEvent.click(screen.getByRole('button', { name: 'Sinkron dari Google Sheets' }));

    expect(await screen.findByText(/12 baris baru\/berubah/)).toBeInTheDocument();
    expect(triggerSync).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it('gagal sync menampilkan toast error dan tidak memuat ulang halaman', async () => {
    const onSynced = vi.fn();
    triggerSync.mockRejectedValue(new Error('Gagal membaca Google Sheets.'));
    renderTombol({ onSynced });

    fireEvent.click(screen.getByRole('button', { name: 'Sinkron dari Google Sheets' }));

    expect(await screen.findByText('Gagal membaca Google Sheets.')).toBeInTheDocument();
    expect(onSynced).not.toHaveBeenCalled();
  });

  it('respons ok:false diperlakukan sebagai gagal, bukan sukses palsu', async () => {
    const onSynced = vi.fn();
    triggerSync.mockResolvedValue({ ok: false, error: 'Sinkron ditolak backend' });
    renderTombol({ onSynced });

    fireEvent.click(screen.getByRole('button', { name: 'Sinkron dari Google Sheets' }));

    expect(await screen.findByText('Sinkron ditolak backend')).toBeInTheDocument();
    expect(onSynced).not.toHaveBeenCalled();
  });

  it('sedang sync: tombol disabled, aria-busy aktif, klik ganda tidak memicu request kedua', async () => {
    let selesai;
    triggerSync.mockImplementation(
      () => new Promise((resolve) => { selesai = () => resolve({ ok: true, rows: 1, readRows: 1 }); })
    );
    renderTombol();

    const btn = screen.getByRole('button', { name: 'Sinkron dari Google Sheets' });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveAttribute('aria-busy', 'true');

    fireEvent.click(btn);
    expect(triggerSync).toHaveBeenCalledTimes(1);

    selesai();
    await waitFor(() => expect(btn).toBeEnabled());
  });

  it('tidak ada perubahan: pesan jujur "sudah sinkron"', async () => {
    triggerSync.mockResolvedValue({ ok: true, rows: 0, readRows: 40, unchanged: 40, durationMs: 900 });
    renderTombol();

    fireEvent.click(screen.getByRole('button', { name: 'Sinkron dari Google Sheets' }));

    expect(await screen.findByText(/Sudah sinkron — tidak ada perubahan/)).toBeInTheDocument();
  });
});
