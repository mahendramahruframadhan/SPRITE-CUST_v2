// DataKasusPage — isi issue panjang bisa dibuka penuh dengan klik, tanpa keluar dari daftar.
// Jalankan: npm run test:ui
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataKasusPage from '../src/pages/DataKasusPage.jsx';
import { ToastProvider } from '../src/context/ToastContext.jsx';

const ISSUE_PANJANG =
  'Klien melaporkan gagal sinkron invoice sejak Senin pagi, worker sync berulang timeout di modul billing. ' +
  'Reset tiket tidak membantu, ada dugaan kolom baru menyetel ulang mapping kolom sheet sehingga baris tertentu terlewat. ' +
  'Minta butir pengganjur 2006 tentang alur QA bajak laut supaya verifikasi mandiri berjalan mulus penghabisan.';

const CASES = [
  {
    recordUuid: 'u-short', no: 1, dateIssue: '20260101', client: 'Klien A', picName: 'PIC A',
    module: 'SAP', subModule: 'Sub B', location: 'Jakarta', issue: 'ndas mohon password numpuk.',
    assignTo: 'IT', status: 'OPEN', billingStatus: 'Invoice Terbit', charges: 0,
  },
  {
    recordUuid: 'u-long', no: 2, dateIssue: '20260102', client: 'Klien B', picName: 'PIC B',
    module: 'SAP', subModule: 'Sub C', location: 'Bandung', issue: ISSUE_PANJANG,
    assignTo: 'IT', status: 'OPEN', billingStatus: 'Invoice Terbit', charges: 0,
  },
];

vi.mock('../src/hooks/useCases.js', () => ({
  useCases: () => ({ cases: CASES, loading: false, error: '', reload: vi.fn() }),
}));

const renderPage = () => render(<ToastProvider><DataKasusPage /></ToastProvider>);

// Toggle hanya ada untuk baris bermasalah panjang; nama aksesibel bersifat unik.
const toggles = () => screen.getAllByRole('button', { name: /isi issue lengkap/i });

// <p> tabel yang menampung isi issue lengkap (pembeda dari span kartu mobile).
const paragrafIssue = () =>
  [...document.querySelectorAll('p')].find((p) => p.textContent.includes('lewat'));

// Span kartu mobile untuk satu isi issue (tanpa elemen span bersarang).
const spanKartu = () =>
  [...document.querySelectorAll('span')].find(
    (s) => s.textContent === ISSUE_PANJANG && s.querySelector('span') === null
  );

describe('DataKasusPage — isi issue expand', () => {
  it('issue panjang: dilipat 2 baris di awal, klik → teks penuh terlihat, klik lagi → dilipat', () => {
    renderPage();
    const p = paragrafIssue();
    expect(p).toBeDefined();
    expect(p.className).toContain('line-clamp-2');

    const toggle = toggles()[0];
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const pTerbuka = paragrafIssue();
    expect(pTerbuka.className).not.toContain('line-clamp-2');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(paragrafIssue().className).toContain('line-clamp-2');
  });

  it('issue pendek: tanpa tombol expand dan teks tidak dilipat', () => {
    renderPage();
    expect(toggles()).toHaveLength(1);
    // Teks pendek muncul di tabel (p) dan kartu mobile (span) — dua-duanya utuh.
    const pendek = screen.getAllByText('ndas mohon password numpuk.');
    expect(pendek).toHaveLength(2);
    for (const el of pendek) expect(el.className).not.toContain('line-clamp-2');
  });

  it('kartu mobile: tap isi issue tidak membuka modal dan teks membuka penuh', () => {
    renderPage();
    const span = spanKartu();
    expect(span).toBeDefined();
    expect(span.className).toContain('line-clamp-2');

    fireEvent.click(span);
    // Modal detail tidak terbuka.
    expect(screen.queryByText('RECORD_UUID:')).toBeNull();
    expect(spanKartu().className).not.toContain('line-clamp-2');
  });

  it('tombol Detail tetap membuka modal isi lengkap', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    expect(screen.getByText('RECORD_UUID:')).toBeInTheDocument();
  });
});
