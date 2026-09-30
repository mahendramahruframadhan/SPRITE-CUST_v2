import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: true,
    proxy: {
      // ponytail: same-origin /api → bebas CORS, tanpa .env saat dev
      '/api': { target: 'http://localhost:5005', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // L2: pecah vendor besar dari index agar chunk utama di bawah 570 kB
        // (baseline index 570.927 B). xlsx tetap chunk dinamis sendiri
        // (tak masuk pola di bawah) — impor dinamis tidak boleh ikut index.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (
            id.includes('chart.js') ||
            id.includes('react-chartjs-2') ||
            id.includes('/motion/') ||
            id.includes('lucide-react') ||
            id.includes('@radix-ui') ||
            id.includes('/clsx/') ||
            id.includes('class-variance-authority') ||
            id.includes('tailwind-merge')
          ) {
            return 'vendor-ui';
          }
          return undefined;
        },
      },
    },
  },
});
