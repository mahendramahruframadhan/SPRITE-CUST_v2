# Spec: Laporan Billing On-Call (A4, gaya Surat Jalan)

Dokumen ini berisi spesifikasi dan template HTML laporan billing on-call berukuran A4.
Template di bawah adalah **contoh dengan data nyata dari CSV** (10 tiket, periode 01–28 Okt 2026).
Untuk di project, template ini harus dibuat **dinamis** (data dari billing, bukan hardcode).

## 1. Sumber Data

CSV `billing-audit-on-call.csv`, 13 kolom:

| Kolom CSV | Dipakai di laporan | Keterangan |
|---|---|---|
| `NO` | Tidak | Nomor tiket lama, diganti UUID |
| `DATE ISSUE` | Ya – kolom Tanggal | Format `YYYYMMDD`, tampil `28 Okt 2026` |
| `CLIENT` | Ya – kolom Client | Dipakai juga sebagai baris pivot |
| `ISSUE` | Ya – kolom Issue | Trim spasi di awal/akhir |
| `PIC NAME` | Ya – kolom PIC | Kosong → tampil `–` |
| `MODULE` | Ya – info umum | Tampil di atas bila seragam |
| `BILLING STATUS` | Ya – info umum | Tampil di atas bila seragam |
| `BILLING CATEGORY` | Ya – kolom Kategori + pivot 2 | |
| `SUPPORT TYPE` | Ya – kolom Support + kolom pivot 1 | Contoh: `SUPPORT TYPE - B` |
| `CHARGES` | Ya – kolom Charges | Integer, tampil `Rp 83.413` |
| `STATUS VALIDASI` | Ya – info umum | Tampil di atas bila seragam |
| `COMPLETION NOTES` | Ya – info umum | Tampil di atas bila seragam |
| `RECORD_UUID` | Ya – kolom **UUID Tiket** | Pengenal tiket, wajib ada (sama dengan UUID di sheet) |

## 2. Struktur Halaman

1. **Kop**: nama perusahaan + alamat (kiri), judul "SURAT JALAN LAYANAN" + subjudul "Laporan Billing Audit – On-Call" (kanan), garis ganda di bawahnya.
2. **Info umum** (2 kolom): No. Dokumen, Tanggal Cetak, Periode (tanggal terawal – terakhir), Modul, Billing Status, Status Validasi, Completion Notes, Jumlah Layanan.
3. **Tabel utama**: No, UUID Tiket, Tanggal, Client, Issue, PIC, Kategori / Support Type, Charges. Baris terakhir = TOTAL CHARGES.
4. **Pivot Summary – Total Charges**
   - Pivot 1: Client × Support Type (kolom: Tiket, Type A, Type B, Type C, Total) + Grand Total.
   - Pivot 2: Billing Category (kolom: Tiket, Total), urut dari total terbesar + Grand Total.
5. **Catatan**: "Seluruh layanan telah divalidasi dan siap ditagihkan."
6. **Footer**: nama laporan + periode (kiri), nomor halaman (kanan).

**Tidak ada kolom tanda tangan.**

## 3. Aturan Perhitungan & Format

- Total Charges = jumlah semua `CHARGES`. Contoh data ini: **Rp 2.101.038**.
- Grand Total Pivot 1 dan Pivot 2 harus sama dengan Total Charges tabel utama.
- Rupiah: awalan `Rp`, pemisah ribuan titik (`Rp 1.611.648`).
- Tanggal: `YYYYMMDD` → `DD Mon YYYY` dengan bulan Indonesia singkat (Jan, Feb, Mar, Apr, Mei, Jun, Jul, Agu, Sep, Okt, Nov, Des).
- Urutan baris tabel utama mengikuti urutan data (terbaru di atas).
- Sel pivot tanpa nilai tampil `–`.
- Client dipakai apa adanya (jangan diubah/digabung otomatis).

## 4. Aturan Cetak

- `@page { size: A4 portrait; margin: 0 }`, lembar 210 × 297 mm, padding 14 × 13 mm.
- Tombol cetak disembunyikan saat print (`@media print`).
- `print-color-adjust: exact` agar warna header tabel ikut tercetak.
- Template contoh ini memuat 1 halaman. Untuk data lebih banyak, versi project harus mendukung **multi-halaman**: header tabel berulang di tiap halaman, baris tidak terpotong, nomor halaman otomatis.

