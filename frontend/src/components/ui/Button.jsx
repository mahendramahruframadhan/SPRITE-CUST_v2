import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

// Primitif tombol design system (pola shadcn/ui: CVA + Radix Slot).
// Warna mengikuti brand repo (bukan biru/abu generik); tinggi sentuh 44px
// dan ring fokus standar selalu aktif (R-03/R-32).
// Aturan className: hanya untuk LAYOUT (w-full, shrink-0, mt-*, dsb) —
// jangan override warna/variant (twMerge membuat override deterministik,
// tetapi review menolak override visual).
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-md shadow-brand-600/25',
        secondary:
          'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
        destructive: 'bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-600/25',
        outline:
          'border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300',
        ghost: 'bg-transparent text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
        link: 'bg-transparent underline-offset-4 hover:underline text-brand-600 dark:text-brand-300 min-h-0 px-0',
      },
      size: {
        sm: 'px-3 text-xs min-h-[44px]',
        default: 'px-4',
        lg: 'px-6 py-3 text-base min-h-[52px]',
        icon: 'p-0 min-w-[44px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
);

const Button = forwardRef(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {!loading && leftIcon}
        {children}
        {!loading && rightIcon}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button };
export default Button;
