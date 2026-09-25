import { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmModal from './ConfirmModal.jsx';

// Context + hook promise-based: const ok = await confirm({ title, ... })
// resolve(true) saat Confirm diklik (setelah onConfirmAsync selesai bila ada),
// resolve(false) saat Batal/Escape/klik backdrop.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [konfig, setKonfig] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const resolveRef = useRef(null);

  const confirm = useCallback((opsi) => {
    setKonfig(opsi);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const tutup = useCallback((hasil) => {
    resolveRef.current?.(hasil);
    resolveRef.current = null;
    setKonfig(null);
    setSibuk(false);
  }, []);

  const saatBatal = useCallback(() => tutup(false), [tutup]);

  const saatConfirm = useCallback(async () => {
    if (konfig?.onConfirmAsync) {
      setSibuk(true);
      try {
        await konfig.onConfirmAsync();
      } finally {
        setSibuk(false);
      }
    }
    tutup(true);
  }, [konfig, tutup]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        open={!!konfig}
        title={konfig?.title}
        description={konfig?.description}
        confirmLabel={konfig?.confirmLabel}
        cancelLabel={konfig?.cancelLabel}
        variant={konfig?.variant}
        requireTypedConfirmation={konfig?.requireTypedConfirmation}
        loading={sibuk}
        onConfirm={saatConfirm}
        onCancel={saatBatal}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm harus dipakai di dalam <ConfirmProvider>');
  return ctx;
}
