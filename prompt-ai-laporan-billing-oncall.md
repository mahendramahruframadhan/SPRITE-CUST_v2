# Prompt AI: Fitur Laporan Billing On-Call (A4)

Salin isi di dalam blok di bawah ke AI coding Anda. Letakkan juga file `spec-laporan-billing-oncall.md` di project (misalnya di folder `docs/`) supaya bisa dibaca AI.

````text
Kamu adalah engineer yang menambah fitur baru ke project saya. Gunakan Bahasa Indonesia untuk semua teks di UI dan penjelasanmu.

## Tujuan
Tambahkan fitur "Laporan Billing On-Call" di halaman Billing/Billing Audit: laporan berukuran A4 bergaya surat jalan yang bisa dicetak atau disimpan sebagai PDF, dibuat dari data tiket billing on-call.

## Acuan
Baca dulu file `docs/spec-laporan-billing-oncall.md`. File itu berisi pemetaan kolom, struktur halaman, aturan perhitungan, aturan cetak, dan template HTML contoh. Tampilan dan struktur laporan harus mengikuti template itu.

## Langkah kerja
1. Jelajahi project dulu, jangan berasumsi: cari stack (framework, bahasa, styling), halaman Billing/Billing Audit yang sudah ada, dan dari mana data tiket on-call diambil (API/endpoint/query). Ikuti pola dan gaya kode yang sudah ada.
2. Buat laporan sebagai komponen/halaman yang **data-driven**. Data diambil dari sumber yang sama dengan tabel billing, bukan hardcode dari contoh. Bila tabel sudah punya filter (periode, client, dsb.), laporan harus memakai filter yang aktif.
3. Tambahkan tombol "Cetak Laporan A4" di halaman billing yang membuka laporan (tab baru atau modal pratinjau) dengan tombol Cetak / Simpan PDF.
4. Jangan mengubah fitur lain yang sudah berjalan.

## Kolom data (dari tiket billing)
DATE ISSUE (YYYYMMDD), CLIENT, ISSUE, PIC NAME, MODULE, BILLING STATUS, BILLING CATEGORY, SUPPORT TYPE, CHARGES (integer), STATUS VALIDASI, COMPLETION NOTES, RECORD_UUID.

## Aturan penting
- **Tiket diidentifikasi dengan RECORD_UUID**, bukan nomor urut/NO. Kolom "UUID Tiket" wajib tampil di tabel karena UUID yang sama dipakai di Google Sheet. Tampilkan lengkap (36 karakter), boleh dalam font monospace kecil dan turun dua baris.
- **Tanpa kolom tanda tangan.**
- Info umum di atas tabel (Modul, Billing Status, Status Validasi, Completion Notes): tampilkan satu nilai bila seragam di seluruh data. Bila berbeda-beda, tampilkan sebagai kolom di tabel atau tulis "Beragam".
- Periode = tanggal terawal sampai terakhir dari data yang ditampilkan. Jumlah layanan = jumlah baris.
- Format Rupiah: `Rp 1.611.648` (titik ribuan). Format tanggal: `28 Okt 2026` (bulan Indonesia singkat).
- Trim spasi di awal/akhir semua teks. PIC kosong tampil `–`. Jangan mengubah atau menggabung nama client.
- Nama perusahaan, alamat, dan nomor dokumen jangan di-hardcode: ambil dari config/pengaturan yang ada di project, atau buat konstanta yang mudah diubah.

## Pivot Summary (dihitung dari data, bukan hardcode)
1. Pivot Client × Support Type: kolom Tiket, tiap Support Type yang ada di data (contoh Type A/B/C), dan Total, ditambah baris Grand Total. Sel kosong tampil `–`.
2. Pivot Billing Category: kolom Tiket dan Total, urut dari total terbesar, ditambah Grand Total.
3. Grand Total kedua pivot harus sama dengan Total Charges tabel utama.

## Cetak
- `@page { size: A4 portrait }`, tombol/kontrol disembunyikan saat print, `print-color-adjust: exact`.
- Harus mendukung **multi-halaman** bila data banyak: header tabel berulang di tiap halaman, baris tidak terpotong di tengah, nomor halaman "Halaman X / Y" di footer. Pivot Summary boleh pindah ke halaman berikutnya tetapi tidak terpotong di tengah tabel.

## Verifikasi sebelum selesai
- Uji dengan data contoh (10 tiket, periode 01–28 Okt 2026). Total Charges harus **Rp 2.101.038**; Grand Total Pivot 1 per Type: A = Rp 239.151, B = Rp 1.611.648, C = Rp 250.239.
- Uji dengan data kosong (tampilkan pesan "Tidak ada data") dan dengan data banyak (lebih dari 1 halaman).
- Jalankan lint/test yang ada di project dan pastikan tidak ada error.

## Hasil akhir
Setelah selesai, beri ringkasan singkat: file apa saja yang dibuat/diubah, cara membuka fitur ini, dan hal yang masih perlu saya isi (nama perusahaan, alamat, format nomor dokumen).
````
