// Uji H7: confirmUpload yang GAGAL verifikasi harus langsung menghapus objek
// dari R2, bukan menunggu cron 30 menit.
// Dulu: ContentLength pada presigned PUT bukan signed header (S3 mengabaikan
// batas client), sehingga penyerang berizin finance bisa menaruh file raksasa
// di bucket; objeknya bertahan sampai cleanupStuck jalan. Sesudah fix:
// verify gagal → objek dihapus saat itu juga (best-effort) + baris DB failed.
// node:test + stub s3/db (tanpa R2 asli). Jalankan: npm test
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PdfService } from '../src/pdf/pdf.service.ts';

const MAX_MB = Number(process.env.R2_MAX_MB || 10);

function serviceWithStubs(s3: any, rows: any[]) {
  const svc = new PdfService();
  (svc as any).s3 = s3;
  (svc as any).db = {
    execute: async (q: string) => {
      if (typeof q === 'string' && q.startsWith('SELECT * FROM invoice_pdfs')) {
        return { rows };
      }
      return { rows: [] };
    },
  };
  (svc as any).db.pq = async (text: string, params: any[]) =>
    (svc as any).db.execute(`${text} /*${JSON.stringify(params)}*/`);
  return svc;
}

describe('H7 — objek gagal verifikasi langsung dihapus dari R2', () => {
  // needS3() mensyaratkan R2_BUCKET_NAME; R2 asli tidak dipakai (s3 di-stub).
  const savedBucket = process.env.R2_BUCKET_NAME;
  process.env.R2_BUCKET_NAME = 'test-bucket';
  after(() => {
    if (savedBucket === undefined) delete process.env.R2_BUCKET_NAME;
    else process.env.R2_BUCKET_NAME = savedBucket;
  });
  it('file oversize → DeleteObject dikirim + VERIFY_FAILED', async () => {
    const sent: any[] = [];
    const s3 = {
      send: async (cmd: any) => {
        sent.push(cmd);
        if (cmd instanceof HeadObjectCommand) {
          return { ContentLength: (MAX_MB + 5) * 1024 * 1024 };
        }
        return {};
      },
    };
    const svc = serviceWithStubs(s3, [
      { id: 'pdf-big', record_uuid: 'case-1', filename: 'x.pdf', storage_key: 'invoices/case-1/big.pdf', status: 'uploading' },
    ]);
    await assert.rejects(
      () => svc.confirmUpload('pdf-big', 'tester'),
      (e: any) => e?.response?.code === 'VERIFY_FAILED',
    );
    const dels = sent.filter((c) => c instanceof DeleteObjectCommand);
    assert.equal(dels.length, 1, 'objek oversize harus dihapus dari R2 saat itu juga');
    assert.equal(dels[0]?.input?.Key, 'invoices/case-1/big.pdf');
  });

  it('isi bukan PDF → DeleteObject dikirim + VERIFY_FAILED', async () => {
    const sent: any[] = [];
    const s3 = {
      send: async (cmd: any) => {
        sent.push(cmd);
        if (cmd instanceof HeadObjectCommand) return { ContentLength: 1024 };
        // GetObject Range bytes=0-4 mengembalikan bukan %PDF-
        return { Body: (async function* () { yield Buffer.from('MZ...', 'latin1'); })() };
      },
    };
    const svc = serviceWithStubs(s3, [
      { id: 'pdf-fake', record_uuid: 'case-2', filename: 'x.pdf', storage_key: 'invoices/case-2/fake.pdf', status: 'uploading' },
    ]);
    await assert.rejects(
      () => svc.confirmUpload('pdf-fake', 'tester'),
      (e: any) => e?.response?.code === 'VERIFY_FAILED',
    );
    const dels = sent.filter((c) => c instanceof DeleteObjectCommand);
    assert.equal(dels.length, 1, 'objek non-PDF harus dihapus dari R2 saat itu juga');
  });
});
