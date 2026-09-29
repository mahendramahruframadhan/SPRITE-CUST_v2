// Reconnect (Coba lagi) setelah mode lokal: server kosong → seed bawaan
// dibuang (server = sumber kebenaran) TAPI baris yang dibuat user saat offline
// harus bertahan, termasuk di localStorage (tidak boleh ditelan probe).
// Regression test untuk temuan review: probe tanpa syarat menelan baris lokal.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const ctl = vi.hoisted(() => ({ mode: 'reject', items: [] }));

vi.mock('../src/lib/api.js', () => ({
  getPopinava: vi.fn(async () => {
    if (ctl.mode === 'reject') throw new Error('network down');
    return {
      items: ctl.items,
      total: ctl.items.length,
      page: 1,
      pageSize: 5000,
      facets: { brands: [], cities: [], areas: [], statuses: [] },
    };
  }),
  postPopinava: vi.fn(),
  patchPopinava: vi.fn(),
  deletePopinava: vi.fn(),
  postPopinavaBulk: vi.fn(),
}));

const payload = {
  brand_name: 'BRAND RECONNECT',
  rvt_custcode: 'RVT-RCN',
  dept_code: '99000001',
  dept_name: 'SHOP',
  dept_channel_name: 'Toko Offline',
  iso_code: 'ID-JB',
  city: 'Depok',
  province: 'JAWA BARAT',
  country: 'INDONESIA',
  status: 'active',
};

describe('usePopinava reconnect (probe sukses)', () => {
  beforeEach(() => {
    localStorage.clear();
    ctl.mode = 'reject';
    ctl.items = [];
  });

  it('baris offline bertahan, seed dibuang, localStorage tidak ditelan', async () => {
    const { usePopinava } = await import('../src/hooks/usePopinava.js');
    const { result } = renderHook(() => usePopinava());

    await waitFor(() => expect(result.current.serverOk).toBe(false));
    expect(result.current.rows.length, 'seed pristine dimuat saat mode lokal').toBe(88);

    let created;
    await act(async () => {
      created = await result.current.create(payload);
    });
    expect(result.current.rows.length, 'create lokal menambah 1 baris').toBe(89);

    ctl.mode = 'empty';
    await act(async () => {
      await result.current.retryProbe();
    });

    expect(result.current.serverOk).toBe(true);
    expect(
      result.current.rows.map((r) => r.uuid),
      'seed hilang, baris offline tersisa'
    ).toEqual([created.uuid]);

    const stored = JSON.parse(localStorage.getItem('sprite.popinava.v1'));
    expect(stored.map((r) => r.uuid), 'localStorage menyimpan baris offline').toEqual([created.uuid]);
  });
});
