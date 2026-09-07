import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      // ponytail: same-origin /api → bebas CORS, tanpa .env saat dev
      '/api': { target: 'http://localhost:5005', changeOrigin: true },
    },
  },
});
