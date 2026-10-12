import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  targets: [
    {
      engine: web(),
      app: {
        url: 'http://localhost:5173',
        // Dev server lokal sering sudah berjalan (port 5433/5005/5173 tetap
        // hidup antar sesi); lampirkan yang ada agar tidak APP_ALREADY_RUNNING.
        command: { executable: 'npm', args: ['run', 'dev'], log: '.e2e/logs/app.log', reuseExisting: true },
      },
    },
  ],
  tests: 'tests/**/*.e2e.ts',
  // Halaman modul butuh 6-9 detik: frontend mengambil /api/cases per halaman
  // (page=1..N untuk ribuan kasus) sebelum konten tampil. Default e2e 5 detik
  // memunculkan kegagalan palsu, jadi assertion diberi 20 detik.
  assertionTimeout: 20_000,
  // Halaman yang baru saja memuat ribuan kasus tetap sibuk beberapa detik;
  // aksi (tap) perlu lebih dari default 30 detik agar tidak gagal prematur.
  actionTimeout: 60_000,
  // Runner 3.2 GB RAM: beberapa chromium paralel + vite + backend membuat tab
  //renderer mati (chrome-error://chromewebdata). Satu worker menjaga stabil.
  workers: 1,
  timeout: 300_000,
  credentials: {
    admin: { username: 'e2e@revota.id', password: 'password123' },
    cs: { username: 'it.popinava@revota.id', password: 'password123' },
  },
} satisfies E2EConfig;
