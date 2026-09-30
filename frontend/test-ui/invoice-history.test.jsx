// InvoiceHistoryModal — riwayat kasus sebagai timeline HistoryTracking.
// Jalankan: npm run test:ui
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InvoiceHistoryModal from '../src/components/InvoiceHistoryModal.jsx';

const ITEMS = [
  { who: 'IT Integrasi', action: 'Upload PDF', detail: 'invoice.pdf', createdAt: '2026-01-01T10:00:00', category: 'Invoice' },
  { who: 'Sistem', action: 'Status invoice baru', createdAt: '2026-01-02T11:00:00', category: 'Validasi' },
];

describe('InvoiceHistoryModal', () => {
  it('merender riwayat sebagai timeline HistoryTracking (aksi, pelaku, kategori, detail)', () => {
    render(<InvoiceHistoryModal title="Kasus A" history={ITEMS} onClose={() => {}} />);
    expect(screen.getByText('Upload PDF')).toBeInTheDocument();
    expect(screen.getByText('Status invoice baru')).toBeInTheDocument();
    // Deskripsi: pelaku ("oleh ..."), kategori, dan detail tetap terlihat.
    expect(screen.getByText('oleh IT Integrasi · Invoice · invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('Sistem · otomatis · Validasi')).toBeInTheDocument();
    // Struktur daftar kronologis HistoryTracking.
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('tanpa riwayat → empty state', () => {
    render(<InvoiceHistoryModal title="Kasus A" history={[]} onClose={() => {}} />);
    expect(screen.getByText('Belum ada riwayat tercatat.')).toBeInTheDocument();
  });
});
