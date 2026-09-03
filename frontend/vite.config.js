import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Hindari canonicalisasi realpath (path asli E:\#Project-work\... mengandung
  // '#' yang merusak URL resolution di Vite). Dev server dijalankan via junction
  // C:\sprite-cust-link agar semua path bebas karakter '#'.
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});
