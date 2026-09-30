// Halaman POPI NAVA — vitest + Testing Library (jsdom).
// Jalankan: npm run test:ui
// Mencakup spec §14: penyembunyian tombol tulis saat role tanpa izin
// popinava, plus keterbacaan mode lokal & data seed di tabel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import { ConfirmProvider } from '../src/components/ui/ConfirmProvider.jsx';
import PopiNavaPage from '../src/pages/PopiNavaPage.jsx';

const izin = vi.hoisted(() => ({ canWrite: true }));

// Render penuh (88 baris seed + probe) bisa >5s saat file test paralel
// berebut CPU; timeout default vitest terlalu sempit untuk ini.
vi.setConfig({ testTimeout: 15000 });

vi.mock('../src/hooks/usePermissions.js', () => ({
  usePermissions: () => ({ can: () => izin.canWrite, perms: {}, role: 'Super Admin' }),
  DEFAULT_PERMS: {},
  ROUTE_PERM: {},
  menuPerm: (x) => x,
}));

// Probe fetch sengaja biarkan gagal → halaman harus masuk mode lokal dengan
// data seed (bukan crash), sesuai desain fase frontend.
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
});

describe('PopiNavaPage', () => {
  it('role berizin: tombol Impor, Ekspor, dan Tambah Outlet tampil', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /Tambah Outlet/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Impor$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ekspor/ })).toBeInTheDocument();
  });

  it('tanpa izin popinava: semua tombol tulis tersembunyi (§15.8)', async () => {
    izin.canWrite = false;
    renderPage();
    await screen.findByText(/Mode lokal/);
    expect(screen.queryByRole('button', { name: /Tambah Outlet/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Impor$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ekspor/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nonaktifkan/ })).toBeNull();
  });

  it('probe gagal → badge mode lokal jujur, data seed tetap tampil', async () => {
    renderPage();
    expect(await screen.findByText(/Mode lokal: backend \/popinava belum tersambung/)).toBeInTheDocument();
    // View default kategori: 13 brand dari 88 baris seed (footer tabel
    // "88 baris cocok" hanya ada di mode Tabel).
    expect(await screen.findByText('13 brand · 88 outlet')).toBeInTheDocument();
    const brandSelect = await screen.findByLabelText('Brand');
    expect(brandSelect).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'MAYOUTFIT' })).toBeInTheDocument();
    });
    expect(screen.getAllByText('HAPPY GO LUCKY').length).toBeGreaterThan(0);
  });

  it('drawer terbuka dari Tambah Outlet dan menutup dengan Escape', async () => {
    renderPage();
    const btn = await screen.findByRole('button', { name: /Tambah Outlet/ });
    fireEvent.click(btn);
    const dialog = await screen.findByRole('dialog', { name: /Tambah outlet/ });
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Tambah outlet/ })).toBeNull());
  });

  it('sort, filter brand, dan pagination benar-benar berubah saat diklik', async () => {
    renderPage();
    // Pagination hanya ada di mode Tabel (default = kategori Per brand).
    fireEvent.click(await screen.findByRole('button', { name: 'Tabel' }));
    await screen.findByText('88 baris cocok · halaman 1 dari 2');

    // Sort: klik header kolom "Kota" → aria-sort naik di th yang sama.
    const sortKota = screen.getByRole('button', { name: 'Kota' });
    fireEvent.click(sortKota);
    await waitFor(() => expect(sortKota.closest('th')).toHaveAttribute('aria-sort', 'ascending'));

    // Pagination: Berikutnya → halaman 2 dari 2, Sebelumnya aktif.
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    await screen.findByText('88 baris cocok · halaman 2 dari 2');
    expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeEnabled();

    // Filter brand: total baris berubah (bukan lagi 88) dan page reset ke 1.
    const brandSelect = screen.getByLabelText('Brand');
    const target = Array.from(brandSelect.options).find((o) => o.value !== '');
    fireEvent.change(brandSelect, { target: { value: target.value } });
    await waitFor(() => {
      expect(screen.getByText(/baris cocok/).textContent).not.toMatch(/^88 /);
    });
    expect(screen.getByText(/baris cocok · halaman 1 dari/)).toBeInTheDocument();
  });
});

