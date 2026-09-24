// BrandCombobox: filter brand gaya combobox searchable (adaptasi pola shadcn
// Combobox ke stack repo: Vite + JSX + Tailwind, tanpa deps baru, tanpa
// lucide — ikon SVG inline seperti komponen lain). UX: ketik untuk cari,
// ArrowDown/klik tombol membuka daftar, Escape/klik di luar menutup,
// tombol × mengembalikan ke "Semua Brand".
// Root cause fix: daftar dirender via portal ke <body> dengan posisi fixed —
// tidak terpotong overflow kartu/filter atau tertutup elemen lain (pola yang
// sama dengan DatePickerInput).
// Props: id, value ('' = semua), onChange(value), options (string[]),
// placeholder, accent ('emerald' default selaras Finance; 'amber' selaras Billing).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const POP_W = 260;

const ACCENT = {
  emerald: {
    ring: 'focus:ring-emerald-500/40 focus:border-emerald-300',
    hoverIcon: 'hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
    active: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25',
    hoverItem: 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
    focusItem: 'focus-visible:ring-emerald-500/60',
  },
  amber: {
    ring: 'focus:ring-amber-500/40 focus:border-amber-300',
    hoverIcon: 'hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10',
    active: 'bg-amber-500 text-white shadow-md shadow-amber-500/25',
    hoverItem: 'hover:bg-amber-50 dark:hover:bg-amber-500/10',
    focusItem: 'focus-visible:ring-amber-500/60',
  },
};

export default function BrandCombobox({ id, value, onChange, options = [], placeholder = 'Semua Brand', accent = 'emerald' }) {
  const t = ACCENT[accent] || ACCENT.emerald;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || '');
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const inputRef = useRef(null);

  // Sinkron bila value diubah dari luar (mis. reset filter).
  useEffect(() => {
    setText(value || '');
  }, [value]);

  const results = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o).toLowerCase().includes(q));
  }, [options, text]);

  // Posisi popover: di bawah input, digeser bila mepet tepi viewport.
  function updatePos() {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(POP_W, r.width);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (window.innerHeight - r.bottom < 280 && r.top > 280) top = r.top - 8;
    setPos({ left, top, width: w, up: top < r.top });
  }

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onScr = () => updatePos();
    window.addEventListener('scroll', onScr, true);
    window.addEventListener('resize', onScr);
    return () => {
      window.removeEventListener('scroll', onScr, true);
      window.removeEventListener('resize', onScr);
    };
  }, [open]);

  // Klik di luar (input maupun popover) menutup; Escape menutup.
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      const t = e.target;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
      setText(value || '');
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        setText(value || '');
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, value]);

  function pick(v) {
    onChange(v);
    setText(v);
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange('');
    setText('');
    inputRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? `${id}-listbox` : undefined}
          aria-autocomplete="list"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`min-h-[44px] w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-16 focus:outline-none focus:ring-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 transition ${t.ring}`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {text && (
            <button
              type="button"
              onClick={clear}
              aria-label="Kembalikan ke semua brand"
              title="Semua brand"
              className={`w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition focus-visible:outline-none focus-visible:ring-2 ${t.focusItem}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Buka daftar brand"
            className={`w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-500 transition focus-visible:outline-none focus-visible:ring-2 ${t.hoverIcon} ${t.focusItem}`}
          >
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ left: pos.left, top: pos.top, width: pos.width }}
            className={`fixed z-[70] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 animate-fade-in-fast ${pos.up ? 'origin-bottom' : 'origin-top'}`}
          >
            <ul
              id={`${id}-listbox`}
              role="listbox"
              aria-label="Daftar brand"
              className="max-h-60 overflow-y-auto scrollbar-thin py-1"
            >
              <li role="option" aria-selected={value === ''}>
                <button
                  type="button"
                  onClick={() => pick('')}
                  className={`w-full text-left text-sm rounded-xl px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${t.focusItem} ${
                    value === ''
                      ? `${t.active} font-bold`
                      : 'font-semibold text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Semua Brand
                </button>
              </li>
              {results.map((o) => (
                <li key={o} role="option" aria-selected={value === o}>
                  <button
                    type="button"
                    onClick={() => pick(o)}
                    title={o}
                    className={`w-full text-left text-sm rounded-xl px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${t.focusItem} ${
                      value === o
                        ? `${t.active} font-bold`
                        : `text-slate-700 dark:text-slate-200 ${t.hoverItem}`
                    }`}
                  >
                    <span className="block truncate">{o}</span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                  Tidak ada brand yang cocok dengan “{text.trim()}”.
                </li>
              )}
            </ul>
            <p className="px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 tabular-nums">
              {results.length} dari {options.length} brand
            </p>
          </div>,
          document.body
        )}
    </div>
  );
}
