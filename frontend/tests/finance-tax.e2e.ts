import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// E2E pajak & subtotal PER TRANSAKSI (baris ON-CALL): PPN menambah charges
// baris, PPH hanya status on/off tanpa potongan, dan Subtotal per baris tampil
// di dalam sel Pajak. Panel rekap halaman sudah dihapus.
// Pilihan baris lewat scope baris (filter ON-CALL), bukan data hardcode.
const rp = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
const oncRow = (browser: any) => browser.locator('tr').filter({ hasText: 'ON-CALL' }).first();

// Tunggu data tabel siap: baris ON-CALL pertama dengan kontrol pajak tampil.
const waitRow = async (browser: any) => {
  const deadline = Date.now() + 120000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      await expect(oncRow(browser).getByTestId(/^ppn-trigger-/)).toBeVisible();
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
};

// Baca angka subtotal baris ON-CALL pertama dari sel Pajak.
const readRowSubtotal = async (browser: any) => {
  const el = oncRow(browser).getByTestId('row-subtotal');
  await expect(el).toBeVisible();
  return Number((await el.textContent()) || '0');
};

// Kebersihan lintas-run: localStorage finance-tax-v2 bertahan antar run,
// jadi hapus sisa pajak di SEMUA baris sebelum asersi keadaan default.
const clearTaxState = async (screen: any, browser: any) => {
  for (;;) {
    const scope = screen.getByTestId(/^ppn-trigger-/).filter({ hasText: /^PPN: (?!Non PPN)/ });
    if ((await scope.count()) === 0) break;
    await scope.first().tap();
    const menu = screen.getByRole('menu', { name: 'Opsi PPN' });
    await expect(menu).toBeVisible();
    await screen.getByRole('menuitem', { name: /^Non PPN \(reset\)/ }).tap();
    await expect(menu).toBeHidden();
  }
  for (;;) {
    const on = screen.getByTestId(/^pph-toggle-/).filter({ hasText: /^\s*PPH\s*$/ });
    if ((await on.count()) === 0) break;
    await on.first().tap();
  }
};

