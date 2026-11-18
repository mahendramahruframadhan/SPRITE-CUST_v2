// Tab rekap /report: navigasi tab, KPI, tabel, dan empty state.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import RecapTabs from '../src/components/report/RecapTabs.jsx';
import RecapPanel from '../src/components/report/RecapPanel.jsx';
import { findRecapTab } from '../src/config/recapTabs.js';

afterEach(() => vi.restoreAllMocks());

describe('RecapTabs', () => {
  it('menampilkan Ringkasan + 11 tab dan memanggil onChange saat dipilih', () => {
    const onChange = vi.fn();
    render(<RecapTabs active="ringkasan" onChange={onChange} />);
    const select = screen.getByLabelText('Pilih tampilan laporan');
    expect(within(select).getAllByRole('option')).toHaveLength(12);
    expect(select).toHaveValue('ringkasan');
    expect(within(select).getByRole('option', { name: 'Finance ON-CALL' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'brands' } });
    expect(onChange).toHaveBeenCalledWith('brands');
  });

  it('menampilkan tab aktif sesuai URL dan opsi terakhir tetap tersedia', () => {
    render(<RecapTabs active="quality" onChange={() => {}} />);
    const select = screen.getByLabelText('Pilih tampilan laporan');
    expect(select).toHaveValue('quality');
    expect(within(select).getByRole('option', { name: 'Data Quality & Sync' })).toBeInTheDocument();
  });
});

describe('RecapPanel', () => {
  const tab = findRecapTab('workload');
  const data = {
    kpis: { total: 3, activeUsers: 2, onCall: 2, open: 1, validated: 1 },
    rows: [
      { user: 'RAMA', count: 2, onCall: 2, monthly: 0, free: 0, lainnya: 0, done: 1, open: 1, validated: 1, onCallSubtotal: 1500000, brandCount: 1, moduleCount: 1 },
    ],
  };

  it('menampilkan KPI dan baris tabel', () => {
    render(<RecapPanel tab={tab} data={data} periode="2026-11-01 s.d. 2026-11-30" />);
    expect(screen.getByRole('heading', { name: 'Beban Kerja User' })).toBeInTheDocument();
    expect(screen.getByText('Total Kasus')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('RAMA')).toBeInTheDocument();
    expect(within(table).getByText('Rp 1.500.000')).toBeInTheDocument();
    expect(screen.getByText(/Kasus periode/)).toBeInTheDocument();
  });

  it('menampilkan empty state khusus tab', () => {
    render(<RecapPanel tab={tab} data={{ kpis: {}, rows: [] }} />);
    expect(screen.getByText('Tidak ada kasus pada periode ini.')).toBeInTheDocument();
  });

  it('menampilkan baris total untuk rekap finance', () => {
    const financeTab = findRecapTab('finance');
    const data = {
      kpis: { count: 2, validated: 1, unvalidated: 1, charges: 1000000, ppn: 100000, subtotal: 1100000, paid: 0, outstanding: 1100000 },
      rows: [{ brand: 'BRAND-A', count: 2, validated: 1, unvalidated: 1, charges: 1000000, ppn: 100000, subtotal: 1100000, paid: 0, outstanding: 1100000 }],
      totals: { count: 2, validated: 1, unvalidated: 1, charges: 1000000, ppn: 100000, subtotal: 1100000, paid: 0, outstanding: 1100000 },
    };
    render(<RecapPanel tab={financeTab} data={data} />);
    const totalRow = screen.getByRole('row', { name: /^Total\b/ });
    expect(within(totalRow).getAllByText('Rp 1.100.000')).toHaveLength(2);
  });

  it('tombol cetak memanggil print dan menandai section', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<RecapPanel tab={tab} data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cetak Beban Kerja User' }));
    expect(print).toHaveBeenCalled();
    expect(document.querySelector('[data-section="recap-workload"]')).toHaveClass('print-keep');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('[data-section="recap-workload"]')).not.toHaveClass('print-keep');
  });
});
