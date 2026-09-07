import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { signUp } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

// Pendaftaran mandiri — role default Viewer (admin bisa menaikkan di /roles).
export default function SignUpPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return setError('Nama dan email wajib diisi.');
    if (password.length < 6) return setError('Password min. 6 karakter.');
    if (password !== confirm) return setError('Konfirmasi password tidak sama.');
    setError('');
    setSaving(true);
    try {
      const r = await signUp(email.trim().toLowerCase(), password, name.trim());
      if (!r || r.error || !r.user) throw new Error('Email sudah terdaftar?');
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Pendaftaran gagal — pastikan backend jalan.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="bg-white rounded-2xl shadow-xl shadow-brand-600/10 border border-slate-200 p-8">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-600/30">
              <Icon name="logo" className="w-6 h-6" strokeWidth={2} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-slate-900">Daftar Akun Baru</h1>
              <p className="text-xs text-slate-400">Akses awal sebagai Viewer</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nama</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.id" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 karakter" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Konfirmasi Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Ulangi password" className={inputCls} />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-3 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95 disabled:opacity-60"
            >
              {saving ? 'Mendaftarkan…' : 'Daftar'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Sudah punya akun?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
