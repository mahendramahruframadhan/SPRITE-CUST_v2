// Registrasi Chart.js terpusat — SATU-SATUNYA tempat registrasi komponen chart.
// Sebelumnya hanya DashboardPage yang meregistrasi, sehingga halaman chart lain
// (/mockup, /billing, /finance) bergantung pada efek samping global yang rapuh
// (chart rusak bila chunk dashboard belum termuat). Diimpor sekali di main.jsx.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

export { ChartJS };
