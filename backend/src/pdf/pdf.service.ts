import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { getDb } from '../db/drizzle.service';
import { esc } from '../db/sql';
import { logActivity } from '../logs/activity';

// Penyimpanan PDF invoice di Cloudflare R2 (S3-compatible).
// Alur presigned URL: browser PUT langsung ke R2 (file tidak transit server),
// lalu confirm() memverifikasi HEAD + magic bytes %PDF- sebelum status completed.
// Tanpa kredensial R2 (.env kosong) semua endpoint tulis balas R2_NOT_CONFIGURED.
const MAX_MB = Number(process.env.R2_MAX_MB || 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const URL_TTL = 300; // 5 menit
const STUCK_MINUTES = Number(process.env.PDF_STUCK_MINUTES || 30);

const fail = (code: string, message: string, status = HttpStatus.BAD_REQUEST) => {
  throw new HttpException({ code, message }, status);
};

async function streamHead(stream: any, n: number): Promise<string> {
  const chunks: Buffer[] = [];
  let len = 0;
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
    len += chunk.length;
    if (len >= n) break;
  }
  return Buffer.concat(chunks).subarray(0, n).toString('latin1');
}

@Injectable()
export class PdfService {
  private logger = new Logger(PdfService.name);
  private db: any = getDb();
  private s3: S3Client | null = null;

  constructor() {
    if (this.isConfigured()) {
      this.s3 = new S3Client({
        region: process.env.R2_REGION || 'auto',
        endpoint: process.env.R2_ENDPOINT!,
        // Wajib path-style: Supabase S3 hanya melayani
        // <endpoint>/<bucket>/<key>. Tanpa ini SDK memakai virtual-hosted
        // (<bucket>.<endpoint>/...) yang DNS/sertifikatnya tidak valid → 404 +
        // ERR_SSL_VERSION_OR_CIPHER_MISMATCH saat PUT dari browser.
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });
      this.logger.log('R2 client ready');
    } else {
      this.logger.log('R2 belum dikonfigurasi — endpoint PDF nonaktif (R2_NOT_CONFIGURED)');
    }
  }

  isConfigured() {
    return !!(
      process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
    );
  }

