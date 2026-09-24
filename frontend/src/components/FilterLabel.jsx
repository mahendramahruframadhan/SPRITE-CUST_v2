// Label kecil untuk field filter — satu gaya di semua halaman
// (sebelumnya string kelas yang sama diulang di tiap halaman).
export default function FilterLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
      {children}
    </label>
  );
}
