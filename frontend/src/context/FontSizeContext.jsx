import { createContext, useContext, useEffect, useState } from 'react';
import { get, set } from '../lib/storage.js';

// Ukuran font global aplikasi — diskala via root font-size (rem),
// jadi seluruh utility Tailwind ikut membesar/mengecil proporsional.
export const FONT_SIZES = {
  small: { label: 'Kecil', desc: 'Basis 14px — ringkas', px: '14px' },
  medium: { label: 'Sedang', desc: 'Basis 16px — bawaan', px: '16px' },
  large: { label: 'Besar', desc: 'Basis 18px — lega dibaca', px: '18px' },
};

const FontSizeContext = createContext(null);
const LS_KEY = 'fontSize'; // 'small' | 'medium' | 'large'

function initialFontSize() {
  const saved = get(LS_KEY);
  if (saved && FONT_SIZES[saved]) return saved;
  return 'medium';
}

export function FontSizeProvider({ children }) {
  const [fontSize, setFontSize] = useState(initialFontSize);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = FONT_SIZES[fontSize]?.px || '16px';
    root.dataset.fontsize = fontSize;
    set(LS_KEY, fontSize);
  }, [fontSize]);

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize, sizes: FONT_SIZES }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  const ctx = useContext(FontSizeContext);
  if (!ctx) throw new Error('useFontSize harus dipakai di dalam FontSizeProvider');
  return ctx;
}
