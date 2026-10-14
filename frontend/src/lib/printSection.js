// Cetak satu section laporan (A4): tandai [data-section="<id>"] dengan
// .print-keep, sembunyikan section lain via CSS
// (body.printing-section ... :not(.print-keep)), lalu window.print().
// Bersih-bersih di afterprint agar layar kembali normal.
export function printSection(id) {
  const el = document.querySelector(`[data-section="${id}"]`);
  if (!el) return false;
  document.body.classList.add('printing-section');
  el.classList.add('print-keep');
  const done = () => {
    el.classList.remove('print-keep');
    document.body.classList.remove('printing-section');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  return true;
}
