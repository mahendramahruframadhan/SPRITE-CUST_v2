// Komponen Jadwal Audit (tab baru Popi Nava) — vitest + Testing Library.
// Jalankan: npm run test:ui
// Mencakup: kartu minggu kalender (4-5 termasuk W5), navigasi bulan, alur
// tambah brand/outlet via drawer, pindah minggu, dan empty state.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import { ConfirmProvider } from '../src/components/ui/ConfirmProvider.jsx';
import AuditSchedule from '../src/components/popinava/AuditSchedule.jsx';
import { formatMonthLabel, monthKeyOf, formatWeekRange, monthWeeks } from '../src/lib/auditSchedule.js';

const OUTLETS = [
  {
    uuid: 'u1', brandName: 'Chambers', deptChannelName: 'Chambers Tebet', status: 'active',
    rvtCustcode: 'RVT-CHM', deptCode: '03010301', deptName: 'DISTRIBUTION',
    isoCode: 'ID-JK', city: 'JAKARTA', province: 'DKI JAKARTA', postcode: '12870', region: 'P.JAWA',
  },
  {
    uuid: 'u2', brandName: 'Chambers', deptChannelName: 'Chambers Bekasi', status: 'active',
    rvtCustcode: 'RVT-CHM', deptCode: '03010302', deptName: 'RETAIL',
    isoCode: 'ID-JB', city: 'BEKASI', province: 'JAWA BARAT', postcode: '17111', region: 'P.JAWA',
  },
  {
    uuid: 'u3', brandName: 'SCH', deptChannelName: 'SCH Puri', status: 'active',
    rvtCustcode: 'RVT-SCH', deptCode: '04020101', deptName: 'DISTRIBUTION',
    isoCode: 'ID-YO', city: 'YOGYAKARTA', province: 'DAERAH ISTIMEWA YOGYAKARTA', postcode: '55581', region: 'P.JAWA',
  },
];

