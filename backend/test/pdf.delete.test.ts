// M5: delete PDF harus fail-closed. Kode lama: R2 DeleteObject gagal →
// hanya warn, baris DB tetap dihapus → object yatim di storage tanpa metadata.
// Perbaikan: R2 gagal → error keluar, row DB dipertahankan (bisa retry).
// Jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfService } from '../src/pdf/pdf.service.ts';

describe('hapus PDF fail-closed (M5)', () => {
  it('R2 DeleteObject gagal → error + baris DB TIDAK dihapus', async () => {
    const svc: any = new PdfService();
    let dbDeleted = false;
    svc.db = {
      execute: async (sql: string) => {
        if (/DELETE FROM invoice_pdfs/.test(sql)) { dbDeleted = true; return { rows: [] }; }
        if (/SELECT \* FROM invoice_pdfs/.test(sql)) {
          return { rows: [{ id: 'pdf-1', record_uuid: 'rec-1', filename: 'inv.pdf', storage_key: 'k/pdf-1', status: 'completed' }] };
        }
        if (/invoice_status|audit_status/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    };
    (svc as any).needS3 = () => ({
      send: async () => { throw new Error('R2 timeout'); },
    });
    // after remove throws, status lookups shouldn't run — but stub returns empty anyway
    await assert.rejects(
      () => svc.remove('pdf-1', 'Tester'),
      (e: any) => e?.status === 502 && /R2_DELETE_FAILED/.test(JSON.stringify(e?.response || e?.message || '')),
      'R2 gagal harus keluar sebagai 502 R2_DELETE_FAILED',
    );
    assert.equal(dbDeleted, false, 'baris DB wajib dipertahankan agar bisa retry');
  });
});
