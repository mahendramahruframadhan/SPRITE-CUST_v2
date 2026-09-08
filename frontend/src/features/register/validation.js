// Validasi registrasi — dipakai frontend sekarang, bisa dipakai ulang
// backend nanti sebagai cerminan aturan (lihat BACKEND_CONTRACT.md).
// Aturan disengaja identik dengan backend eksisting:
// - nama wajib, email format valid
// - password min. 5 karakter (tetap izinkan paste & password manager)

export const MIN_PASSWORD_LENGTH = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

export function validateName(name) {
  if (!name || !name.trim()) return 'Nama lengkap wajib diisi.';
  if (name.trim().length < 2) return 'Nama minimal 2 karakter.';
  if (name.trim().length > 100) return 'Nama maksimal 100 karakter.';
  return '';
}

export function validateEmail(email) {
  const v = normalizeEmail(email);
  if (!v) return 'Email wajib diisi.';
  if (v.length > 254) return 'Email terlalu panjang.';
  if (!EMAIL_RE.test(v)) return 'Format email tidak valid (contoh: nama@perusahaan.id).';
  return '';
}

export function validatePassword(password) {
  if (!password) return 'Password wajib diisi.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  }
  if (password.length > 128) return 'Password maksimal 128 karakter.';
  return '';
}

export function validateConfirm(password, confirm) {
  if (!confirm) return 'Konfirmasi password wajib diisi.';
  if (password !== confirm) return 'Konfirmasi password tidak sama.';
  return '';
}

// Skor 0–4 untuk password strength meter (hanya UX, bukan gate).
export function passwordScore(password = '') {
  let s = 0;
  if (password.length >= 5) s += 1;
  if (password.length >= 8) s += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) s += 1;
  return Math.min(s, 4);
}

export const PASSWORD_STRENGTH_LABEL = [
  'Sangat lemah',
  'Lemah',
  'Cukup',
  'Kuat',
  'Sangat kuat',
];

// Validasi per langkah wizard. Mengembalikan { field: message }.
export function validateStep(step, values) {
  const errors = {};
  if (step === 0) {
    const e = validateEmail(values.email);
    if (e) errors.email = e;
  }
  if (step === 1) {
    const n = validateName(values.name);
    if (n) errors.name = n;
    const p = validatePassword(values.password);
    if (p) errors.password = p;
    const c = validateConfirm(values.password, values.confirm);
    if (c) errors.confirm = c;
  }
  return errors;
}

export function validateAll(values) {
  return {
    ...validateStep(0, values),
    ...validateStep(1, values),
  };
}
