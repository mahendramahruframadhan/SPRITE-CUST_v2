// Tab Laporan Audit POPI NAVA — vitest + Testing Library (jsdom).
// Jalankan: npm run test:ui
// Mencakup: ringkasan status per bulan, daftar per minggu/brand, dan
// navigasi bulan yang dibagi dengan tab Jadwal Audit.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import AuditReport from '../src/components/popinava/AuditReport.jsx';
import { monthKeyOf, shiftMonthKey } from '../src/lib/auditSchedule.js';

const MK = monthKeyOf(new Date());

const OUTLETS = [
  { uuid: 'u1', brandName: 'Chambers', deptChannelName: 'Chambers Tebet', city: 'JAKARTA', rvtCustcode: 'RVT-CHM' },
  { uuid: 'u2', brandName: 'Chambers', deptChannelName: 'Chambers Bekasi', city: 'BEKASI', rvtCustcode: 'RVT-CHM' },
  { uuid: 'u3', brandName: 'SCH', deptChannelName: 'SCH Puri', city: 'YOGYAKARTA', rvtCustcode: 'RVT-SCH' },
];

function seed(weeks) {
  localStorage.setItem(
    'sprite.auditSchedule.v1',
    JSON.stringify({ [MK]: { month: MK, weeks: { W1: [], W2: [], W3: [], W4: [], W5: [], ...weeks } } }),
  );
}

function renderReport(onMonthChange = vi.fn()) {
  return render(
    <ToastProvider>
      <AuditReport outlets={OUTLETS} monthKey={MK} onMonthChange={onMonthChange} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('network down')));
});
afterEach(() => vi.unstubAllGlobals());

describe('AuditReport — laporan audit bulanan', () => {
  it('meringkas total/sudah/belum dan menampilkan toko per minggu/brand', async () => {
    seed({
      W1: [{ id: 'b1', type: 'brand', brand: 'Chambers', audited: true }],
      W2: [{ id: 'o1', type: 'outlet', uuid: 'u3', brand: 'SCH', name: 'SCH Puri' }],
    });
    renderReport();

    expect(await screen.findByText('Total toko')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();

    const w1 = screen.getByRole('region', { name: /^W1/ });
    expect(within(w1).getByText('Chambers')).toBeInTheDocument();
    expect(within(w1).getByText('Chambers Tebet')).toBeInTheDocument();
    expect(within(w1).getByText('Chambers Bekasi')).toBeInTheDocument();
    expect(within(w1).getAllByText('Sudah audit').length).toBe(2);

    const w2 = screen.getByRole('region', { name: /^W2/ });
    expect(within(w2).getByText('SCH Puri')).toBeInTheDocument();
    expect(within(w2).getByText('Belum audit')).toBeInTheDocument();
  });

  it('tombol navigasi bulan memanggil onMonthChange dengan bulan berikutnya', async () => {
    seed({ W1: [{ id: 'b1', type: 'brand', brand: 'Chambers', audited: true }] });
    const onMonthChange = vi.fn();
    renderReport(onMonthChange);
    await screen.findByText('Total toko');
    fireEvent.click(screen.getByRole('button', { name: 'Bulan berikutnya' }));
    expect(onMonthChange).toHaveBeenCalledWith(shiftMonthKey(MK, 1));
  });

  it('bulan tanpa jadwal menampilkan empty state', async () => {
    seed({});
    renderReport();
    expect(await screen.findByText('Belum ada toko terjadwal bulan ini.')).toBeInTheDocument();
    expect(screen.queryByText('Total toko')).not.toBeInTheDocument();
  });
});
