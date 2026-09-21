import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAllCases, reloadAllCases, fetchCasesRange } from '../lib/api.js';

// Satu-satunya sumber data kasus untuk semua halaman.
// Prinsip Context7 react.dev (stale-response guard): hanya respons terakhir yang
// boleh setState — di sini via sequence counter (setara ignore-flag cleanup).
export function useCases() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback((fresh) => {
    const my = ++seq.current;
    setLoading(true);
    setError('');
    return (fresh ? reloadAllCases() : fetchAllCases()).then(
      (rows) => {
        if (seq.current === my) {
          setCases(rows);
          setLoading(false);
        }
      },
      (e) => {
        if (seq.current === my) {
          setError(e.message || 'Gagal memuat data');
          setLoading(false);
        }
      }
    );
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  return { cases, loading, error, reload };
}

// Varian rentang tanggal: fetch ulang ke backend setiap from/to berubah.
// Pola guard sama (respons terakhir yang boleh setState).
export function useRangedCases(from, to) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    setError('');
    fetchCasesRange({ from, to }).then(
      (rows) => {
        if (seq.current === my) {
          setCases(rows);
          setLoading(false);
        }
      },
      (e) => {
        if (seq.current === my) {
          setError(e.message || 'Gagal memuat data');
          setLoading(false);
        }
      }
    );
  }, [from, to]);

  return { cases, loading, error };
}
