# CATATAN: Path project & Vite

## Masalah
Folder project berada di `E:\#Project-work\...` — karakter `#` di path
**merusak URL resolution Vite**, sehingga muncul error:

```
[vite] Pre-transform error: Failed to load url /src/main.jsx. Does the file exist?
```

## Solusi (sudah diterapkan)
1. Dibuat **junction** `C:\sprite-cust-link` → `E:\#Project-work\SRPITE-CUST`
   (junction ini mengarah ke folder yang sama; hapus junction TIDAK menghapus data).
2. `package.json` → script `dev` menjalankan:
   `vite C:/sprite-cust-link/frontend`
   (root path eksplisit tanpa `#`, bisa dijalankan dari folder manapun).
3. `vite.config.js` → `resolve.preserveSymlinks: true`
   agar Vite tidak mengembalikan path asli (`E:\#Project-work\...`).

## Cara menjalankan
```bash
npm run dev
```
dari `frontend` seperti biasa, lalu buka http://localhost:5173

## PENTING
- **Jangan hapus** junction `C:\sprite-cust-link`, karena script `dev` bergantung padanya.
- Jika junction hilang/terhapus, buat ulang dengan (PowerShell Admin tidak wajib):
  ```powershell
  New-Item -ItemType Junction -Path 'C:\sprite-cust-link' -Target 'E:\#Project-work\SRPITE-CUST'
  ```
- Solusi paling bersih jangka panjang: rename folder `E:\#Project-work`
  menjadi nama tanpa `#` (mis. `E:\Project-work`), lalu kembalikan
  script `dev` menjadi `"vite"` dan hapus junction.
