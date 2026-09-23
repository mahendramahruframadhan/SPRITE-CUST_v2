// DatePickerInput: input tanggal gaya popover kalender (adaptasi pola shadcn
// DatePickerInput ke stack repo: Vite + JSX + Tailwind, tanpa deps baru,
// locale id-ID). UX: ketik bebas (ISO / dd-mm-yyyy / "6 Okt 2026") + tombol
// kalender membuka grid bulan; ArrowDown membuka, Escape menutup.
// Root cause fix: popover dirender via portal ke <body> dengan posisi fixed —
// tidak lagi terpotong overflow-hidden modal/kartu atau tertutup elemen lain.
// Props: id, value (yyyy-MM-dd), onChange(iso), placeholder.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtDateLong, parseDateInput } from '../utils/contract.js';

const MONTH_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const DAY_HEAD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const POP_W = 300;

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseISO(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function DatePickerInput({ id, value, onChange, placeholder = 'cth. 6 Okt 2026' }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? fmtDateLong(value) : '');
  const [month, setMonth] = useState(() => startOfMonth(parseISO(value) || new Date()));
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);

  // Sinkron bila value diubah dari luar (mis. reset form).
  useEffect(() => {
    setText(value ? fmtDateLong(value) : '');
    const p = parseISO(value);
    if (p) setMonth(startOfMonth(p));
  }, [value]);

  // Posisi popover: di bawah input, digeser bila mepet tepi viewport.
  function updatePos() {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - POP_W - 8));
    let top = r.bottom + 8;
    // Bila ruang bawah sempit (< 320px), buka ke atas input.
    if (window.innerHeight - r.bottom < 320 && r.top > 320) top = r.top - 8;
    setPos({ left, top, up: top < r.top });
  }

  useEffect(() => {
    if (!open) return;
    updatePos();
    // Scroll apa pun (termasuk di kontainer bersarang) memperbarui posisi.
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
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = parseISO(value);
  const today = new Date();
  // Grid Senin-dulu ala kalender dinding Indonesia.
  const leadBlanks = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(leadBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function pick(day) {
    const iso = toISO(new Date(month.getFullYear(), month.getMonth(), day));
    onChange(iso);
    setOpen(false);
  }

  function commitText(v) {
    setText(v);
    const iso = parseDateInput(v);
    if (iso) {
      onChange(iso);
      setMonth(startOfMonth(parseISO(iso)));
    }
  }

  function shiftMonth(delta) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          onChange={(e) => commitText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="min-h-[44px] w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Pilih tanggal dari kalender"
          className="w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-300 hover:border-brand-300 dark:hover:border-brand-500/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </button>
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ left: pos.left, top: pos.top, width: POP_W }}
            className={`fixed z-[70] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3 animate-fade-in-fast ${pos.up ? 'origin-bottom' : 'origin-top'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Bulan sebelumnya"
                className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100" aria-live="polite">
                {MONTH_LONG[month.getMonth()]} {month.getFullYear()}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Bulan berikutnya"
                className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label="Pilih tanggal">
              {DAY_HEAD.map((d) => (
                <span key={d} className="h-8 inline-flex items-center justify-center text-[10px] font-bold uppercase text-slate-400">
                  {d}
                </span>
              ))}
              {cells.map((day, i) =>
                day === null ? (
                  <span key={`b-${i}`} />
                ) : (
                  <button
                    key={day}
                    type="button"
                    onClick={() => pick(day)}
                    aria-label={`${day} ${MONTH_LONG[month.getMonth()]} ${month.getFullYear()}`}
                    aria-pressed={sameDay(new Date(month.getFullYear(), month.getMonth(), day), selected)}
                    className={`h-10 rounded-lg text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                      sameDay(new Date(month.getFullYear(), month.getMonth(), day), selected)
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25'
                        : sameDay(new Date(month.getFullYear(), month.getMonth(), day), today)
                          ? 'text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/50 hover:bg-brand-50 dark:hover:bg-brand-500/10'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {day}
                  </button>
                )
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
