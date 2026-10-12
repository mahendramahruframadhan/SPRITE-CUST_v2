import { test } from '@e2e-dev/web';
import { credentials, expect } from 'e2e';

test.setup('sesi admin', { sessions: ['admin'] }, async ({ app, screen, session, browser }) => {
  const admin = credentials.user('admin');
  await app.open('/login');
  await screen.getByPlaceholder('nama@perusahaan.id').fill(admin.username);
  await screen.getByPlaceholder('••••••••').fill(admin.password);
  await screen.getByRole('button', 'Login').tap();
  await expect(browser).toHaveURL(/\/dashboard/);
  await session.save('admin');
});
