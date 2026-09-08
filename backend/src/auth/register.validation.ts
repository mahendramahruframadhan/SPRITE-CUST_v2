// Validasi registrasi bersama — dipakai AuthController (sign-up) &
// SetupController (first-admin). Cerminan frontend
// `src/features/register/validation.js`: nama 2–100, email format max 254,
// password 5–128. Paste & password manager selalu diizinkan (tanpa aturan
// kompleksitas tambahan agar konsisten dengan login min. 5 karakter).

export const MIN_PASSWORD_LENGTH = 5;
export const MAX_PASSWORD_LENGTH = 128;
export const ALLOWED_ROLES = ['Super Admin', 'Admin CS', 'Support', 'Finance', 'Viewer'] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface RegistrationValues {
  name: string;
  email: string;
  password: string;
}

export interface RegistrationCheck {
  values: RegistrationValues;
  fields: Record<string, string>;
}

export function validateRegistration(body: any): RegistrationCheck {
  const fields: Record<string, string> = {};
  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!name) fields.name = 'Nama lengkap wajib diisi.';
  else if (name.length < 2) fields.name = 'Nama minimal 2 karakter.';
  else if (name.length > 100) fields.name = 'Nama maksimal 100 karakter.';

  if (!email) fields.email = 'Email wajib diisi.';
  else if (email.length > 254) fields.email = 'Email terlalu panjang.';
  else if (!EMAIL_RE.test(email)) fields.email = 'Format email tidak valid.';

  if (!password) fields.password = 'Password wajib diisi.';
  else if (password.length < MIN_PASSWORD_LENGTH)
    fields.password = `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  else if (password.length > MAX_PASSWORD_LENGTH)
    fields.password = 'Password maksimal 128 karakter.';

  return { values: { name, email, password }, fields };
}

export function pickRole(requested: any, fallback: string = 'Viewer'): string {
  return (ALLOWED_ROLES as readonly string[]).includes(requested) ? requested : fallback;
}