function renderSchedule(props = {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <AuditSchedule outlets={OUTLETS} canWrite {...props} />
      </ConfirmProvider>
    </ToastProvider>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const jsonRes = (data) => ({ status: 200, ok: true, json: async () => data });
const EMPTY_WEEKS = { W1: [], W2: [], W3: [], W4: [], W5: [] };

// Stub fetch: endpoint jadwal dilayani sesuai skenario; endpoint lain
// gagal cepat (mimik offline) supaya perilaku fallback tetap utuh.
function stubScheduleFetch(getHandler, putHandler) {
  vi.stubGlobal('fetch', async (url, opts = {}) => {
    const method = opts.method || 'GET';
    if (String(url).includes('/api/audit-schedule')) {
      if (method === 'GET') return getHandler();
      if (method === 'PUT') return putHandler(opts);
      throw new TypeError(`method tak dikenal ${method}`);
    }
    throw new TypeError('Failed to parse URL');
  });
}

describe('AuditSchedule', () => {
  it('menampilkan 4 kartu minggu W1-W4 dengan rentang hari kerja', async () => {
    renderSchedule();
    expect(await screen.findByRole('heading', { name: 'W1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'W2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'W3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'W4' })).toBeInTheDocument();
    // Rentang hari kerja tampil (contoh: "2-6 Feb" style) di bawah label.
    expect(screen.getAllByText(/\d+-\d+\s\w+/).length).toBeGreaterThan(0);
  });

  it('label bulan mengikuti bulan aktif dan tombol navigasi berpindah bulan', async () => {
    renderSchedule();
    const thisMonth = formatMonthLabel(monthKeyOf(new Date()));
    expect(await screen.findByText(thisMonth)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Bulan berikutnya/ }));
    const next = formatMonthLabel(monthKeyOf(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)));
    await waitFor(() => expect(screen.getByText(next)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Bulan sebelumnya/ }));
    await waitFor(() => expect(screen.getByText(thisMonth)).toBeInTheDocument());
  });

  it('alur tambah: buka drawer dari W1, pilih brand, simpan, item muncul di kartu W1', async () => {
    renderSchedule();
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    const card = w1.closest('section');
    fireEvent.click(within(card).getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: /Tambah jadwal/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pilih brand Chambers' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan jadwal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(card).getByText('Chambers')).toBeInTheDocument();
  });

  it('item bisa dipindah ke minggu lain lewat drag & drop', async () => {
    renderSchedule();
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    const card1 = w1.closest('section');
    fireEvent.click(within(card1).getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: /Tambah jadwal/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pilih brand SCH' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan jadwal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const item = within(card1).getByText('SCH').closest('li');
    const w4 = (await screen.findByRole('heading', { name: 'W4' })).closest('section');
    const dataTransfer = {
      data: {},
      setData(type, v) {
        this.data[type] = v;
      },
      getData(type) {
        return this.data[type];
      },
    };
    fireEvent.dragStart(item, { dataTransfer });
    fireEvent.dragOver(w4, { dataTransfer });
    fireEvent.drop(w4, { dataTransfer });
    await waitFor(() => expect(within(w4).getByText('SCH')).toBeInTheDocument());
    expect(within(card1).queryByText('SCH')).not.toBeInTheDocument();
    // Label minggu di kartu ikut berubah mengikuti kolom tujuan.
    const moved = within(w4).getByText('SCH').closest('li');
    expect(within(moved).getByText('W4')).toBeInTheDocument();
  });

  it('empty state memberi CTA tambah jadwal pertama', async () => {
    renderSchedule();
    expect(await screen.findByText(/Belum ada jadwal audit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tambah jadwal pertama/ })).toBeInTheDocument();
  });

  it('tanpa izin tulis: tombol tambah & aksi item tidak muncul', async () => {
    renderSchedule({ canWrite: false });
    await screen.findByRole('heading', { name: 'W1' });
    expect(screen.queryAllByRole('button', { name: 'Tambah' })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Tambah jadwal pertama/ })).not.toBeInTheDocument();
  });

  it('rentang W1 mengikuti minggu kalender (Senin pertama bulan berjalan)', async () => {
    renderSchedule();
    await screen.findByRole('heading', { name: 'W1' });
    const now = new Date();
    const expected = formatWeekRange(monthWeeks(now.getFullYear(), now.getMonth())[0]);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('bulan 5 minggu kalender menampilkan kartu W5', async () => {
    renderSchedule();
    await screen.findByRole('heading', { name: 'W1' });
    const now = new Date();
    let back = 0;
    let target = null;
    for (let i = 1; i <= 12 && !target; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      if (monthWeeks(d.getFullYear(), d.getMonth()).length === 5) {
        target = d;
        back = i;
      }
    }
    expect(target).not.toBeNull();
    for (let i = 0; i < back; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Bulan sebelumnya/ }));
    }
    await screen.findByRole('heading', { name: 'W5' });
    const lastWeek = monthWeeks(target.getFullYear(), target.getMonth())[4];
    expect(screen.getByText(formatWeekRange(lastWeek))).toBeInTheDocument();
  });

  it('copy footer menjelaskan aturan minggu kalender', async () => {
    renderSchedule();
    expect(await screen.findByText(/Ikut minggu kalender Sen-Jum/)).toBeInTheDocument();
  });
});

