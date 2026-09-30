// LogsPage — Riwayat Aktivitas sebagai timeline HistoryTracking.
// Jalankan: npm run test:ui
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LogsPage from '../src/pages/LogsPage.jsx';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import { getLogs } from '../src/lib/api.js';

vi.mock('../src/lib/api.js', () => ({ getLogs: vi.fn() }));
vi.mock('../src/lib/activity.js', () => ({ readLocalActivity: vi.fn(() => []) }));

const renderPage = () => render(<ToastProvider><LogsPage /></ToastProvider>);

describe('LogsPage', () => {
  it('merender aktivitas sebagai timeline HistoryTracking (teks, waktu, pelaku, kategori)', async () => {
    getLogs.mockResolvedValue([
      { id: 1, created_at: '2026-01-01T10:00:00', who: 'IT Integrasi', action: 'Menambah kasus', detail: 'Kasus A', category: 'Penambahan' },
    ]);
    renderPage();
    expect(await screen.findByText('Menambah kasus — Kasus A')).toBeInTheDocument();
    expect(screen.getByText('oleh IT Integrasi · Penambahan')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('pencarian menyaring timeline', async () => {
    getLogs.mockResolvedValue([
      { id: 1, created_at: '2026-01-01T10:00:00', who: 'IT Integrasi', action: 'Menambah kasus', detail: 'Kasus A' },
      { id: 2, created_at: '2026-01-02T10:00:00', who: 'Admin CS', action: 'Mengubah status', detail: 'Kasus B' },
    ]);
    renderPage();
    await screen.findByText('Menambah kasus — Kasus A');
    fireEvent.change(screen.getByPlaceholderText('Cari pelaku / aktivitas...'), { target: { value: 'Admin' } });
    await waitFor(() => {
      expect(screen.queryByText('Menambah kasus — Kasus A')).toBeNull();
      expect(screen.getByText('Mengubah status — Kasus B')).toBeInTheDocument();
    });
  });

  it('tanpa aktivitas → empty state', async () => {
    getLogs.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Belum ada aktivitas tercatat/)).toBeInTheDocument();
  });
});
