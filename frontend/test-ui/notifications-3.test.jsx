// NotificationsBlock (ui/notifications-3.jsx) — daftar notifikasi antar-user
// di dropdown lonceng: filter Semua/Belum dibaca, tandai dibaca & semua, hapus.
// Jalankan: npm run test:ui
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationsBlock from '../src/components/ui/notifications-3.jsx';

const items = [
  { id: 'n1', type: 'pesanan', title: 'Kasus A perlu dicek', body: 'Update status kasus A menunggu validasi.', link: '/kasus', createdAt: new Date().toISOString(), readAt: null },
  { id: 'n2', type: 'pesanan', title: 'Kasus B selesai', body: '', link: null, createdAt: new Date().toISOString(), readAt: '2026-01-01T00:00:00Z' },
];

const renderBlock = (props = {}) =>
  render(
    <NotificationsBlock
      items={props.items ?? items}
      onOpen={props.onOpen ?? vi.fn()}
      onMarkRead={props.onMarkRead ?? vi.fn()}
      onMarkAllRead={props.onMarkAllRead ?? vi.fn()}
      onDelete={props.onDelete ?? vi.fn()}
      {...props}
    />,
  );

describe('NotificationsBlock', () => {
  it('merender daftar asli: judul, body, waktu relatif, dot unread', () => {
    renderBlock();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Kasus A perlu dicek')).toBeInTheDocument();
    expect(screen.getByText('Update status kasus A menunggu validasi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Belum dibaca/ })).toBeInTheDocument();
  });

  it('chip "Belum dibaca" berisi jumlah unread dan menyaring daftar', () => {
    renderBlock();
    expect(screen.getByRole('button', { name: /Belum dibaca/ })).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /Belum dibaca/ }));
    expect(screen.queryByText('Kasus B selesai')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('klik baris = tandai dibaca lalu onOpen(notif)', async () => {
    const onOpen = vi.fn();
    const onMarkRead = vi.fn();
    renderBlock({ onOpen, onMarkRead });
    fireEvent.click(screen.getByText('Kasus A perlu dicek'));
    await waitFor(() => {
      expect(onMarkRead).toHaveBeenCalledWith('n1');
      expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }));
    });
  });

  it('hapus hanya menghapus, tidak membuka notif', () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    renderBlock({ onOpen, onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'Hapus notifikasi Kasus A perlu dicek' }));
    expect(onDelete).toHaveBeenCalledWith('n1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('tombol tandai-dibaca memanggil onMarkAllRead dan mati saat tidak ada unread', () => {
    const onMarkAllRead = vi.fn();
    const { rerender, unmount } = renderBlock({ onMarkAllRead });
    fireEvent.click(screen.getByRole('button', { name: 'Tandai dibaca' }));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    unmount();

    const allRead = items.map((n) => ({ ...n, readAt: '2026-01-01T00:00:00Z' }));
    render(<NotificationsBlock items={allRead} onMarkAllRead={onMarkAllRead} />);
    const btn = screen.getByRole('button', { name: 'Tandai dibaca' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('belum termuat → loading, kosong → empty state', () => {
    const { unmount } = render(<NotificationsBlock items={[]} ready={false} />);
    expect(screen.getByText(/Memuat notifikasi/i)).toBeInTheDocument();
    unmount();
    renderBlock({ items: [] });
    expect(screen.getByText('Belum ada notifikasi')).toBeInTheDocument();
  });

  it('filter unread kosong → "Semua sudah dibaca"', () => {
    const allRead = items.map((n) => ({ ...n, readAt: '2026-01-01T00:00:00Z' }));
    renderBlock({ items: allRead });
    fireEvent.click(screen.getByRole('button', { name: /Belum dibaca/ }));
    expect(screen.getByText('Semua sudah dibaca')).toBeInTheDocument();
  });
});