describe('AuditScheduleDrawer — daftar brand sebagai kategori', () => {
  async function openDrawer() {
    renderSchedule();
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    fireEvent.click(within(w1.closest('section')).getByRole('button', { name: 'Tambah' }));
    return screen.findByRole('dialog', { name: /Tambah jadwal/ });
  }

  it('tiap brand jadi region kategori berisi outletnya sendiri, urut A→Z', async () => {
    const dialog = await openDrawer();
    const regions = within(dialog).getAllByRole('region');
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual(['Chambers', 'SCH']);
    expect(within(regions[0]).getByText('Chambers Tebet')).toBeInTheDocument();
    expect(within(regions[0]).getByText('Chambers Bekasi')).toBeInTheDocument();
    expect(within(regions[0]).queryByText('SCH Puri')).not.toBeInTheDocument();
    expect(within(regions[1]).getByText('SCH Puri')).toBeInTheDocument();
    // Tiap kategori punya tombol pilih brand + jumlah outlet.
    expect(within(regions[0]).getByRole('button', { name: 'Pilih brand Chambers' })).toBeInTheDocument();
    expect(within(regions[0]).getByText(/2 outlet/)).toBeInTheDocument();
  });

  it('chevron melipat/membuka grup outlet (aria-expanded)', async () => {
    const dialog = await openDrawer();
    const toggle = within(dialog).getByRole('button', { name: 'Chambers' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByText('Chambers Tebet')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(within(dialog).getByText('Chambers Tebet')).toBeInTheDocument();
  });

  it('search brand → grup tampil utuh; search outlet → hanya grup berisi outlet cocok', async () => {
    const dialog = await openDrawer();
    const input = within(dialog).getByLabelText('Cari brand / outlet');
    fireEvent.change(input, { target: { value: 'SCH' } });
    expect(within(dialog).queryByRole('region', { name: 'Chambers' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'SCH' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Tebet' } });
    const chambers = within(dialog).getByRole('region', { name: 'Chambers' });
    expect(within(chambers).getByText('Chambers Tebet')).toBeInTheDocument();
    expect(within(chambers).queryByText('Chambers Bekasi')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('region', { name: 'SCH' })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'xyz-tidak-ada' } });
    expect(within(dialog).getByText(/Tidak ada/)).toBeInTheDocument();
  });

  it('baris outlet menampilkan detail code (custcode · dept · geo sesuai baris data)', async () => {
    const dialog = await openDrawer();
    const region = within(dialog).getByRole('region', { name: 'Chambers' });
    const label = within(region).getByText('Chambers Tebet').closest('label');
    expect(within(label).getByText('RVT-CHM · 03010301 · DISTRIBUTION')).toBeInTheDocument();
    expect(within(label).getByText('ID-JK · JAKARTA · DKI JAKARTA · 12870 · P.JAWA')).toBeInTheDocument();
  });

  it('search nyambung ke code: custcode, dept code, dan kota', async () => {
    const dialog = await openDrawer();
    const input = within(dialog).getByLabelText('Cari brand / outlet');
    fireEvent.change(input, { target: { value: 'RVT-SCH' } });
    expect(within(dialog).getByRole('region', { name: 'SCH' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('region', { name: 'Chambers' })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '03010302' } });
    expect(within(dialog).getByRole('region', { name: 'Chambers' })).toBeInTheDocument();
    expect(within(dialog).getByText('Chambers Bekasi')).toBeInTheDocument();
    expect(within(dialog).queryByText('Chambers Tebet')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'YOGYAKARTA' } });
    expect(within(dialog).getByRole('region', { name: 'SCH' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('region', { name: 'Chambers' })).not.toBeInTheDocument();
  });
});

describe('AuditSchedule — detail kartu jadwal (brand & outlet)', () => {
  async function addBrandToW1(brand) {
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    const card = w1.closest('section');
    fireEvent.click(within(card).getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: /Tambah jadwal/ });
    fireEvent.click(within(dialog).getByRole('button', { name: `Pilih brand ${brand}` }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan jadwal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    return card;
  }

  async function addOutletToW1(outletLabel) {
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    const card = w1.closest('section');
    fireEvent.click(within(card).getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: /Tambah jadwal/ });
    fireEvent.click(within(dialog).getByLabelText(outletLabel));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan jadwal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    return card;
  }

  it('kartu outlet: eyebrow tipe · brand + baris sub custcode · kota', async () => {
    renderSchedule();
    const card = await addOutletToW1('Chambers Tebet (Chambers)');
    expect(within(card).getByText('Outlet · Chambers')).toBeInTheDocument();
    expect(within(card).getByText('Chambers Tebet')).toBeInTheDocument();
    expect(within(card).getByText('RVT-CHM · JAKARTA')).toBeInTheDocument();
  });

  it('kartu brand: menampilkan jumlah outlet ikut dari data master', async () => {
    renderSchedule();
    const card = await addBrandToW1('Chambers');
    expect(within(card).getByText('Brand')).toBeInTheDocument();
    expect(within(card).getByText('Chambers')).toBeInTheDocument();
    expect(within(card).getByText('2 outlet ikut')).toBeInTheDocument();
  });

  it('chevron membuka/menutup daftar outlet brand (aria-expanded)', async () => {
    renderSchedule();
    const card = await addBrandToW1('Chambers');
    const toggle = within(card).getByRole('button', { name: 'Daftar outlet Chambers' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText('Chambers Bekasi')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByText('Chambers Tebet')).toBeInTheDocument();
    expect(within(card).getByText('Chambers Bekasi')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText('Chambers Bekasi')).not.toBeInTheDocument();
  });

  it('outlet tak ada di master: kartu tetap tampil nama + brand tanpa baris sub', async () => {
    const mk = monthKeyOf(new Date());
    localStorage.setItem(
      'sprite.auditSchedule.v1',
      JSON.stringify({
        [mk]: {
          month: mk,
          weeks: {
            W1: [{ id: 'ghost', type: 'outlet', uuid: 'no-such-uuid', brand: 'Hilang', name: 'Outlet Tak Ada' }],
            W2: [],
            W3: [],
            W4: [],
            W5: [],
          },
        },
      }),
    );
    renderSchedule();
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    const card = w1.closest('section');
    expect(within(card).getByText('Outlet Tak Ada')).toBeInTheDocument();
    expect(within(card).getByText('Outlet · Hilang')).toBeInTheDocument();
    expect(within(card).queryByText(/^RVT-/)).not.toBeInTheDocument();
  });

  it('select pindah diganti: tak ada combobox, ada label minggu statis di kartu', async () => {
    renderSchedule();
    const card = await addBrandToW1('Chambers');
    const item = within(card).getByText('Chambers').closest('li');
    expect(within(item).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(item).getByText('W1')).toBeInTheDocument();
  });

  it('kartu tanpa izin tulis tidak draggable', async () => {
    const mk = monthKeyOf(new Date());
    localStorage.setItem(
      'sprite.auditSchedule.v1',
      JSON.stringify({
        [mk]: {
          month: mk,
          weeks: {
            W1: [{ id: 'keep', type: 'outlet', uuid: 'no-such-uuid', brand: 'Hilang', name: 'Outlet Statis' }],
            W2: [],
            W3: [],
            W4: [],
            W5: [],
          },
        },
      }),
    );
    renderSchedule({ canWrite: false });
    const w1 = await screen.findByRole('heading', { name: 'W1' });
    const item = within(w1.closest('section')).getByText('Outlet Statis').closest('li');
    expect(item).toHaveAttribute('draggable', 'false');
  });
});

describe('AuditSchedule · status sinkron (badge server / lokal)', () => {
  it('GET server → badge Tersinkron + info pengubah (updatedBy & waktu)', async () => {
    stubScheduleFetch(
      () =>
        jsonRes({
          month: monthKeyOf(new Date()),
          weeks: EMPTY_WEEKS,
          updatedBy: 'budi@corp.id',
          updatedAt: '2026-10-02T07:32:00.000Z',
        }),
      async () => {
        throw new Error('PUT tak diharapkan');
      },
    );
    renderSchedule();
    expect(await screen.findByText(/Tersinkron/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/budi@corp\.id/)).toBeInTheDocument();
    expect(screen.getByText(/\d{1,2} Okt \d{2}:\d{2}/)).toBeInTheDocument();
  });

  it('PUT gagal saat simpan → toast peringatan + badge jadi Tersimpan lokal', async () => {
    stubScheduleFetch(
      () => jsonRes({ month: monthKeyOf(new Date()), weeks: EMPTY_WEEKS, updatedBy: null, updatedAt: null }),
      async () => {
        throw new Error('server menolak');
      },
    );
    renderSchedule();
    const w1 = (await screen.findByRole('heading', { name: 'W1' })).closest('section');
    fireEvent.click(within(w1).getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: /Tambah jadwal/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pilih brand SCH' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan jadwal' }));
    expect(await screen.findByText(/Gagal kirim ke server/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText(/Tersimpan lokal/, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('badge Menyinkronkan… selama PUT berjalan, lalu Tersinkron + pengubah baru', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    stubScheduleFetch(
      () => jsonRes({ month: monthKeyOf(new Date()), weeks: EMPTY_WEEKS, updatedBy: null, updatedAt: null }),
      async () => {
        await gate;
        return jsonRes({ ok: true, updatedBy: 'sari@corp.id', updatedAt: '2026-10-02T10:00:00.000Z' });
      },
    );
    renderSchedule();
    const w1 = (await screen.findByRole('heading', { name: 'W1' })).closest('section');
    fireEvent.click(within(w1).getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: /Tambah jadwal/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pilih brand SCH' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan jadwal' }));
    expect(await screen.findByText('Menyinkronkan…', {}, { timeout: 5000 })).toBeInTheDocument();
    release();
    expect(await screen.findByText(/Tersinkron/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText(/sari@corp\.id/, {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
