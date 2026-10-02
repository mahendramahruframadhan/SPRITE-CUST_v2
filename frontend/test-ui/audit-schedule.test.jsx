// Komponen Jadwal Audit (tab baru Popi Nava) — vitest + Testing Library.
// Jalankan: npm run test:ui
// Mencakup: kartu W1-W4, navigasi bulan, alur tambah brand/outlet via drawer,
// pindah minggu, dan empty state.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import { ConfirmProvider } from '../src/components/ui/ConfirmProvider.jsx';
import AuditSchedule from '../src/components/popinava/AuditSchedule.jsx';
import { formatMonthLabel, monthKeyOf } from '../src/lib/auditSchedule.js';

const OUTLETS = [
  { uuid: 'u1', brandName: 'Chambers', deptChannelName: 'Chambers Tebet', status: 'active' },
  { uuid: 'u2', brandName: 'Chambers', deptChannelName: 'Chambers Bekasi', status: 'active' },
  { uuid: 'u3', brandName: 'SCH', deptChannelName: 'SCH Puri', status: 'active' },
];

function renderSchedule(props = {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <AuditSchedule outlets={OUTLETS} canWrite {...props} />
      </ConfirmProvider>
    </ToastProvider>
  );
}

beforeEach(() => localStorage.clear());

describe('AuditSchedule', () => {
  it('menampilkan 4 kartu minggu W1-W4 dengan rentang hari kerja', async () => {
    renderSchedule();
    expect(await screen.findByRole('heading', { name: 'W1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'W2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'W3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'W4' })).toBeInTheDocument();
    // Rentang hari kerja tampil (contoh: "2-6 Feb" style) di bawah label.
    expect(screen.getAllByText(/\d+-\d+\s\w+/).length).toBeGreaterThan(0);
  });

  it('label bulan mengikuti bulan aktif dan tombol navigasi berpindah bulan', async () => {
    renderSchedule();
    const thisMonth = formatMonthLabel(monthKeyOf(new Date()));
    expect(await screen.findByText(thisMonth)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Bulan berikutnya/ }));
    const next = formatMonthLabel(monthKeyOf(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)));
    await waitFor(() => expect(screen.getByText(next)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Bulan sebelumnya/ }));
    await waitFor(() => expect(screen.getByText(thisMonth)).toBeInTheDocument());
  });

  it('alur tambah: buka drawer dari W1, pilih brand, simpan, item muncul di kartu W1', async () => {
    renderSchedule();
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    const card = w1.closest('section');
    fireEvent.click(within(card).getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: /Tambah jadwal/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pilih brand Chambers' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan jadwal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(card).getByText('Chambers')).toBeInTheDocument();
  });

  it('item bisa dipindah ke minggu lain lewat select pindah', async () => {
    renderSchedule();
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    const card1 = w1.closest('section');
    fireEvent.click(within(card1).getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: /Tambah jadwal/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pilih brand SCH' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan jadwal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const moveSelect = within(card1).getByRole('combobox', { name: /Pindah minggu SCH/ });
    fireEvent.change(moveSelect, { target: { value: 'W4' } });
    const w4 = await screen.findByRole('heading', { name: 'W4' });
    await waitFor(() => expect(within(w4.closest('section')).getByText('SCH')).toBeInTheDocument());
    expect(within(card1).queryByText('SCH')).not.toBeInTheDocument();
  });

  it('empty state memberi CTA tambah jadwal pertama', async () => {
    renderSchedule();
    expect(await screen.findByText(/Belum ada jadwal audit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tambah jadwal pertama/ })).toBeInTheDocument();
  });

  it('tanpa izin tulis: tombol tambah & aksi item tidak muncul', async () => {
    renderSchedule({ canWrite: false });
    await screen.findByRole('heading', { name: 'W1' });
    expect(screen.queryAllByRole('button', { name: 'Tambah' })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Tambah jadwal pertama/ })).not.toBeInTheDocument();
  });
});
