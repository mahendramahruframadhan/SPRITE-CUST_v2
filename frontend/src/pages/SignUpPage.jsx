import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import {
  normalizeEmail,
  passwordScore,
  PASSWORD_STRENGTH_LABEL,
  validateAll,
  validateStep,
} from '../features/register/validation.js';
import {
  getSetupStatus,
  registerAccount,
  registerFirstAccount,
} from '../features/register/registerApi.js';

// Wizard registrasi — mendukung 2 mode:
// - firstRun  → akun PERTAMA instalasi → POST /api/setup/first-admin (Super Admin)
// - reguler   → POST /api/auth/sign-up/email (role awal Viewer, naik di /roles)
// Daftar HANYA menyimpan ke DB; sesudah berhasil pengguna diarahkan ke /login
// untuk mengisi email & password dan login dari sana.
const STEPS = [
  { id: 'akun', title: 'Akun', desc: 'Email aktif' },
  { id: 'keamanan', title: 'Profil & Keamanan', desc: 'Nama & password' },
  { id: 'review', title: 'Konfirmasi', desc: 'Periksa & daftar' },
];

const STRENGTH_BAR = ['bg-rose-400', 'bg-amber-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-500'];

const inputCls = (invalid) =>
  `w-full px-3 py-3 text-sm border rounded-lg focus:outline-none focus:ring-2 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 ${
    invalid
      ? 'border-rose-300 focus:ring-rose-500/30 focus:border-rose-400'
      : 'border-slate-200 dark:border-slate-700 focus:ring-brand-500/40 focus:border-brand-400'
  }`;

