import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('dashboard', { tags: ['dashboard', 'smoke'] }, () => {
  test('halaman dashboard termuat dengan navigasi utama', { session: 'admin' }, async ({ app, screen, browser }) => {
    await app.open('/dashboard');
    await expect(browser).toHaveURL(/\/dashboard/);
    await expect(screen.getByRole('navigation', 'Navigasi utama').first()).toBeVisible();
  });
});