describe('PopiNavaPage · view kategori Per brand', () => {
  it('default: 13 grup brand A→Z, semua collapsed, tanpa pagination', async () => {
    renderPage();
    await screen.findByText('13 brand · 88 outlet');
    // Footer pagination tidak ada di mode kategori.
    expect(screen.queryByText(/baris cocok/)).toBeNull();
    // Semua header brand aria-expanded=false dan child (baris aksi) tidak ada.
    expect(screen.queryAllByRole('button', { name: /^Ubah / }).length).toBe(0);
    const first = screen.getByRole('button', { name: /308 ABSOLUTE/ });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    // Urutan grup A→Z (localeCompare id): 308 ABSOLUTE sebelum AMIMI.
    // Filter aria-controls=pn-group-* supaya tombol Ekspor (aria-expanded=false) tidak ikut.
    const headers = screen
      .getAllByRole('button', { expanded: false })
      .filter((b) => (b.getAttribute('aria-controls') || '').startsWith('pn-group-'))
      .map((b) => b.textContent);
    expect(headers.length).toBe(13);
    expect(headers[0]).toContain('308 ABSOLUTE');
    expect(headers[1]).toContain('AMIMI');
  });

  it('klik header brand membuka children-nya (aria-expanded berubah)', async () => {
    renderPage();
    await screen.findByText('13 brand · 88 outlet');
    const brandBtn = screen.getByRole('button', { name: /HAPPY GO LUCKY/ });
    expect(brandBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(brandBtn);
    await waitFor(() => expect(brandBtn).toHaveAttribute('aria-expanded', 'true'));
    // Outlet HAPPY GO LUCKY muncul (aksi baris per channel).
    expect(screen.getAllByRole('button', { name: /^Ubah / }).length).toBeGreaterThan(0);
    // Klik lagi → tutup.
    fireEvent.click(brandBtn);
    await waitFor(() => expect(brandBtn).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryAllByRole('button', { name: /^Ubah / }).length).toBe(0);
  });

  it('Buka semua membuka 88 baris, Tutup semua menutup kembali', async () => {
    renderPage();
    await screen.findByText('13 brand · 88 outlet');
    fireEvent.click(screen.getByRole('button', { name: 'Buka semua' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Ubah / }).length).toBe(88));
    fireEvent.click(screen.getByRole('button', { name: 'Tutup semua' }));
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /^Ubah / }).length).toBe(0));
  });

  it('pencarian aktif → grup yang cocok otomatis terbuka', async () => {
    renderPage();
    await screen.findByText('13 brand · 88 outlet');
    expect(screen.queryAllByRole('button', { name: /^Ubah / }).length).toBe(0);
    fireEvent.change(screen.getByLabelText('Cari'), { target: { value: 'FLAGSHIP BANDUNG' } });
    // Debounce 300 ms; setelah itu child yang match tampil tanpa klik brand.
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /^Ubah / }).length).toBeGreaterThan(0),
      { timeout: 3000 },
    );
  });

  it('toggle ke Tabel memunculkan pagination; kembali ke Per brand menyembunyikannya', async () => {
    renderPage();
    await screen.findByText('13 brand · 88 outlet');
    fireEvent.click(screen.getByRole('button', { name: 'Tabel' }));
    await screen.findByText('88 baris cocok · halaman 1 dari 2');
    fireEvent.click(screen.getByRole('button', { name: 'Per brand' }));
    await screen.findByText('13 brand · 88 outlet');
    expect(screen.queryByText(/baris cocok/)).toBeNull();
  });
});