export default function SignUpPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState({ loading: true, firstRun: false, source: '' });
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const summaryRef = useRef(null);
  const emailRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getSetupStatus().then((s) => {
      if (alive) setStatus({ loading: false, firstRun: s.firstRun, source: s.source });
    });
    return () => {
      alive = false;
    };
  }, []);

  const strength = useMemo(() => passwordScore(values.password), [values.password]);
  const firstRun = status.firstRun;

  function set(field, v) {
    setValues((prev) => ({ ...prev, [field]: v }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
  }

  function focusFirstError(fieldErrors) {
    const order = ['email', 'name', 'password', 'confirm'];
    const first = order.find((f) => fieldErrors[f]);
    if (first) document.getElementById(`reg-${first}`)?.focus();
  }

  function next() {
    const fieldErrors = validateStep(step, values);
    setErrors(fieldErrors);
    setSubmitError('');
    if (Object.keys(fieldErrors).length > 0) {
      summaryRef.current?.focus();
      focusFirstError(fieldErrors);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setSubmitError('');
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const fieldErrors = validateAll(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      setSubmitError('Periksa kembali kolom yang ditandai sebelum mendaftar.');
      summaryRef.current?.focus();
      focusFirstError(fieldErrors);
      return;
    }
    setSubmitError('');
    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        email: normalizeEmail(values.email),
        password: values.password,
      };
      const r = firstRun
        ? await registerFirstAccount(payload)
        : await registerAccount(payload);
      if (!r?.user) throw new Error('Pendaftaran gagal — coba lagi.');
      // Sesuai alur: daftar hanya menyimpan ke DB → arahkan ke halaman awal
      // (/login) agar pengguna mengisi email & password lalu login di sana.
      navigate('/login', {
        replace: true,
        state: {
          justRegistered: true,
          email: payload.email,
          firstRun,
          compat: r.source === 'fallback-legacy',
        },
      });
    } catch (err) {
      setSubmitError(err.message || 'Pendaftaran gagal — pastikan backend jalan di port 5005.');
      summaryRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  const errorList = [...Object.entries(errors).map(([f, m]) => ({ field: f, message: m }))];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-4xl motion-safe:animate-fade-in">
        <div className="grid md:grid-cols-[320px_1fr] bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-brand-600/10 border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Panel kiri — konteks + stepper */}
          <aside className="bg-gradient-to-b from-brand-700 to-brand-950 text-white p-7 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
                <Icon name="logo" className="w-6 h-6" strokeWidth={2} />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight">Pusat Data Bantuan</p>
                <p className="text-[11px] text-brand-200">Registrasi akun</p>
              </div>
            </div>
            {status.loading ? (
              <div className="space-y-3" aria-hidden="true">
                <div className="h-4 w-3/4 rounded bg-white/20 animate-pulse" />
                <div className="h-3 w-full rounded bg-white/10 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-white/10 animate-pulse" />
              </div>
            ) : (
              <div
                className={`text-xs rounded-xl px-3 py-2.5 border ${
                  firstRun
                    ? 'bg-emerald-400/15 border-emerald-300/30 text-emerald-100'
                    : 'bg-white/10 border-white/15 text-brand-100'
                }`}
              >
                {firstRun ? (
                  <><span className="font-bold">Mode akun pertama.</span> Akun ini disiapkan sebagai <span className="font-bold">Super Admin</span> pemegang akses penuh.</>
                ) : (
                  <><span className="font-bold">Pendaftaran akun baru.</span> Role awal <span className="font-bold">Viewer</span> — Super Admin dapat menaikkannya di halaman Hak Akses.</>
                )}
              </div>
            )}
            <ol className="space-y-1" aria-label="Langkah pendaftaran">
              {STEPS.map((s, i) => {
                const state = i < step ? 'done' : i === step ? 'active' : 'todo';
                return (
                  <li key={s.id} className="flex items-start gap-3 py-2">
                    <span
                      aria-hidden="true"
                      className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border ${
                        state === 'active'
                          ? 'bg-white text-brand-700 border-white'
                          : state === 'done'
                            ? 'bg-emerald-400 text-brand-950 border-emerald-400'
                            : 'bg-transparent text-brand-200 border-white/25'
                      }`}
                    >
                      {state === 'done' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span>
                      <span className={`block text-sm font-semibold ${state === 'todo' ? 'text-brand-200' : 'text-white'}`}>{s.title}</span>
                      <span className="block text-[11px] text-brand-200">{s.desc}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-auto text-[11px] leading-relaxed text-brand-200">
              Data dilindungi — password tersimpan dalam bentuk hash di server dan tidak pernah dikirim kembali ke client.
            </p>
          </aside>

          {/* Panel kanan — form wizard */}
          <div className="p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {firstRun ? 'Buat akun Super Admin pertama' : 'Daftar akun baru'}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Langkah {step + 1} dari {STEPS.length} — {STEPS[step].title}
              </p>
              <div className="h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Progres pendaftaran">
                <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
              </div>
            </div>

            {(submitError || errorList.length > 0) && (
              <div
                ref={summaryRef}
                tabIndex={-1}
                role="alert"
                aria-labelledby="reg-error-title"
                className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 mb-5 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              >
                <p id="reg-error-title" className="text-xs font-bold text-rose-700">
                  {submitError || 'Ada kolom yang perlu diperbaiki:'}
                </p>
                {errorList.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {errorList.map((e) => (
                      <li key={e.field}>
                        <button
                          type="button"
                          onClick={() => document.getElementById(`reg-${e.field}`)?.focus()}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          {e.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {step === 0 && (
                <div className="space-y-5">
                  <div>
                    <label htmlFor="reg-email"               className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Email kerja</label>
                    <input
                      ref={emailRef}
                      id="reg-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="nama@perusahaan.id"
                      value={values.email}
                      onChange={(e) => set('email', e.target.value)}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'reg-email-error' : 'reg-email-hint'}
                      className={inputCls(errors.email)}
                    />
                    {errors.email
                      ? <p id="reg-email-error" className="text-xs text-rose-600 mt-1">{errors.email}</p>
                      : <p id="reg-email-hint" className="text-[11px] text-slate-400 mt-1">Dipakai untuk login dan header identitas <code className="font-mono">x-user-email</code> ke backend.</p>}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <label htmlFor="reg-name"               className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nama lengkap</label>
                    <input
                      id="reg-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Nama lengkap"
                      value={values.name}
                      onChange={(e) => set('name', e.target.value)}
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? 'reg-name-error' : undefined}
                      className={inputCls(errors.name)}
                    />
                    {errors.name && <p id="reg-name-error" className="text-xs text-rose-600 mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label htmlFor="reg-password"               className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Password</label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        name="new-password"
                        type={showPw ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Min. 5 karakter"
                        value={values.password}
                        onChange={(e) => set('password', e.target.value)}
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby="reg-password-hint reg-password-strength"
                        className={`${inputCls(errors.password)} pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-pressed={showPw}
                        aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                          {showPw
                            ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            : <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />}
                        </svg>
                      </button>
                    </div>
                    {errors.password
                      ? <p id="reg-password-hint" className="text-xs text-rose-600 mt-1">{errors.password}</p>
                      : <p id="reg-password-hint" className="text-[11px] text-slate-400 mt-1">Boleh paste dari password manager. Minimal 5 karakter.</p>}
                    {values.password && (
                      <div id="reg-password-strength" className="mt-2" aria-live="polite">
                        <div className="flex gap-1" aria-hidden="true">
                          {[0, 1, 2, 3].map((i) => (
                            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? STRENGTH_BAR[strength] : 'bg-slate-200 dark:bg-slate-700'}`} />
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Kekuatan: <span className="font-semibold text-slate-600 dark:text-slate-300">{PASSWORD_STRENGTH_LABEL[strength]}</span></p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label htmlFor="reg-confirm"               className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Konfirmasi password</label>
                    <div className="relative">
                      <input
                        id="reg-confirm"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Ulangi password"
                        value={values.confirm}
                        onChange={(e) => set('confirm', e.target.value)}
                        aria-invalid={Boolean(errors.confirm)}
                        aria-describedby={errors.confirm ? 'reg-confirm-error' : undefined}
                        className={`${inputCls(errors.confirm)} pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        aria-pressed={showConfirm}
                        aria-label={showConfirm ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                          {showConfirm
                            ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            : <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />}
                        </svg>
                      </button>
                    </div>
                    {errors.confirm && <p id="reg-confirm-error" className="text-xs text-rose-600 mt-1">{errors.confirm}</p>}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <dl className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-sm overflow-hidden">
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-xs font-semibold text-slate-400">Nama</dt>
                      <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 text-right truncate">{values.name}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-xs font-semibold text-slate-400">Email</dt>
                      <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 text-right truncate">{normalizeEmail(values.email)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-xs font-semibold text-slate-400">Role awal</dt>
                      <dd>
                        <span className={`inline-flex items-center text-[11px] font-bold rounded-full px-2.5 py-1 ${firstRun ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'text-brand-700 bg-brand-50 border border-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/20'}`}>
                          {firstRun ? 'Super Admin (akun pertama)' : 'Viewer'}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Dengan mendaftar, akun tunduk pada matriks izin di halaman Hak Akses.
                    Super Admin selalu memiliki semua akses; role lain mengikuti izin modul yang berlaku saat itu juga.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 mt-7">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={back}
                    disabled={saving}
                    className="px-5 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition disabled:opacity-60 min-h-[44px]"
                  >
                    Kembali
                  </button>
                )}
                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={next}
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-3 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95 min-h-[44px]"
                  >
                    Lanjut
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-3 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95 disabled:opacity-60 min-h-[44px]"
                  >
                    {saving ? 'Mendaftarkan…' : firstRun ? 'Buat Super Admin' : 'Daftar'}
                  </button>
                )}
              </div>
            </form>

            <p className="text-center text-xs text-slate-400 mt-6">
              Sudah punya akun?{' '}
              <Link to="/login" className="font-semibold text-brand-600 dark:text-brand-300 hover:underline">
                Login
              </Link>
            </p>
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-4">
          Kontrak backend: <code className="font-mono">src/features/register/BACKEND_CONTRACT.md</code> — terimplementasi di <code className="font-mono">backend/src/setup/</code>.
        </p>
      </div>
    </div>
  );
}
