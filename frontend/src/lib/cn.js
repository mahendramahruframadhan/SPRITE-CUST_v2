import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Gabung class deterministik: konflik (mis. px-4 vs px-6) selalu dimenangi
// class yang ditulis terakhir. Dipakai design system (Button).
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
