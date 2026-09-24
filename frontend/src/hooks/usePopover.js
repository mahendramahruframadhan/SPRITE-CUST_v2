// usePopover: logika popover via portal ke <body> (posisi fixed, anti-terpotong
// overflow) — dipakai DatePickerInput & BrandCombobox agar tidak duplikasi.
// - width: lebar minimum popover; minSpace: ruang vertikal minimum agar dibuka
//   ke bawah, bila sempit dan ruang atas cukup maka dibuka ke atas.
// - onDismiss: dipanggil saat klik-di-luar / Escape (default: tutup saja).
// Mengembalikan { open, setOpen, pos, rootRef, popRef } — render portal
// (createPortal ... document.body) tetap di komponen pemakai.
import { useEffect, useRef, useState } from 'react';

export function usePopover({ width = 260, minSpace = 300, onDismiss } = {}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Posisi popover: di bawah anchor, digeser bila mepet tepi viewport.
  // Scroll apa pun (termasuk kontainer bersarang) memperbarui posisi.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(width, r.width);
      const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
      let top = r.bottom + 8;
      if (window.innerHeight - r.bottom < minSpace && r.top > minSpace) top = r.top - 8;
      setPos({ left, top, width: w, up: top < r.top });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, width, minSpace]);

  // Klik di luar (anchor maupun popover) + Escape → onDismiss (default tutup).
  useEffect(() => {
    if (!open) return;
    const dismiss = () => {
      if (dismissRef.current) dismissRef.current();
      else setOpen(false);
    };
    function onDown(e) {
      const t = e.target;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      dismiss();
    }
    function onKey(e) {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, pos, rootRef, popRef };
}
