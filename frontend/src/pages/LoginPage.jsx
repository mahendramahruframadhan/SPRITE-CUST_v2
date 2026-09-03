import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, MOCK_USERS } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('finance@revota.id');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    try {
      login(email, password);
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="bg-white rounded-2xl shadow-xl shadow-brand-600/10 border border-slate-200 p-8">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-600/30">
              <Icon name="logo" className="w-6 h-6" strokeWidth={2} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-slate-900">Pusat Data Bantuan</h1>
              <p className="text-xs text-slate-400">Login untuk mengakses dashboard</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@perusahaan.id"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-3 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95"
            >
              Login
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 text-center mb-2">
              Akun demo (password bebas, min. 6 karakter):
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {Object.entries(MOCK_USERS).map(([em, u]) => (
                <button
                  key={em}
                  onClick={() => fillLogin(em)}
                  className="text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-full px-2.5 py-1 transition"
                >
                  {u.role}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">
          © 2025 Pusat Data Bantuan — Sinkron dari Google Sheets
        </p>
      </div>
    </div>
  );
}
