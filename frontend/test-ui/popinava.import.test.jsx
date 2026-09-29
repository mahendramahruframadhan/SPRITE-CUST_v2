// Alur impor penuh memakai file sumber ASLI (DOC. CUSTOMER ACTIVE.xlsx) —
// vitest + Testing Library (jsdom) + SheetJS nyata.
// Jalankan: npm run test:ui
// Membuktikan acceptance §15.1-15.3: preview 88 baris / 0 error / 44
// peringatan, commit pertama created=88 (dari keadaan kosong), commit kedua
// idempoten (created=0, updated=88).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import { ConfirmProvider } from '../src/components/ui/ConfirmProvider.jsx';
import PopiNavaPage from '../src/pages/PopiNavaPage.jsx';

const FILE_PATH = resolve(
  __dirname,
  '../../../readme mitigasi vide codding sop/temp/DOC. CUSTOMER ACTIVE.xlsx'
);

vi.mock('../src/hooks/usePermissions.js', () => ({
  usePermissions: () => ({ can: () => true, perms: {}, role: 'Super Admin' }),
  DEFAULT_PERMS: {},
  ROUTE_PERM: {},
  menuPerm: (x) => x,
}));

vi.stubGlobal('fetch', () => Promise.reject(new TypeError('network down')));

const sourceFile = () =>
  new File([readFileSync(FILE_PATH)], 'DOC. CUSTOMER ACTIVE.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

function renderPage() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <PopiNavaPage />
      </ConfirmProvider>
    </ToastProvider>
  );
}

async function uploadSourceFile() {
  fireEvent.click(await screen.findByRole('button', { name: /^Impor$/ }));
  const dialog = await screen.findByRole('dialog', { name: /Impor data outlet/ });
  const input = within(dialog).getByLabelText('Pilih file impor outlet');
  fireEvent.change(input, { target: { files: [sourceFile()] } });
  return dialog;
}

beforeEach(() => {
  localStorage.clear();
  // Keadaan "belum ada data" untuk membuktikan commit pertama = created 88.
  localStorage.setItem('sprite.popinava.v1', '[]');
});

describe('wizard impor dengan file sumber asli', () => {
  it('preview: 88 baris, 0 error, 44 peringatan, 53 koreksi shift (§15.1)', async () => {
    renderPage();
    const dialog = await uploadSourceFile();

    expect(await within(dialog).findByText('88 baris terbaca')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Valid (88)' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Peringatan (44)' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Error (0)' })).toBeInTheDocument();

    // Daftar normalisasi: 53 shift + 264 placeholder "-" + 2 alamat "-" = 319.
    const normBtn = within(dialog).getByRole('button', { name: /Normalisasi yang dilakukan/ });
    expect(normBtn).toHaveTextContent('Normalisasi yang dilakukan (319)');
    fireEvent.click(normBtn);
    const shiftLines = within(dialog).getAllByText(/country\/area\/region/);
    expect(shiftLines.length).toBe(53);

    // Tombol impor aktif (tanpa error) dan menyebut jumlah baris valid.
    const importBtn = within(dialog).getByRole('button', { name: 'Impor 88 Baris' });
    expect(importBtn).toBeEnabled();

    // Commit pertama dari keadaan kosong → 88 baris baru (§15.2).
    fireEvent.click(importBtn);
    const ddBaru = await within(dialog).findByText('Baris baru');
    expect(ddBaru.nextElementSibling).toHaveTextContent('88');
    expect(within(dialog).getByText('Tutup')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Tutup'));

    // Tabel menampilkan 88 baris dan 13 brand di dropdown filter (§15.2).
    expect(await screen.findByText('88 baris cocok · halaman 1 dari 2')).toBeInTheDocument();
    const brandSelect = await screen.findByLabelText('Brand');
    expect(brandSelect.options.length).toBe(14); // 13 brand + "Semua brand"
  }, 30000);

  it('commit kedua file sama → idempoten: created 0, updated 88 (§15.3)', async () => {
    renderPage();
    await uploadSourceFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Impor 88 Baris' }));
    fireEvent.click(await screen.findByText('Tutup'));

    // Impor ulang file yang sama.
    const dialog = await uploadSourceFile();
    expect(await within(dialog).findByText('88 baris terbaca')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Impor 88 Baris' }));

    const ddBaru = await within(dialog).findByText('Baris baru');
    expect(ddBaru.nextElementSibling).toHaveTextContent('0');
    expect(within(dialog).getByText('Diperbarui').nextElementSibling).toHaveTextContent('88');
  }, 30000);
});
