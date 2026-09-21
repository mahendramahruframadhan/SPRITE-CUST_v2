# DESIGN.md: Arah visual SPRITE-CUST (Pusat Data Bantuan, Revota)

Sumber arah: brand ungu Revota yang sudah live (keputusan owner, bukan temuan baru).
Dial: **ENERGY 2 / RHYTHM 2 / MOTION 1**.

## Identitas

- Primer: indigo brand `#4a4fe9` (brand-600) + ungu `#7c3aed`; hero gradien indigo→ungu
  adalah identitas produk (R-01: alasan = brand, bukan default AI).
- Tipografi: Inter (alasan R-06: aplikasi data operasional padat; sans netral,
  bukan monospace dekoratif). Label data `10–11px uppercase tracking` = kebutuhan
  scannability tabel padat, dikunci satu gaya (R-06: alasan tertulis).
- Motif identitas: hero gradien + kartu metrik dengan hover-lift (1 aksen fokus
  per halaman, R-13). Dot-grid TIDAK dipakai (dihapus, R-07 tanpa alasan).

## Aturan pakai (filter antislop)

- Badge kapsul hanya untuk status fungsional: LIVE/sync, jumlah item, status
  validasi (R-09: alasan = fungsi, bukan dekorasi).
- Blur hanya di: header sticky, backdrop modal, kartu login, panel sync
  (R-10: ≤4 elemen beralasan fungsi; tidak di chip hero karena blur di atas
  gradien pekat = no-op visual).
- Animasi: satu transisi mount per section (`animate-fade-in-fast`), tanpa
  cascade delay per kartu (R-19: orientasi, bukan dekorasi).
- Kartu metrik identik = perbandingan setara (R-14: alasan = hierarki setara).
- Semua angka dari Google Sheets asli; tanpa testimoni/FAQ/klaim (R-17/R-18/R-28/R-36).
- Em dash (—) di copy Indonesia dipertahankan: idiom bahasa, bukan pola
  marketing AI; bukan tulisan agent (R-02: protokol konflik, diputuskan keep).
