// View kategori PopiNava: kelompokkan baris terfilter per brand.
// Urutan grup selalu nama brand A→Z; urutan baris DALAM grup mempertahankan
// urutan input (sort aktif dari usePopinava sudah diterapkan di sana).

const BLANK = '(Tanpa brand)';

export function groupRowsByBrand(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const map = new Map();
  for (const r of rows) {
    const brand = String(r?.brandName || '').trim() || BLANK;
    if (!map.has(brand)) map.set(brand, []);
    map.get(brand).push(r);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'id'))
    .map(([brand, items]) => ({ brand, items, ids: items.map((i) => i.uuid) }));
}
