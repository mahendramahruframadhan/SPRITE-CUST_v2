// Uji ConfirmModal promise-based — vitest + Testing Library (jsdom).
// Jalankan: npm run test:ui
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from '../src/components/ui/ConfirmProvider.jsx';

function Peminta({ opsi }) {
  const confirm = useConfirm();
  const [hasil, setHasil] = useState('belum');
  return (
    <div>
      <button
        onClick={async () => {
          const ok = await confirm(opsi);
          setHasil(ok ? 'YA' : 'TIDAK');
        }}
      >
        minta
      </button>
      <p data-testid="hasil">{hasil}</p>
    </div>
  );
}

const bungkus = (opsi) => render(
  <ConfirmProvider>
    <Peminta opsi={opsi} />
  </ConfirmProvider>
);

const OPSI_BAHAYA = {
  title: 'Hapus permanen?',
  description: 'Data ini tidak bisa dikembalikan.',
  variant: 'danger',
  confirmLabel: 'Hapus',
};

describe('useConfirm + ConfirmModal', () => {
  it('resolve(true) saat Confirm diklik', async () => {
    bungkus(OPSI_BAHAYA);
    fireEvent.click(screen.getByText('minta'));
    fireEvent.click(await screen.findByText('Hapus'));
    await waitFor(() => expect(screen.getByTestId('hasil')).toHaveTextContent('YA'));
  });

  it('resolve(false) saat Batal diklik', async () => {
    bungkus(OPSI_BAHAYA);
    fireEvent.click(screen.getByText('minta'));
    fireEvent.click(await screen.findByText('Batal'));
    await waitFor(() => expect(screen.getByTestId('hasil')).toHaveTextContent('TIDAK'));
  });

  it('resolve(false) saat Escape ditekan', async () => {
    bungkus(OPSI_BAHAYA);
    fireEvent.click(screen.getByText('minta'));
    await screen.findByText('Hapus');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('hasil')).toHaveTextContent('TIDAK'));
  });

  it('typed-confirmation: Confirm disable sampai ketikan persis RESET', async () => {
    bungkus({ ...OPSI_BAHAYA, title: 'Kembalikan ke default?', requireTypedConfirmation: 'RESET' });
    fireEvent.click(screen.getByText('minta'));
    const tombol = await screen.findByText('Hapus');
    expect(tombol.closest('button').disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('RESET'), { target: { value: 'RESE' } });
    expect(tombol.closest('button').disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('RESET'), { target: { value: 'RESET' } });
    expect(tombol.closest('button').disabled).toBe(false);
    fireEvent.click(tombol);
    await waitFor(() => expect(screen.getByTestId('hasil')).toHaveTextContent('YA'));
  });

  it('useConfirm di luar provider melempar error jelas', () => {
    function Nakal() {
      useConfirm();
      return null;
    }
    expect(() => render(<Nakal />)).toThrow('ConfirmProvider');
  });
});