const openPpnModal = async (screen: any, row: any) => {
  await row.getByTestId(/^ppn-trigger-/).tap();
  const menu = screen.getByRole('menu', { name: 'Opsi PPN' });
  await expect(menu).toBeVisible();
  return menu;
};
const savePpnRupiah = async (screen: any, row: any, amount: string) => {
  await openPpnModal(screen, row);
  await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
  const dlg = screen.getByRole('dialog', { name: 'PPN' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Rupiah' }).tap();
  await dlg.getByLabel('Nilai (Rp)').fill(amount);
  await dlg.getByRole('button', { name: 'Simpan' }).tap();
  await expect(dlg).toBeHidden();
};
const resetPpn = async (screen: any, row: any) => {
  await openPpnModal(screen, row);
  await screen.getByRole('menuitem', { name: /^Non PPN \(reset\)/ }).tap();
  const menu = screen.getByRole('menu', { name: 'Opsi PPN' });
  await expect(menu).toBeHidden();
};

describe('finance: pajak & subtotal per transaksi ON-CALL', { tags: ['finance'] }, () => {
  test('subtotal tampil di baris ON-CALL, panel rekap halaman sudah dihapus', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitRow(browser);
    await clearTaxState(screen, browser);

    // Panel atas (Subtotal & Pajak) tidak ada lagi.
    await expect(browser.locator('#tax-total-value')).toHaveCount(0);
    await expect(browser.locator('#tax-ppn-value')).toHaveCount(0);
    await expect(browser.locator('#tax-pph-value')).toHaveCount(0);
    await expect(browser.locator('#tax-subtotal-value')).toHaveCount(0);

    const row = oncRow(browser);
    await expect(row.getByTestId(/^ppn-trigger-/)).toBeVisible();
    await expect(row.getByTestId(/^pph-toggle-/)).toBeVisible();
    await expect(row.getByTestId('row-subtotal')).toBeVisible();

    // Invarian: tiap baris ber-trigger adalah baris ON-CALL (jumlah sama).
    const oncCount = await browser.locator('tr').filter({ hasText: 'ON-CALL' }).count();
    const triggerRows = browser.locator('tr').filter({ has: screen.getByTestId(/^ppn-trigger-/) });
    await expect(triggerRows).toHaveCount(oncCount);
  });

  test('PPN rupiah per baris menaikkan subtotal baris', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitRow(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    const sub0 = await readRowSubtotal(browser);
    await savePpnRupiah(screen, row, '10000');
    await expect(row.getByTestId(/^ppn-trigger-/)).toHaveText('PPN: Rp 10.000');
    const sub1 = await readRowSubtotal(browser);
    expect(sub1).toBe(sub0 + 10000);

    await resetPpn(screen, row);
    expect(await readRowSubtotal(browser)).toBe(sub0);
  });

  test('PPN persen memakai charges baris itu', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitRow(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    const sub0 = await readRowSubtotal(browser);
    await openPpnModal(screen, row);
    await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
    const dlg = screen.getByRole('dialog', { name: 'PPN' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'Persen' }).tap();
    await dlg.getByLabel('Persen (%)').fill('10');
    const preview = (await dlg.getByText(/Perkiraan nilai:/).textContent()) || '';
    const amountStr = (preview.match(/Rp [\d.]+/) || [])[0];
    if (!amountStr) throw new Error(`preview modal tidak terbaca: ${preview}`);
    const amount = Number(amountStr.replace(/[^\d]/g, ''));
    await dlg.getByRole('button', { name: 'Simpan' }).tap();
    await expect(dlg).toBeHidden();

    const sub1 = await readRowSubtotal(browser);
    expect(sub1).toBe(sub0 + amount);

    await resetPpn(screen, row);
    expect(await readRowSubtotal(browser)).toBe(sub0);
  });

  test('PPH hanya status: subtotal baris tidak berubah', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitRow(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    const sub0 = await readRowSubtotal(browser);
    await row.getByTestId(/^pph-toggle-/).tap();
    await expect(row.getByTestId(/^pph-toggle-/)).toHaveText('PPH');
    expect(await readRowSubtotal(browser)).toBe(sub0);

    await row.getByTestId(/^pph-toggle-/).tap();
    await expect(row.getByTestId(/^pph-toggle-/)).toHaveText('Non PPH');
    expect(await readRowSubtotal(browser)).toBe(sub0);
  });

  test('Batal dan backdrop menutup modal tanpa menyimpan', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitRow(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    const sub0 = await readRowSubtotal(browser);

    // Batal: isi nilai lalu batal, chip & subtotal tidak berubah.
    await openPpnModal(screen, row);
    await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
    const dlg = screen.getByRole('dialog', { name: 'PPN' });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Persen (%)').fill('50');
    await dlg.getByRole('button', { name: 'Batal' }).tap();
    await expect(dlg).toBeHidden();
    await expect(row.getByTestId(/^ppn-trigger-/)).toHaveText('PPN: Non PPN');
    expect(await readRowSubtotal(browser)).toBe(sub0);

    // Backdrop: titik tengah tertutup dialog, klik pojok kiri-atas.
    await openPpnModal(screen, row);
    await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Persen (%)').fill('30');
    await browser
      .locator('div.fixed.inset-0.z-50 > div.absolute.inset-0')
      .tap({ position: { x: 6, y: 6 } });
    await expect(dlg).toBeHidden();
    await expect(row.getByTestId(/^ppn-trigger-/)).toHaveText('PPN: Non PPN');
    expect(await readRowSubtotal(browser)).toBe(sub0);
  });

  test('subtotal & pajak per baris bertahan setelah reload', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitRow(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    await savePpnRupiah(screen, row, '10000');
    const sub1 = await readRowSubtotal(browser);

    // Navigasi ulang penuh: nilai baris bertahan dari finance-tax-v2.
    await app.open('/finance');
    await waitRow(browser);
    await expect(row.getByTestId(/^ppn-trigger-/)).toHaveText('PPN: Rp 10.000');
    expect(await readRowSubtotal(browser)).toBe(sub1);

    // Kebersihan sesi: kembalikan baris ke Non.
    await resetPpn(screen, row);
  });
});
