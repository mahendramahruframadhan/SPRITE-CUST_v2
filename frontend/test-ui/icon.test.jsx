// Ikon navigasi & pengaturan: glyph tidak boleh kosong dan tidak boleh kembar
// antar modul (ikon kembar membuat halaman tidak terbedakan, apalagi saat
// sidebar diciutkan dan label disembunyikan).
// Jalankan: npm run test:ui
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Icon, { iconNav } from '../src/components/Icon.jsx';
import { MODULES } from '../src/config/modules.js';

const dRender = (name) => {
  const { container } = render(<Icon name={name} />);
  return [...container.querySelectorAll('path')]
    .map((p) => p.getAttribute('d') || '')
    .join('|')
    .trim();
};

describe('ikon sidebar', () => {
  it('semua modul punya path SVG yang tidak kosong', () => {
    for (const m of MODULES.filter((x) => x.id)) {
      expect(dRender(iconNav(m.id)), `modul ${m.id} (${iconNav(m.id)})`).not.toBe('');
    }
  });

  it('glyph tiap modul berbeda satu sama lain', () => {
    const terlihat = {};
    for (const m of MODULES.filter((x) => x.id)) {
      const d = dRender(iconNav(m.id));
      expect(terlihat[d], `ikon ${m.id} kembar dengan ${terlihat[d]}`).toBeUndefined();
      terlihat[d] = m.id;
    }
  });
});

describe('ikon tab & judul di Pengaturan', () => {
  it('semua nama ikon yang dipakai SettingsPage ter-resolve dan tidak kosong', () => {
    const file = resolve(process.cwd(), 'src/pages/SettingsPage.jsx');
    const src = readFileSync(file, 'utf8');
    const nama = new Set([
      ...[...src.matchAll(/icon:\s*'([a-z-]+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/icon="([a-z-]+)"/g)].map((m) => m[1]),
    ]);
    expect(nama.size).toBeGreaterThan(0);
    for (const n of nama) {
      expect(dRender(n), `ikon ${n} di SettingsPage`).not.toBe('');
    }
  });
});
