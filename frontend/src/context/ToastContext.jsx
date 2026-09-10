import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);
let toastSeq = 0;

const KIND_STYLE = {
  success: {
    bar: 'bg-emerald-500',
    icon: 'text-emerald-500 dark:text-emerald-400',
    path: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  error: {
    bar: 'bg-rose-500',
    icon: 'text-rose-500 dark:text-rose-400',
    path: 'M12 9v3.75m0 3.75h.008v.008H12v-.008zm9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  },
  info: {
    bar: 'bg-brand-500',
    icon: 'text-brand-500 dark:text-brand-300',
    path: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const notify = useCallback((message, kind = 'success', ms = 3500) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-3), { id, message: String(message), kind: KIND_STYLE[kind] ? kind : 'info' }]);
    timers.current[id] = setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex w-[min(92vw,420px)] flex-col items-stretch gap-2">
        {toasts.map((t) => {
          const s = KIND_STYLE[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-2.5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-3 pl-3 pr-2 shadow-2xl animate-fade-in-fast"
            >
              <span aria-hidden="true" className={`mt-0.5 w-1 self-stretch rounded-full ${s.bar}`} />
              <svg className={`w-5 h-5 shrink-0 mt-0.5 ${s.icon}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={s.path} />
              </svg>
              <p className="flex-1 min-w-0 text-[13px] font-semibold text-slate-700 dark:text-slate-200 leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Tutup notifikasi"
                className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam ToastProvider');
  return ctx;
}
