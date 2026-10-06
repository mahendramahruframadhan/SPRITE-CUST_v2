// ScrollArea (port shadcn base-nova → JSX, Base UI): viewport + thumb custom.
// Jalankan: npm run test:ui
// Catatan jsdom: tanpa layout, scrollbar tidak overflow → thumb/skala hanya
// diverifikasi di browser; unit test memastikan struktur viewport & children.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollArea } from '../src/components/ui/ScrollArea.jsx';

describe('ScrollArea', () => {
  it('children dirender di dalam viewport bercorak data-slot', () => {
    render(
      <ScrollArea className="max-h-40" data-testid="sa">
        <p>Konten scrollable</p>
      </ScrollArea>,
    );
    const root = screen.getByTestId('sa');
    expect(root).toHaveAttribute('data-slot', 'scroll-area');
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]');
    expect(viewport).not.toBeNull();
    expect(viewport).toHaveTextContent('Konten scrollable');
  });

  // Regresi bug /clients: Root hanya max-h (tanpa tinggi pasti) membuat
  // `size-full` (=height:100%) di viewport tidak terhadap, viewport tidak
  // pernah overflow → Base UI tak merender scrollbar, panel terpotong.
  // Solusi: viewport meng-clamp max-height warisan dari Root.
  it('viewport meng-clamp max-height warisan dari Root', () => {
    render(
      <ScrollArea className="max-h-[440px]" data-testid="sa-max">
        <p>Daftar panjang</p>
      </ScrollArea>,
    );
    const viewport = screen.getByTestId('sa-max').querySelector('[data-slot="scroll-area-viewport"]');
    expect(viewport.className).toContain('[max-height:inherit]');
  });

  it('Root meng-clip overflow agar viewport tak meluber keluar kotak', () => {
    render(
      <ScrollArea className="max-h-40" data-testid="sa-clip">
        <p>Konten</p>
      </ScrollArea>,
    );
    expect(screen.getByTestId('sa-clip').className).toContain('overflow-hidden');
  });

  it('prop horizontal menambah scrollbar horizontal tanpa error', () => {
    render(
      <ScrollArea horizontal data-testid="sa-x">
        <table><tbody><tr><td>Lembar</td></tr></tbody></table>
      </ScrollArea>,
    );
    expect(screen.getByTestId('sa-x')).toBeInTheDocument();
    expect(screen.getByText('Lembar')).toBeInTheDocument();
  });
});
