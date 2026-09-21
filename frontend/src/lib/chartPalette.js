// Palet chart terpusat — SATU sumber kebenaran untuk semua Chart.js.
// Nilai mengikuti brand scale Tailwind (brand-600 #4a4fe9 dkk) dan
// primitive tokens di styles/tokens.css. Dark-aware via chartTheme(dark).

export const CHART = {
  brand: '#4a4fe9',
  brandLight: '#5f72f5',
  brandDark: '#3d3ece',
  brandRgb: '74,79,233',
  violet: '#8b5cf6',
  emerald: '#10b981',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  amberDark: '#d97706',
  sky: '#0ea5e9',
  cyan: '#06b6d4',
  rose: '#f43f5e',
  roseLight: '#fb7185',
  roseDark: '#e11d48',
  red: '#ef4444',
  pink: '#ec4899',
  orange: '#f97316',
  indigo: '#6366f1',
  teal: '#14b8a6',
  slate: '#64748b',
  slate600: '#475569',
  slateTick: '#94a3b8',
  slatePale: '#cbd5e1',
  // 10 kategori (modul): urutan = modul terbanyak → tersedikit stabil per render
  categorical10: ['#4a4fe9', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#14b8a6', '#f97316', '#6366f1'],
  // 6 channel
  channel6: ['#4a4fe9', '#10b981', '#f59e0b', '#94a3b8', '#8b5cf6', '#06b6d4'],
  // Status billing → warna (fallback slatePale)
  bill: { FREE: '#10b981', 'ON-CALL': '#f59e0b', MONTHLY: '#0ea5e9', LAINNYA: '#cbd5e1' },
  billing4: ['#10b981', '#f59e0b', '#ef4444', '#94a3b8'],
};

// Warna chrome chart mengikuti tema. gridAlt = varian Mockup (#f1f5f9).
export function chartTheme(dark) {
  return {
    grid: dark ? '#1e293b' : '#eef2f7',
    gridAlt: dark ? '#1e293b' : '#f1f5f9',
    tick: '#94a3b8',
    legend: dark ? '#94a3b8' : '#64748b',
    axisLabel: dark ? '#94a3b8' : '#334155',
    sliceBorder: dark ? '#0f172a' : '#ffffff',
    tooltipBg: '#0f172a',
  };
}

// Isian area gradient vertikal: areaFade('74,79,233') ≡ rgba brand .28→.08→0
export function areaFade(rgb, stops = [[0, 0.28], [0.6, 0.08], [1, 0]], fallbackAlpha = 0.12) {
  return (ctx) => {
    const { chart } = ctx;
    const { ctx: c, chartArea } = chart;
    if (!chartArea) return `rgba(${rgb},${fallbackAlpha})`;
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    for (const [at, a] of stops) g.addColorStop(at, `rgba(${rgb},${a})`);
    return g;
  };
}

// Bar gradient: barGradient('#4a4fe9', '#8b5cf6', true) = horizontal
export function barGradient(from, to, horizontal = false, fallback = from) {
  return (ctx) => {
    const { chart } = ctx;
    const { ctx: c, chartArea } = chart;
    if (!chartArea) return fallback;
    const g = horizontal
      ? c.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
      : c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  };
}
