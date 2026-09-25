// Primitif tabel bersama — satu sumber bentuk pill badge + baris kosong agar
// perubahan visual tabel (4+ halaman data) 1 file, bukan 4+. Aturan DESIGN.md:
// badge kapsul hanya untuk status/kategori fungsional.
// - Dot: titik indikator (mengikuti warna teks via bg-current).
// - Pill: label kapsul; tone dari utils/tones.js; size md/sm/xs; dot opsional.
// - EmptyRow: baris "tidak ada data" (compact untuk tabel kecil).
// - LoadingRow: baris skeleton saat fetch — bedakan dari kosong (R-27).
export function Dot() {
  return <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" />;
}

const PILL_SIZE = {
  md: 'text-[11px] px-2.5 py-1',
  sm: 'text-xs px-2 py-1',
  xs: 'text-[10px] px-2 py-0.5',
};

export function Pill({ tone = '', size = 'md', dot = false, className = '', children }) {
  return (
    <span className={`${dot ? 'inline-flex items-center gap-1.5' : 'inline-block'} font-bold border rounded-full whitespace-nowrap ${PILL_SIZE[size] || PILL_SIZE.md} ${tone} ${className}`}>
      {dot && <Dot />}
      {children}
    </span>
  );
}

export function EmptyRow({ colSpan, compact = false, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className={`${compact ? 'px-4 py-10' : 'px-6 py-12'} text-center text-slate-500 dark:text-slate-400 text-sm`}>
        {children}
      </td>
    </tr>
  );
}

export function LoadingRow({ colSpan, rows = 3 }) {
  const lebar = [92, 78, 85];
  return (
    <tr>
      <td colSpan={colSpan} role="status" aria-label="Memuat data" className="px-6 py-4">
        <div className="space-y-2.5" aria-hidden="true">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="skeleton h-4 rounded-lg" style={{ width: `${lebar[i % lebar.length]}%` }} />
          ))}
        </div>
      </td>
    </tr>
  );
}
