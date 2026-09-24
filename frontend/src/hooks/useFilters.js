// useFilters: state filter generik untuk bar filter semua halaman.
// - values: objek nilai { key: value }.
// - set(key, v): ubah satu kunci; mengembalikan { prev, next } bila berubah
//   (untuk pencatatan aktivitas, mis. logFilter Finance) atau null bila sama.
// - setMany(patch): ubah beberapa kunci sekaligus (mis. pilih bulan).
// - reset(keys?): kembalikan ke nilai awal (semua kunci bila keys kosong).
// Dipakai Billing, Finance Audit, dan Data Kasus agar perilaku filter
// (reset, pencatatan) tidak drift antar-halaman.
import { useCallback, useRef, useState } from 'react';

export function useFilters(initial) {
  const [values, setValues] = useState(initial);
  const ref = useRef(values);
  ref.current = values;

  const set = useCallback((key, v) => {
    const prev = ref.current[key];
    if (prev === v) return null;
    const next = { ...ref.current, [key]: v };
    ref.current = next;
    setValues(next);
    return { prev, next: v };
  }, []);

  const setMany = useCallback((patch) => {
    const next = { ...ref.current, ...patch };
    ref.current = next;
    setValues(next);
  }, []);

  const reset = useCallback(
    (keys) => {
      const next = { ...ref.current };
      (keys && keys.length ? keys : Object.keys(initial)).forEach((k) => {
        next[k] = initial[k];
      });
      ref.current = next;
      setValues(next);
    },
    [initial]
  );

  return [values, set, reset, setMany];
}