  private needS3(): S3Client {
    if (!this.s3 || !process.env.R2_BUCKET_NAME) {
      fail('R2_NOT_CONFIGURED', 'Penyimpanan R2 belum dikonfigurasi di server.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.s3!;
  }

  private cleanName(name: string): string {
    const base = String(name || '').split(/[\\/]/).pop() || 'invoice.pdf';
    return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'invoice.pdf';
  }

  async createUploadUrl(recordUuid: string, filename: string, sizeBytes: number, who: string) {
    const s3 = this.needS3();
    const id = randomUUID();
    const clean = this.cleanName(filename);
    if (!/\.pdf$/i.test(clean)) fail('NOT_PDF', 'File harus berformat PDF.');
    const size = Number(sizeBytes) || 0;
    if (size <= 0 || size > MAX_BYTES) fail('BAD_SIZE', `Ukuran PDF 1..${MAX_MB} MB.`);
    const rec: any = await this.db.execute(`SELECT record_uuid FROM assistance_records WHERE record_uuid='${esc(recordUuid)}' LIMIT 1` as any);
    if (!(rec.rows || rec)[0]) fail('CASE_NOT_FOUND', 'Kasus tidak ditemukan.', HttpStatus.NOT_FOUND);
    const key = `invoices/${recordUuid}/${Date.now()}-${clean}`;
    const now = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO invoice_pdfs (id,record_uuid,filename,storage_key,size_bytes,status,uploaded_by,created_at,updated_at) VALUES ('${id}','${esc(recordUuid)}','${esc(clean)}','${esc(key)}',${size},'uploading','${esc(who)}','${now}','${now}')` as any,
    );
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, ContentType: 'application/pdf', ContentLength: size }),
      { expiresIn: URL_TTL },
    );
    return { ok: true, id, url, expiresIn: URL_TTL, maxBytes: MAX_BYTES };
  }

  async confirmUpload(id: string, who: string) {
    const s3 = this.needS3();
    const r: any = await this.db.execute(`SELECT * FROM invoice_pdfs WHERE id='${esc(id)}' LIMIT 1` as any);
    const row = (r.rows || r)[0];
    if (!row) fail('PDF_NOT_FOUND', 'Data PDF tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (row.status === 'completed') return { ok: true, id, status: 'completed' };
    const now = new Date().toISOString();
    const markFailed = async (msg: string) => {
      await this.db.execute(`UPDATE invoice_pdfs SET status='failed', updated_at='${now}' WHERE id='${esc(id)}'` as any);
      fail('VERIFY_FAILED', msg);
    };
    try {
      const head: any = await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: row.storage_key }));
      const actual = Number(head.ContentLength || 0);
      if (!actual || actual > MAX_BYTES) return markFailed(`Ukuran file di storage tidak valid (maks ${MAX_MB} MB).`);
      const got: any = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: row.storage_key, Range: 'bytes=0-4' }));
      const sig = await streamHead(got.Body, 5);
      if (!sig.startsWith('%PDF-')) return markFailed('Isi file bukan PDF (%PDF- tidak ditemukan).');
      await this.db.execute(`UPDATE invoice_pdfs SET status='completed', size_bytes=${actual}, updated_at='${now}' WHERE id='${esc(id)}'` as any);
      await logActivity(this.db, { who, action: 'mengunggah PDF invoice', category: 'Invoice', detail: `${row.filename} (${(actual / 1024).toFixed(0)} KB)`, recordUuid: row.record_uuid });
      // Otomatisasi status invoice: PDF pertama yang completed → INVOICE TERBIT.
      // DIKIRIM & PAID tidak pernah diturunkan (invoice sudah diterbitkan/dikirim).
      let invoiceStatus = await this.getInvoiceStatus(row.record_uuid);
      if (invoiceStatus !== 'PAID' && invoiceStatus !== 'DIKIRIM' && invoiceStatus !== 'INVOICE TERBIT' && invoiceStatus !== 'UNPAID') {
        await this.setInvoiceStatus(row.record_uuid, 'INVOICE TERBIT');
        await logActivity(this.db, { who: 'Sistem', action: 'status invoice otomatis menjadi INVOICE TERBIT karena PDF terupload', category: 'Invoice', detail: row.filename, recordUuid: row.record_uuid });
        invoiceStatus = 'INVOICE TERBIT';
      }
      return { ok: true, id, status: 'completed', sizeBytes: actual, invoiceStatus };
    } catch (e: any) {
      if (e?.status === HttpStatus.BAD_REQUEST) throw e;
      return markFailed('File belum sampai ke storage atau tidak terbaca.');
    }
  }

  private async getInvoiceStatus(recordUuid: string): Promise<string> {
    try {
      const r: any = await this.db.execute(`SELECT status FROM invoice_status WHERE record_uuid='${esc(recordUuid)}' LIMIT 1` as any);
      return (r.rows || r)[0]?.status || 'MENUNGGU INVOICE';
    } catch {
      return 'MENUNGGU INVOICE';
    }
  }

  private async setInvoiceStatus(recordUuid: string, status: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ('${esc(recordUuid)}','${esc(status)}','${now}') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at` as any,
    );
  }

  private async countCompleted(recordUuid: string): Promise<number> {
    try {
      const r: any = await this.db.execute(`SELECT COUNT(*) as c FROM invoice_pdfs WHERE record_uuid='${esc(recordUuid)}' AND status='completed'` as any);
      return Number((r.rows || r)[0]?.c || 0);
    } catch {
      return 0;
    }
  }

  async listByCase(recordUuid: string) {
    const r: any = await this.db.execute(
      `SELECT id,filename,size_bytes as "sizeBytes",status,created_at as "createdAt" FROM invoice_pdfs WHERE record_uuid='${esc(recordUuid)}' ORDER BY created_at DESC` as any,
    );
    return (r.rows || r).map((x: any) => ({
      id: x.id, filename: x.filename, sizeBytes: Number(x.sizeBytes || x.sizebytes || 0),
      status: x.status, createdAt: x.createdAt || x.createdat,
    }));
  }

  // Kondisi gate tombol Unduh/Hapus versi server (cermin isPdfReady di frontend):
  // true hanya bila ada ≥1 file completed pada kasus ini.
  async caseState(recordUuid: string) {
    const r: any = await this.db.execute(
      `SELECT status, COUNT(*) as c FROM invoice_pdfs WHERE record_uuid='${esc(recordUuid)}' GROUP BY status` as any,
    );
    const rows = r.rows || r || [];
    let completed = 0;
    let pending = 0;
    for (const x of rows) {
      const n = Number(x.c ?? x.count ?? 0) || 0;
      if (x.status === 'completed') completed += n;
      else pending += n;
    }
    const can = completed > 0;
    return { ok: true, recordUuid, total: completed + pending, completed, pending, canDownload: can, canDelete: can, canUpload: !can };
  }

  // Riwayat invoice + validasi + PDF per kasus (sumber: activity_logs).
  // Dipakai tombol Riwayat di frontend — siapa berbuat apa + kapan.
  async caseHistory(recordUuid: string) {
    const r: any = await this.db.execute(
      `SELECT who, action, category, detail, created_at as "createdAt" FROM activity_logs WHERE record_uuid='${esc(recordUuid)}' AND category IN ('Invoice','Validasi') ORDER BY created_at DESC LIMIT 50` as any,
    );
    return {
      ok: true,
      recordUuid,
      history: (r.rows || r || []).map((x: any) => ({
        who: x.who || 'Sistem',
        action: x.action,
        category: x.category || '',
        detail: x.detail || '',
        createdAt: x.createdAt || x.createdat || '',
      })),
    };
  }

  async downloadUrl(id: string, inline = false) {
    const s3 = this.needS3();
    const r: any = await this.db.execute(`SELECT * FROM invoice_pdfs WHERE id='${esc(id)}' LIMIT 1` as any);
    const row = (r.rows || r)[0];
    if (!row) fail('PDF_NOT_FOUND', 'Data PDF tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (row.status !== 'completed') fail('NOT_READY', 'File belum selesai diunggah.');
    // inline=true → tampil di iframe pratinjau; default attachment → diunduh browser.
    const disposition = inline ? 'inline' : 'attachment';
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: row.storage_key, ResponseContentDisposition: `${disposition}; filename="${String(row.filename).replace(/"/g, '')}"` }),
      { expiresIn: URL_TTL },
    );
    return { ok: true, id, url, expiresIn: URL_TTL, filename: row.filename, inline };
  }

  async remove(id: string, who: string) {
    const s3 = this.needS3();
    const r: any = await this.db.execute(`SELECT * FROM invoice_pdfs WHERE id='${esc(id)}' LIMIT 1` as any);
    const row = (r.rows || r)[0];
    if (!row) fail('PDF_NOT_FOUND', 'Data PDF tidak ditemukan.', HttpStatus.NOT_FOUND);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: row.storage_key }));
    } catch (e) {
      this.logger.warn(`Hapus R2 gagal (lanjut hapus DB): ${(e as any)?.message}`);
    }
    await this.db.execute(`DELETE FROM invoice_pdfs WHERE id='${esc(id)}'` as any);
    await logActivity(this.db, { who, action: 'menghapus PDF invoice', category: 'Invoice', detail: row.filename, recordUuid: row.record_uuid });
    // Otomatisasi status invoice: PDF completed terakhir dihapus → kembali MENUNGGU.
    // Hanya dari TERBIT (atau legacy UNPAID) — DIKIRIM/PAID tidak disentuh
    // (invoice yang sudah dikirim/dibayar tidak berubah karena file dihapus).
    let invoiceStatus = await this.getInvoiceStatus(row.record_uuid);
    const downgradeable = invoiceStatus === 'INVOICE TERBIT' || invoiceStatus === 'UNPAID';
    if (downgradeable && (await this.countCompleted(row.record_uuid)) === 0) {
      await this.setInvoiceStatus(row.record_uuid, 'MENUNGGU INVOICE');
      await logActivity(this.db, { who: 'Sistem', action: 'status invoice kembali MENUNGGU INVOICE karena PDF dihapus', category: 'Invoice', detail: row.filename, recordUuid: row.record_uuid });
      invoiceStatus = 'MENUNGGU INVOICE';
    }
    return { ok: true, id, invoiceStatus };
  }

  // Bersihkan baris uploading yang macet (user batal/gagal tanpa confirm),
  // plus baris failed yang tua (>24 jam) agar daftar tidak menumpuk.
  @Cron('*/10 * * * *')
  async cleanupStuck() {
    try {
      const r: any = await this.db.execute(
        `DELETE FROM invoice_pdfs WHERE status='uploading' AND created_at < (NOW() - INTERVAL '${STUCK_MINUTES} minutes') RETURNING id, storage_key` as any,
      );
      const rows = r.rows || r || [];
      if (this.s3 && rows.length) {
        for (const x of rows) {
          try {
            await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: x.storage_key || x.storageKey }));
          } catch {}
        }
      }
      if (rows.length) this.logger.log(`Bersihkan ${rows.length} upload macet`);
      const f: any = await this.db.execute(
        `DELETE FROM invoice_pdfs WHERE status='failed' AND created_at < (NOW() - INTERVAL '24 hours') RETURNING id, storage_key` as any,
      );
      const failed = f.rows || f || [];
      if (this.s3 && failed.length) {
        for (const x of failed) {
          try {
            await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: x.storage_key || x.storageKey }));
          } catch {}
        }
      }
      if (failed.length) this.logger.log(`Bersihkan ${failed.length} upload gagal tua`);
    } catch (e) {
      // pg-mem tidak dukung INTERVAL/RETURNING penuh — lewati diam-diam di dev mock
    }
  }
}
