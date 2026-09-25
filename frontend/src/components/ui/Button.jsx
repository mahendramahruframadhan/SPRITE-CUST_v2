// Primitif tombol bersama — satu sumber bahasa visual tombol agar konsisten
// di semua halaman (sebelumnya 30+ definisi inline menyebar).
// Varian: primer (aksi utama), sekunder (aksi pendamping/export),
// bahaya (hapus), teks (reset/batal ringan).
// Selalu min-h-44 + ring fokus standar (R-03/R-32); radius mengikuti token
// --radius-control (rounded-xl).
const VARIAN = {
  primer: 'bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/25',
  sekunder:
    'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
  bahaya: 'bg-rose-600 hover:bg-rose-700 text-white',
  teks: 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
};

export function Button({ varian = 'primer', className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 min-h-[44px] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${VARIAN[varian] || VARIAN.primer} ${className}`}
    />
  );
}
