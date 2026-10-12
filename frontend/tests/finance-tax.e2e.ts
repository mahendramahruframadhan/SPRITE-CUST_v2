import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Helper: baca nilai rupiah dari DOM panel TaxSummaryPanel via CSS id.
// valueOf bertoleransi terhadap stall transient: begitu data tiba, renderer
// sibuk oleh badai request PDF per baris sehingga read bisa timeout ~20s
// (bukti di trace run 01a12efb). Retry per detik sampai deadline, telan error.
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
// expect(loc).toHaveText yang tahan stall: retry sampai deadline.
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
// Data kasus dimuat async; tunggu total siap (>0) sebelum dipakai hitungan
// ekspektasi. valueOf sudah retry, loop ini untuk kondisi nilai belum siap.
const waitTotal = async (browser: any) => {
  const deadline = Date.now() + 60000;
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
  throw new Error(`total tidak siap dalam 60s (nilai terakhir: ${last})`);
};

describe('finance: PPN, PPH & subtotal', { tags: ['finance'] }, () => {
  test('default non-aktif, subtotal = Total Charges, Non tidak membuka modal', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    await expectText(browser.locator('#tax-ppn-value'), 'Non PPN');
    await expectText(browser.locator('#tax-pph-value'), 'Non PPH');

    const total = await waitTotal(browser);
    await expectText(browser.locator('#tax-subtotal-value'), rp(total));

    await screen.getByRole('button', { name: 'PPN: Non PPN' }).tap();
    const menu = screen.getByRole('menu', { name: 'Opsi PPN' });
    await expect(menu).toBeVisible();
    await screen.getByRole('menuitem', { name: /^Non PPN \(reset\)/ }).tap();
    await expect(menu).toBeHidden();
    await expect(screen.getByRole('dialog')).toBeHidden();
  });

  test('PPN mode Rupiah 100000 menambah subtotal', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    const total = await waitTotal(browser);

    await screen.getByRole('button', { name: 'PPN: Non PPN' }).tap();
    await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
    const dlg = screen.getByRole('dialog', { name: 'PPN' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Persen' })).toHaveAttribute('aria-pressed', 'true');

    await dlg.getByRole('button', { name: 'Rupiah' }).tap();
    const save = dlg.getByRole('button', { name: 'Simpan' });
    await expect(save).toBeDisabled();
    await dlg.getByLabel('Nilai (Rp)').fill('100000');
    await expect(save).toBeEnabled();
    await save.tap();

    await expect(dlg).toBeHidden();
    await expectText(browser.locator('#tax-ppn-value'), rp(100000));
    await expectText(browser.locator('#tax-subtotal-value'), rp(total + 100000));
  });

  test('PPN mode Persen 11% diturunkan dari total', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    const total = await waitTotal(browser);
    const expectedPpn = Math.round(total * 0.11);

    await screen.getByRole('button', { name: /^PPN: / }).tap();
    await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
    const dlg = screen.getByRole('dialog', { name: 'PPN' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'Persen' }).tap();
    await dlg.getByLabel('Persen (%)').fill('11');
    await expect(dlg.getByText(/Perkiraan nilai/)).toHaveText(`Perkiraan nilai: ${rp(expectedPpn)}`);
    await dlg.getByRole('button', { name: 'Simpan' }).tap();

    await expect(dlg).toBeHidden();
    await expectText(browser.locator('#tax-subtotal-value'), rp(total + expectedPpn));
  });

  test('Escape membatalkan perubahan di modal PPN', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/finance');
    const before = await valueOf(browser, '#tax-ppn-value');

    await screen.getByRole('button', { name: /^PPN: / }).tap();
    await screen.getByRole('menuitem', { name: /^PPN \(isi pajak\)/ }).tap();
    const dlg = screen.getByRole('dialog', { name: 'PPN' });
    await expect(dlg).toBeVisible();
    const field = dlg.getByLabel('Persen (%)');
    await field.fill('50');
    await field.press('Escape');

    await expect(dlg).toBeHidden();
    await expectText(browser.locator('#tax-ppn-value'), before);
  });
});
