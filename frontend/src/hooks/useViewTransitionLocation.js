// Transisi antar halaman via View Transitions API (native) — SPA pattern:
// pertukaran lokasi route dibungkus document.startViewTransition, sehingga
// CSS ::view-transition-old/new (lihat styles/view-transitions.css) menganimasi-
// kan crossfade/slide. Menangkap SEMUA navigasi (Link, navigate(), back/forward).
// - Arah slide dari useNavigationType (POP = mundur).
// - prefers-reduced-motion → tukar instan tanpa animasi.
// - Browser tanpa startViewTransition → fallback instan (bukan error).
import { useEffect, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const viewTransitionSupported = () =>
  typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

// Bungkus perubahan DOM (buka/tutup modal, dsb) dalam view transition bila
// didukung; selalu jalan walau tidak didukung. Untuk shared element.
export function withViewTransition(update) {
  if (!viewTransitionSupported() || prefersReducedMotion()) {
    update();
    return null;
  }
  return document.startViewTransition(update);
}

export function useViewTransitionLocation() {
  const location = useLocation();
  const navType = useNavigationType();
  const [displayLocation, setDisplayLocation] = useState(location);

  useEffect(() => {
    if (location.key === displayLocation.key) return;
    // Arah slide: maju (PUSH) vs mundur (POP/back).
    document.documentElement.dataset.vtDir = navType === 'POP' ? 'back' : 'forward';
    const swap = () => {
      setDisplayLocation(location);
      window.scrollTo(0, 0);
    };
    if (!viewTransitionSupported() || prefersReducedMotion()) {
      swap();
      return;
    }
    const vt = document.startViewTransition(swap);
    vt.finished
      .catch(() => {})
      .finally(() => {
        delete document.documentElement.dataset.vtDir;
      });
    // displayLocation.key sengaja tidak di-deps: cukup bandingkan snapshot key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, navType]);

  return displayLocation;
}
