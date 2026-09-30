import { forwardRef } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '../../lib/cn.js';

// HistoryTracking — timeline riwayat (adaptasi OrderTracking ke frontend ini):
// ikon check + garis penghubung antar step dengan palet brand/slate repo
// (bukan variabel warna shadcn), daftar kronologis <ol> untuk aksesibilitas,
// dan baris opsional `description` berisi pelaku + detail transisi.
// Dipakai modal Riwayat outlet PopiNava.
export const HistoryTracking = forwardRef(function HistoryTracking(
  { steps = [], className, ...props },
  ref
) {
  return (
    <div ref={ref} className={cn('w-full', className)} {...props}>
      {steps.length > 0 ? (
        <ol className="m-0 list-none p-0">
          {steps.map((step, index) => (
            <li key={step.id ?? index} className="flex">
              <div className="flex flex-col items-center" aria-hidden="true">
                {step.isCompleted ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-brand-600" />
                ) : (
                  <Circle className="h-6 w-6 shrink-0 text-slate-400 dark:text-slate-500" />
                )}
                {index < steps.length - 1 && (
                  <div
                    className={cn('w-[1.5px] grow', {
                      'bg-brand-600/70': steps[index + 1].isCompleted,
                      'bg-slate-300 dark:bg-slate-600': !steps[index + 1].isCompleted,
                    })}
                  />
                )}
              </div>
              <div className={cn('ml-3 min-w-0', index < steps.length - 1 && 'pb-6')}>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{step.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{step.timestamp}</p>
                {step.description && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{step.description}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">Belum ada riwayat untuk outlet ini.</p>
      )}
    </div>
  );
});
HistoryTracking.displayName = 'HistoryTracking';

export default HistoryTracking;
