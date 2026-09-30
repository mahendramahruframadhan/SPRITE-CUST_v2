// HistoryTracking — timeline riwayat (adaptasi OrderTracking ke gaya repo).
// Jalankan: npm run test:ui
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoryTracking } from '../src/components/ui/HistoryTracking.jsx';

const STEPS = [
  { id: 1, name: 'Tambah outlet', timestamp: '1 Jan 2026 10:00', description: 'oleh IT Integrasi · ITTEST · Toko IT', isCompleted: true },
  { id: 2, name: 'Nonaktifkan outlet', timestamp: '1 Jan 2026 11:00', description: 'oleh IT Integrasi · active → inactive', isCompleted: true },
  { id: 3, name: 'Aktifkan outlet', timestamp: 'Pending', description: 'oleh IT Integrasi', isCompleted: false },
];

describe('HistoryTracking', () => {
  it('merender tiap step: nama, waktu, dan deskripsi (pelaku + detail)', () => {
    render(<HistoryTracking steps={STEPS} />);
    expect(screen.getByText('Tambah outlet')).toBeInTheDocument();
    expect(screen.getByText('1 Jan 2026 10:00')).toBeInTheDocument();
    expect(screen.getByText('oleh IT Integrasi · ITTEST · Toko IT')).toBeInTheDocument();
    expect(screen.getByText('Nonaktifkan outlet')).toBeInTheDocument();
    expect(screen.getByText('oleh IT Integrasi · active → inactive')).toBeInTheDocument();
    // Struktur daftar kronologis untuk aksesibilitas.
    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('tanpa step → empty state berbahasa Indonesia', () => {
    render(<HistoryTracking steps={[]} />);
    expect(screen.getByText('Belum ada riwayat untuk outlet ini.')).toBeInTheDocument();
  });

  it('step tanpa description tetap aman (baris opsional tidak dipaksakan)', () => {
    render(<HistoryTracking steps={[{ name: 'Ubah outlet', timestamp: '2 Jan 2026 09:00', isCompleted: true }]} />);
    expect(screen.getByText('Ubah outlet')).toBeInTheDocument();
    expect(screen.queryByText(/^oleh /)).toBeNull();
  });
});