## 5. Template HTML (contoh, 1 halaman)

Simpan sebagai file `.html` lalu buka di browser untuk melihat tampilannya, atau pakai sebagai acuan komponen.

```html
<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Laporan Billing On-Call</title>
<style>
@page { size: A4 portrait; margin: 0 }
*{box-sizing:border-box}
body{margin:0;background:#d9dce1;font:9.5pt/1.35 Arial,Helvetica,sans-serif;color:#111}
.bar{text-align:center;padding:12px}
.bar button{font:inherit;padding:8px 18px;border:0;border-radius:6px;background:#1f3a5f;color:#fff;cursor:pointer}
.sheet{width:210mm;min-height:297mm;margin:0 auto 20px;background:#fff;padding:14mm 13mm;box-shadow:0 2px 12px rgba(0,0,0,.25);position:relative}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px double #111;padding-bottom:8px}
.co b{font-size:14pt;letter-spacing:.5px} .co div{font-size:8.5pt;color:#444}
.ttl{text-align:right} .ttl h1{margin:0;font-size:15pt;letter-spacing:1px} .ttl div{font-size:8.5pt;color:#444}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:10px 0 12px;font-size:9pt}
.meta div{display:flex} .meta span:first-child{width:34mm;color:#444} .meta span:last-child{font-weight:bold}
table{width:100%;border-collapse:collapse}
.main th,.main td{border:1px solid #222;padding:4px 5px;vertical-align:top}
.main th{background:#eceff3;font-size:8.5pt;text-transform:uppercase}
.main td{font-size:8.8pt}
.u{font:6.6pt/1.3 Consolas,'Courier New',monospace;word-break:break-all}
.c{text-align:center} .r{text-align:right;white-space:nowrap} .m{font-size:7.8pt;color:#555}
.tot td{font-weight:bold;background:#f6f7f9}
h2{font-size:10pt;margin:16px 0 5px;letter-spacing:.5px}
.sum{display:flex;gap:16px;margin-top:12px;align-items:flex-start}
.gt td{font-weight:bold;background:#eceff3}
.sum .note{flex:1;font-size:8.5pt;color:#333;border:1px solid #999;padding:6px 8px}
.recap{width:100%}
.recap th,.recap td{border:1px solid #666;padding:3px 5px;font-size:8.5pt} .recap th{background:#f1f1f1}
.foot{position:absolute;left:13mm;right:13mm;bottom:8mm;font-size:7.5pt;color:#777;display:flex;justify-content:space-between;border-top:1px solid #ccc;padding-top:3px}
@media print{body{background:#fff} .bar{display:none} .sheet{margin:0;box-shadow:none;width:210mm;height:297mm;overflow:hidden}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Cetak / Simpan PDF (A4)</button></div>
<div class="sheet">
 <div class="head">
  <div class="co"><b>[NAMA PERUSAHAAN]</b><div>[Alamat perusahaan] · [Telp / Email]</div></div>
  <div class="ttl"><h1>SURAT JALAN LAYANAN</h1><div>Laporan Billing Audit – On-Call</div></div>
 </div>
 <div class="meta">
  <div><span>No. Dokumen</span><span>: [__ / BA / 2026]</span></div>
  <div><span>Tanggal Cetak</span><span>: 04 Nov 2026</span></div>
  <div><span>Periode</span><span>: 01 Okt 2026 – 28 Okt 2026</span></div>
  <div><span>Modul</span><span>: SHOP</span></div>
  <div><span>Billing Status</span><span>: ON-CALL</span></div>
  <div><span>Status Validasi</span><span>: VALID – SIAP INVOICE</span></div>
  <div><span>Completion Notes</span><span>: SAME DAY SERVICE</span></div>
  <div><span>Jumlah Layanan</span><span>: 10 tiket</span></div>
 </div>
 <table class="main">
  <thead><tr><th style="width:7mm">No</th><th style="width:29mm">UUID Tiket</th><th style="width:19mm">Tanggal</th><th style="width:27mm">Client</th><th>Issue</th><th style="width:16mm">PIC</th><th style="width:28mm">Kategori / Support</th><th style="width:22mm">Charges</th></tr></thead>
  <tbody>
<tr><td class="c">1</td><td class="u">e1619a43-3d94-4ea3-8661-203a55274eaf</td><td>28 Okt 2026</td>
<td><b>ISSUE</b></td><td>UPdate transaksi receive salan consignment</td><td>WAHYU</td>
<td>UPDATE TRANSAKSI<br><span class="m">SUPPORT TYPE - C</span></td><td class="r">Rp 83.413</td></tr>
<tr><td class="c">2</td><td class="u">49543724-df0f-400f-83dd-3c685c5e85c9</td><td>26 Okt 2026</td>
<td><b>SMITH</b></td><td>ROllback transaksi picklist kasir salah subtotal</td><td>BABIL</td>
<td>ROLLBACK TRANSAKSI<br><span class="m">SUPPORT TYPE - C</span></td><td class="r">Rp 83.413</td></tr>
<tr><td class="c">3</td><td class="u">22cea7a0-0827-4b63-9ba3-c3e52d4679e8</td><td>23 Okt 2026</td>
<td><b>MAYOUTFIT</b></td><td>Perpanjang lisensi revota event 2 (EXP - 2026-12-07)</td><td>NOVITA</td>
<td>PREPAID LICENSE<br><span class="m">SUPPORT TYPE - B</span></td><td class="r">Rp 555.000</td></tr>
<tr><td class="c">4</td><td class="u">fe8bc254-23d2-4bb6-8b6d-656ca4fa7e5b</td><td>22 Okt 2026</td>
<td><b>SMITH</b></td><td>Perpindahan server HOUSE OF SMITH expo 23</td><td>INSAN</td>
<td>PINDAH SERVER<br><span class="m">SUPPORT TYPE - B</span></td><td class="r">Rp 166.703</td></tr>
<tr><td class="c">5</td><td class="u">2188ece3-a851-4121-a3ec-52f2b9311f79</td><td>19 Okt 2026</td>
<td><b>STARCROSS</b></td><td>Rebuild db shop kendari</td><td>BAGAS</td>
<td>REBUILD DATABASE<br><span class="m">SUPPORT TYPE - B</span></td><td class="r">Rp 556.416</td></tr>
<tr><td class="c">6</td><td class="u">8101de6a-1542-42ca-b743-ad48e0d3c629</td><td>19 Okt 2026</td>
<td><b>MAYOUTFIT</b></td><td>Perpindahan server ex serpong menjadi komputer event</td><td>NOVITA</td>
<td>PINDAH SERVER<br><span class="m">SUPPORT TYPE - B</span></td><td class="r">Rp 166.703</td></tr>
<tr><td class="c">7</td><td class="u">c763cfab-a3f4-4c4a-aec6-626fd4da203e</td><td>14 Okt 2026</td>
<td><b>DISCLOSURE SHOP JAKARTA</b></td><td>PINDAH server jakarta menjadi pc event</td><td>–</td>
<td>INJECT SHOP CONTROL<br><span class="m">SUPPORT TYPE - A</span></td><td class="r">Rp 239.151</td></tr>
<tr><td class="c">8</td><td class="u">5a34d884-f43c-44c6-8734-6ee34aefb7de</td><td>13 Okt 2026</td>
<td><b>HOY JAKARTA</b></td><td>Instal system revota toko</td><td>lutvim</td>
<td>REINSTALL TRAVICS<br><span class="m">SUPPORT TYPE - B</span></td><td class="r">Rp 83.413</td></tr>
<tr><td class="c">9</td><td class="u">d8e2bb38-c98a-4293-a0e1-08e63982eb0f</td><td>01 Okt 2026</td>
<td><b>ISSUE</b></td><td>Revisi report consignment payment  bulan september</td><td>WAHYU</td>
<td>UPDATE TRANSAKSI<br><span class="m">SUPPORT TYPE - C</span></td><td class="r">Rp 83.413</td></tr>
<tr><td class="c">10</td><td class="u">2f574a66-d26d-4eb7-88b1-d4a9aa7991de</td><td>01 Okt 2026</td>
<td><b>RADSAMIHARBI.CO</b></td><td>instal client system distribusi RADSA</td><td>–</td>
<td>REINSTALL TRAVICS<br><span class="m">SUPPORT TYPE - B</span></td><td class="r">Rp 83.413</td></tr>
  <tr class="tot"><td colspan="7" class="r">TOTAL CHARGES</td><td class="r">Rp 2.101.038</td></tr></tbody>
 </table>
 <h2>PIVOT SUMMARY – TOTAL CHARGES</h2>
 <table class="recap"><thead><tr><th>Client</th><th>Tiket</th><th>Type A</th><th>Type B</th><th>Type C</th><th>Total</th></tr></thead><tbody><tr><td>ISSUE</td><td class='c'>2</td><td class='r'>–</td><td class='r'>–</td><td class='r'>Rp 166.826</td><td class='r'><b>Rp 166.826</b></td></tr><tr><td>SMITH</td><td class='c'>2</td><td class='r'>–</td><td class='r'>Rp 166.703</td><td class='r'>Rp 83.413</td><td class='r'><b>Rp 250.116</b></td></tr><tr><td>MAYOUTFIT</td><td class='c'>2</td><td class='r'>–</td><td class='r'>Rp 721.703</td><td class='r'>–</td><td class='r'><b>Rp 721.703</b></td></tr><tr><td>STARCROSS</td><td class='c'>1</td><td class='r'>–</td><td class='r'>Rp 556.416</td><td class='r'>–</td><td class='r'><b>Rp 556.416</b></td></tr><tr><td>DISCLOSURE SHOP JAKARTA</td><td class='c'>1</td><td class='r'>Rp 239.151</td><td class='r'>–</td><td class='r'>–</td><td class='r'><b>Rp 239.151</b></td></tr><tr><td>HOY JAKARTA</td><td class='c'>1</td><td class='r'>–</td><td class='r'>Rp 83.413</td><td class='r'>–</td><td class='r'><b>Rp 83.413</b></td></tr><tr><td>RADSAMIHARBI.CO</td><td class='c'>1</td><td class='r'>–</td><td class='r'>Rp 83.413</td><td class='r'>–</td><td class='r'><b>Rp 83.413</b></td></tr><tr class='gt'><td>GRAND TOTAL</td><td class='c'>10</td><td class='r'>Rp 239.151</td><td class='r'>Rp 1.611.648</td><td class='r'>Rp 250.239</td><td class='r'>Rp 2.101.038</td></tr></tbody></table>
 <div class="sum">
  <table class="recap" style="flex:1"><thead><tr><th>Billing Category</th><th>Tiket</th><th>Total</th></tr></thead><tbody><tr><td>REBUILD DATABASE</td><td class='c'>1</td><td class='r'>Rp 556.416</td></tr><tr><td>PREPAID LICENSE</td><td class='c'>1</td><td class='r'>Rp 555.000</td></tr><tr><td>PINDAH SERVER</td><td class='c'>2</td><td class='r'>Rp 333.406</td></tr><tr><td>INJECT SHOP CONTROL</td><td class='c'>1</td><td class='r'>Rp 239.151</td></tr><tr><td>REINSTALL TRAVICS</td><td class='c'>2</td><td class='r'>Rp 166.826</td></tr><tr><td>UPDATE TRANSAKSI</td><td class='c'>2</td><td class='r'>Rp 166.826</td></tr><tr><td>ROLLBACK TRANSAKSI</td><td class='c'>1</td><td class='r'>Rp 83.413</td></tr><tr class='gt'><td>GRAND TOTAL</td><td class='c'>10</td><td class='r'>Rp 2.101.038</td></tr></tbody></table>
  <div class="note"><b>Catatan:</b><br>Seluruh layanan telah divalidasi dan siap ditagihkan.</div>
 </div>
 <div class="foot"><span>Laporan Billing Audit On-Call · 01 Okt 2026 – 28 Okt 2026</span><span>Halaman 1 / 1</span></div>
</div></body></html>
```

## 6. Catatan Data

- Beberapa nilai punya spasi di ujung (contoh `WAHYU `, `Rebuild db shop kendari `): trim sebelum ditampilkan.
- Dua tiket tidak punya PIC (tampil `–`).
- Dua tiket punya client bernama `ISSUE`; kemungkinan salah input di data sumber.
- Placeholder yang harus diisi: `[NAMA PERUSAHAAN]`, alamat/kontak, `No. Dokumen`.
