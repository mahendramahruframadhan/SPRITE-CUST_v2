// Tone warna UI terpusat — SATU-SATUNYA tempat definisi warna label/badge
// status agar konsisten di semua halaman. Sebelumnya tersebar: BILL_BADGE
// lokal per halaman + INV_TONE lokal Finance. Aturan DESIGN.md: badge kapsul
// hanya untuk status fungsional.

// Label tampil status invoice: nilai backend/logika tetap 'DIKIRIM'/'PAID',
// yang dirender ke user dipetakan ke 'TERKIRIM'/'SUDAH DIBAYAR'.
export const invLabel = (s) => (s === 'DIKIRIM' ? 'TERKIRIM' : s === 'PAID' ? 'SUDAH DIBAYAR' : s);

// Warna label Module: DISTRIBUSI = hijau, SHOP = biru, PRODUKSI = coklat,
// sisanya netral.
export function moduleTone(m) {
  switch (String(m || '').toUpperCase()) {
    case 'DISTRIBUSI':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
    case 'SHOP':
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20';
    case 'PRODUKSI':
      return 'bg-[#92400e]/10 text-[#92400e] border-[#92400e]/25 dark:bg-[#fbbf24]/10 dark:text-[#fbbf24] dark:border-[#fbbf24]/30';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
}

// Warna label Status Billing: FREE = hijau, ON-CALL = kuning, MONTHLY = biru.
export function billingTone(s) {
  switch (String(s || '').toUpperCase()) {
    case 'FREE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
    case 'ON-CALL':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
    case 'MONTHLY':
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20';
    default:
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  }
}

// Warna badge Status Invoice Finance (4 status alur terkunci).
export function invoiceTone(s) {
  switch (s) {
    case 'MENUNGGU INVOICE':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400';
    case 'INVOICE TERBIT':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-400';
    case 'DIKIRIM':
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-400';
    case 'PAID':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400';
    default:
      return 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800';
  }
}
