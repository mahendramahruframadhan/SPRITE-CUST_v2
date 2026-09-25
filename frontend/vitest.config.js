import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Runner khusus test komponen (jsdom + Testing Library).
// Test murni node:test tetap via `npm test`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['test-ui/setup.js'],
    include: ['test-ui/**/*.test.jsx'],
  },
});
