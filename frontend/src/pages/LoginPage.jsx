import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, MOCK_USERS } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import Icon from '../components/Icon.jsx';
import { GradientWave } from '../components/ui/gradient-wave.jsx';

// Palet gradien mengikuti warna brand (biru-ungu indigo) agar selaras
// dengan identitas visual aplikasi.
const LOGIN_GRADIENT_COLORS = [
  '#eef4ff',
  '#c5d7ff',
  '#7d97fb',
  '#ffffff',
  '#a2bcff',
  '#5f72f5',
];

const LOGIN_GRADIENT_COLORS_DARK = [
  '#0b1120',
  '#1e1b4b',
  '#312e81',
  '#0f172a',
  '#1e3a8a',
  '#4c1d95',
];

export default function LoginPage() {
  const { login } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  // Alur daftar → login: /signup mengarahkan ke sini dengan state
  // { justRegistered, email, firstRun, compat }. Email terisi otomatis,
  // password SELALU dikosongkan dan fokus dipindah ke kolom password.
  const regState = location.state?.justRegistered ? location.state : null;
  const [email, setEmail] = useState(regState?.email || 'finance@revota.id');
  const [password, setPassword] = useState(regState ? '' : 'password123');
  const [error, setError] = useState('');
  const passwordRef = useRef(null);

  useEffect(() => {
    if (regState) {
      passwordRef.current?.focus();
      // Hapus state dari history agar banner tidak muncul lagi saat refresh.
      window.history.replaceState({}, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  function fillLogin(em) {
    setEmail(em);
    setPassword('password123');
    setError('');
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-4">
      {/* Background animasi gradien WebGL — hiasan, disembunyikan dari screen reader */}
      <GradientWave colors={theme === 'dark' ? LOGIN_GRADIENT_COLORS_DARK : LOGIN_GRADIENT_COLORS} />
      {/* Lapisan lembut agar kartu login tetap terbaca di atas gradien */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-white/10 via-transparent to-brand-950/10 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-brand-900/25 ring-1 ring-white/70 dark:ring-slate-700 border border-white/50 dark:border-slate-700 p-8">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white shadow-lg shadow-brand-600/40 mb-4">
              <Icon name="logo" className="w-7 h-7" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Pusat Data Bantuan
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Login untuk mengakses dashboard</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {regState && (
              <div role="status" className="bg-emerald-50/90 border border-emerald-200 text-emerald-700 text-xs font-semibold px-4 py-3 rounded-xl">
                Pendaftaran berhasil{regState.firstRun ? ' — akun Super Admin pertama' : ''}.
                Silakan login dengan email &amp; password Anda.
              </div>
            )}
            {regState?.compat && (
              <div className="bg-amber-50/90 border border-amber-200 text-amber-700 text-xs px-4 py-2.5 rounded-xl">
                Catatan: backend dalam mode kompatibilitas — role final dikunci saat kontrak setup aktif.
              </div>
            )}
            {error && (
              <div className="bg-rose-50/90 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Email</label>
              <div className="relative">
                <Icon
                  name="mail"
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  strokeWidth={2}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@perusahaan.id"
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 focus:bg-white/90 dark:focus:bg-slate-800 transition placeholder:text-slate-400 text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Icon
                  name="lock"
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  strokeWidth={2}
                />
                <input
                  ref={passwordRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-white/70 dark:bg-slate-800/70 border border-white/80 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 focus:bg-white/90 dark:focus:bg-slate-800 transition placeholder:text-slate-400 text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <button
              type="submit"
              className="group w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white text-sm font-bold py-3 rounded-xl shadow-lg shadow-brand-600/30 transition-all active:scale-[0.98]"
            >
              <span className="inline-flex items-center gap-1.5">
                Login
                <Icon
                  name="chevron-right"
                  className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.5}
                />
              </span>
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/70 dark:border-slate-700">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mb-2">
              Akun demo (password: password123):
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {Object.entries(MOCK_USERS).map(([em, u]) => (
                <button
                  key={em}
                  onClick={() => fillLogin(em)}
                  className="text-[11px] font-semibold text-brand-700 dark:text-brand-300 bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 border border-white/80 dark:border-slate-700 rounded-full px-2.5 py-1 transition"
                >
                  {u.role}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-slate-600 dark:text-slate-300 mt-6 drop-shadow-sm">
          © 2025 Pusat Data Bantuan — Sinkron dari Google Sheets
        </p>
        <p className="text-center text-xs text-slate-600 dark:text-slate-300 mt-2 drop-shadow-sm">
          Belum punya akun?{' '}
          <Link to="/signup" className="font-semibold text-brand-700 dark:text-brand-300 hover:underline">
            Daftar di sini
          </Link>
        </p>
      </div>
    </div>
  );
}
