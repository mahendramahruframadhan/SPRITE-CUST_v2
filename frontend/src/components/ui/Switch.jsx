import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';

// Sakelar status (pola shadcn/ui Switch, tanpa dep tambahan):
// <button role="switch" aria-checked> + track/thumb animasi halus (MOTION 1).
// Warna hijau = aktif, abu = nonaktif (kontras AA); fokus ring brand (R-03).
export const Switch = forwardRef(function Switch(
  { className, checked = false, onCheckedChange, disabled, ...props },
  ref
) {
  return (
    // eslint-disable-next-line react/forbid-elements -- primitive switch (role=switch, pola shadcn) — bukan tombol aksi
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      ref={ref}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
});
Switch.displayName = 'Switch';
export default Switch;
