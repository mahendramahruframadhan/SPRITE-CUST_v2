import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// E2E pajak PER TRANSAKSI (baris ON-CALL): PPN menambah charges baris,
// PPH hanya status on/off tanpa potongan. Rekap panel menjumlahkan pajak
// per baris. Pilihan baris dilakukan lewat scope baris (filter ON-CALL),
// bukan data hardcode: dataset tersinkron dari Sheets dan bisa berubah.
const rp = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
const valueOf = async (browser: any, sel: string, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const el = browser.locator(sel);
      await expect(el).toBeVisible();
      return (await el.textContent()) || '';
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
};
const expectText = async (loc: any, text: string, timeoutMs = 60000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await expect(loc).toHaveText(text);
      return;
    } catch (e) {
      if (Date.now() >= deadline) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
};
const readNum = async (browser: any, sel: string) =>
  Number((await valueOf(browser, sel)).replace(/[^\d]/g, ''));
const waitTotal = async (browser: any) => {
  const deadline = Date.now() + 120000;
  let last = -1;
  while (Date.now() < deadline) {
    try {
      const v = await readNum(browser, '#tax-total-value');
      if (v > 0) return v;
      last = v;
    } catch {
      /* renderer sibuk atau belum siap, coba lagi */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`total tidak siap dalam 120s (nilai terakhir: ${last})`);
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

const oncRow = (browser: any) => browser.locator('tr').filter({ hasText: 'ON-CALL' }).first();

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

describe('finance: pajak per transaksi ON-CALL', { tags: ['finance'] }, () => {
  test('kontrol pajak ada di baris ON-CALL dan menempel aturan per-baris', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    const total = await waitTotal(browser);
    await clearTaxState(screen, browser);

    await expectText(browser.locator('#tax-ppn-value'), 'Non PPN');
    await expectText(browser.locator('#tax-pph-value'), 'Non PPH');
    await expectText(browser.locator('#tax-subtotal-value'), rp(total));

    const row = oncRow(browser);
    await expect(row.getByTestId(/^ppn-trigger-/)).toBeVisible();
    await expect(row.getByTestId(/^pph-toggle-/)).toBeVisible();

    // Invarian struktur: tiap baris ber-trigger adalah baris ON-CALL (jumlah sama).
    const oncCount = await browser.locator('tr').filter({ hasText: 'ON-CALL' }).count();
    const triggerRows = browser.locator('tr').filter({ has: screen.getByTestId(/^ppn-trigger-/) });
    await expect(triggerRows).toHaveCount(oncCount);
  });

  test('PPN rupiah per baris menambah rekap panel', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    const total = await waitTotal(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    await savePpnRupiah(screen, row, '10000');
    await expectText(row.getByTestId(/^ppn-trigger-/), 'PPN: Rp 10.000');
    await expectText(browser.locator('#tax-ppn-value'), rp(10000));
    await expectText(browser.locator('#tax-subtotal-value'), rp(total + 10000));

    await resetPpn(screen, row);
    await expectText(browser.locator('#tax-ppn-value'), 'Non PPN');
    await expectText(browser.locator('#tax-subtotal-value'), rp(total));
  });

  test('PPN persen per baris memakai charges baris itu', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    const total = await waitTotal(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

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

    await expectText(browser.locator('#tax-ppn-value'), amountStr);
    await expectText(browser.locator('#tax-subtotal-value'), rp(total + amount));

    await resetPpn(screen, row);
    await expectText(browser.locator('#tax-subtotal-value'), rp(total));
  });

  test('PPH hanya status: menghitung transaksi, subtotal tidak berubah', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitTotal(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    const sub0 = await valueOf(browser, '#tax-subtotal-value');
    const ppn0 = await valueOf(browser, '#tax-ppn-value');
    await row.getByTestId(/^pph-toggle-/).tap();
    await expectText(row.getByTestId(/^pph-toggle-/), 'PPH');
    await expectText(browser.locator('#tax-pph-value'), '1 transaksi');
    // Subtotal & PPN TIDAK berubah oleh status PPH (tanpa potongan).
    await expectText(browser.locator('#tax-subtotal-value'), sub0);
    await expectText(browser.locator('#tax-ppn-value'), ppn0);

    await row.getByTestId(/^pph-toggle-/).tap();
    await expectText(browser.locator('#tax-pph-value'), 'Non PPH');
    await expectText(browser.locator('#tax-subtotal-value'), sub0);
  });

  test('Batal dan backdrop menutup modal tanpa menyimpan', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitTotal(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    // Batal: isi nilai lalu batal, chip & rekap tidak berubah.
    await openPpnModal(screen, row);
    await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
    const dlg = screen.getByRole('dialog', { name: 'PPN' });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Persen (%)').fill('50');
    await dlg.getByRole('button', { name: 'Batal' }).tap();
    await expect(dlg).toBeHidden();
    await expectText(row.getByTestId(/^ppn-trigger-/), 'PPN: Non PPN');
    await expectText(browser.locator('#tax-ppn-value'), 'Non PPN');

    // Backdrop: titik tengah tertutup dialog, klik pojok kiri-atas.
    await openPpnModal(screen, row);
    await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Persen (%)').fill('30');
    await browser
      .locator('div.fixed.inset-0.z-50 > div.absolute.inset-0')
      .tap({ position: { x: 6, y: 6 } });
    await expect(dlg).toBeHidden();
    await expectText(row.getByTestId(/^ppn-trigger-/), 'PPN: Non PPN');
    await expectText(browser.locator('#tax-ppn-value'), 'Non PPN');
  });

  test('nilai pajak per baris bertahan setelah reload', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await waitTotal(browser);
    await clearTaxState(screen, browser);
    const row = oncRow(browser);

    await savePpnRupiah(screen, row, '10000');

    // Navigasi ulang penuh: nilai baris bertahan dari finance-tax-v2.
    await app.open('/finance');
    const total = await waitTotal(browser);
    await expectText(row.getByTestId(/^ppn-trigger-/), 'PPN: Rp 10.000');
    await expectText(browser.locator('#tax-ppn-value'), rp(10000));
    await expectText(browser.locator('#tax-subtotal-value'), rp(total + 10000));

    // Kebersihan sesi: kembalikan baris ke Non.
    await resetPpn(screen, row);
    await expectText(browser.locator('#tax-subtotal-value'), rp(total));
  });
});
