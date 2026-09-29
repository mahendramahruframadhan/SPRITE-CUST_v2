// Integrasi frontend ↔ backend NYATA (bukan mock).
// Prasyarat: backend dev jalan di http://localhost:5005 (npm run dev) dan ada
// akun integrasi it.popinava@revota.id (Admin CS, popinava:1). Tanpa backend,
// seluruh file ini di-skip agar npm run test:ui tetap hijau secara mandiri.
// Membuktikan: probe memakai data server sebagai sumber kebenaran (termasuk
// saat server kosong — bukan seed lokal), create/edit/hapus via drawer &
// aksi baris benar-benar POST/PATCH/DELETE ke /api/popinava, dan setiap
// operasi tulis tercatat di activity_logs kategori popinava.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const API = 'http://127.0.0.1:5005/api';
vi.stubEnv('VITE_API_URL', API);
vi.setConfig({ testTimeout: 20000 });

const backendUp = await fetch(`${API}/health`)
  .then((r) => r.ok)
  .catch(() => false);

let token = '';
const api = (p, opts = {}) =>
  fetch(`${API}${p}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token, ...(opts.headers || {}) },
  });

async function apiJson(p, opts) {
  const r = await api(p, opts);
  return r.json();
}

async function serverTotal() {
  const d = await apiJson('/popinava?page=1&pageSize=1');
  return d.total;
}

async function logActions() {
  const rows = await apiJson('/roles/logs');
  const list = Array.isArray(rows) ? rows : rows.items || rows.logs || [];
  return list.filter((r) => r.category === 'popinava').map((r) => r.action);
}

function seedSession() {
  localStorage.setItem('loggedIn', 'true');
  localStorage.setItem('userEmail', 'it.popinava@revota.id');
  localStorage.setItem('userName', 'IT Integrasi');
  localStorage.setItem('userRole', 'Admin CS');
  localStorage.setItem('authToken', token);
}

async function renderPage() {
  const [{ AuthProvider }, { ToastProvider }, { ConfirmProvider }, { default: PopiNavaPage }] = await Promise.all([
    import('../src/context/AuthContext.jsx'),
    import('../src/context/ToastContext.jsx'),
    import('../src/components/ui/ConfirmProvider.jsx'),
    import('../src/pages/PopiNavaPage.jsx'),
  ]);
  return render(
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PopiNavaPage />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>,
  );
}

// jsdom tidak memicu onSubmit dari klik tombol submit — dispatch langsung.
function submitDialog(dlg) {
  fireEvent.submit(dlg.querySelector('form'));
}

async function fillOutlet(dlg, city = 'Bekasi') {
  const d = within(dlg);
  fireEvent.change(d.getByLabelText(/^Brand/), { target: { value: 'ITTEST' } });
  fireEvent.change(d.getByLabelText(/^Custcode/), { target: { value: 'RVT-IT1' } });
  fireEvent.change(d.getByLabelText(/^Dept code/), { target: { value: '10000055' } });
  fireEvent.change(d.getByLabelText(/^Dept name/), { target: { value: 'SHOP' } });
  fireEvent.change(d.getByLabelText(/^Nama channel/), { target: { value: 'Toko IT' } });
  fireEvent.change(d.getByLabelText(/^Iso code/), { target: { value: 'ID-JB' } });
  fireEvent.change(d.getByLabelText(/^Kota/), { target: { value: city } });
  fireEvent.change(d.getByLabelText(/^Provinsi/), { target: { value: 'JAWA BARAT' } });
  fireEvent.change(d.getByLabelText(/^Negara/), { target: { value: 'INDONESIA' } });
  return d;
}

describe.skipIf(!backendUp)('integrasi frontend ↔ backend /api/popinava', () => {
  beforeAll(async () => {
    const r = await apiJson('/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'it.popinava@revota.id', password: 'password123' }),
    });
    token = r.token;
    expect(token, 'sign-in integrasi harus menghasilkan token').toBeTruthy();
    seedSession();
    // Bersihkan sisa run sebelumnya (hanya baris uji milik kita).
    const d = await apiJson('/popinava?page=1&pageSize=5000');
    for (const item of d.items.filter((x) => String(x.dept_channel_name || '').startsWith('Toko IT'))) {
      await api(`/popinava/${item.uuid}`, { method: 'DELETE' });
    }
  });

  afterAll(async () => {
    if (!token) return;
    const d = await apiJson('/popinava?page=1&pageSize=5000').catch(() => ({ items: [] }));
    for (const item of d.items.filter((x) => String(x.dept_channel_name || '').startsWith('Toko IT'))) {
      await api(`/popinava/${item.uuid}`, { method: 'DELETE' }).catch(() => {});
    }
    localStorage.clear();
  });

  it('probe sukses → mode server; data server menggantikan seed lokal', async () => {
    const total = await serverTotal();
    await renderPage();
    expect(await screen.findByText('Data tersimpan di server.')).toBeInTheDocument();
    if (total === 0) {
      // Server kosong = tampil kosong; seed 88 baris TIDAK boleh dipaksakan.
      expect(await screen.findByText('Belum ada data outlet')).toBeInTheDocument();
      expect(screen.queryByText(/^88 baris cocok/)).toBeNull();
    } else {
      await screen.findByText(new RegExp(`^${total} baris cocok`));
    }
  });

  it('tambah via drawer → benar-benar POST ke server + tercatat di activity_logs', async () => {
    const before = await serverTotal();
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Tambah Outlet/ }));
    const dlg = await screen.findByRole('dialog', { name: /Tambah outlet/ });
    await fillOutlet(dlg);
    submitDialog(dlg);

    expect(await screen.findByText(/ditambahkan/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Tambah outlet/ })).toBeNull());
    expect(await screen.findByText('Toko IT')).toBeInTheDocument();
    await waitFor(async () => expect(await serverTotal()).toBe(before + 1));
    const actions = await logActions();
    expect(actions).toContain('Tambah outlet');
  });

  it('ubah via drawer edit → PATCH ke server + log Ubah outlet', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ubah Toko IT' }));
    const dlg = await screen.findByRole('dialog', { name: /Ubah outlet/ });
    const d = within(dlg);
    fireEvent.change(d.getByLabelText(/^Kota/), { target: { value: 'Tangerang' } });
    submitDialog(dlg);

    expect(await screen.findByText(/diperbarui/)).toBeInTheDocument();
    // Tangerang muncul di sel tabel + opsi filter kota (facets ikut berubah).
    expect((await screen.findAllByText('Tangerang')).length).toBeGreaterThan(0);
    const items = (await apiJson('/popinava?search=Toko%20IT')).items;
    const row = items.find((x) => x.dept_channel_name === 'Toko IT');
    expect(row.city).toBe('Tangerang');
    expect(row.updated_at, 'updated_at diisi server').toBeTruthy();
    expect(await logActions()).toContain('Ubah outlet');
  });

  it('hapus via aksi baris → DELETE ke server + log Hapus outlet', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus Toko IT' }));
    const confirm = await screen.findByRole('button', { name: 'Ya, hapus' });
    fireEvent.click(confirm);
    expect(await screen.findByText(/dihapus/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Toko IT')).toBeNull());
    const items = (await apiJson('/popinava?search=Toko%20IT')).items;
    expect(items.find((x) => x.dept_channel_name === 'Toko IT')).toBeUndefined();
    expect(await logActions()).toContain('Hapus outlet');
  });
});
