import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// Stub browser API yang tidak ada di jsdom tapi dipakai motion (Reveal/whileInView).
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// Web Animations API dipakai Base UI ScrollArea (hitung thumb setelah animasi);
// jsdom belum mendukungnya → kembalikan daftar kosong agar alur selesai.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}
