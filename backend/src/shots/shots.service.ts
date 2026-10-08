import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { getDb } from '../db/drizzle.service';
import { logActivity } from '../logs/activity';

// Screenshot hasil audit POPI/NAVA di Cloudflare R2 (S3-compatible, sama
// bucket dengan PDF invoice). Alur identik: browser PUT presigned langsung
// ke R2 → confirm() verifikasi HEAD + magic bytes gambar → status completed.
// Tanpa kredensial R2 semua endpoint tulis balas R2_NOT_CONFIGURED.
const MAX_MB = Number(process.env.SHOT_MAX_MB || 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const URL_TTL = 300;
const STUCK_MINUTES = Number(process.env.SHOT_STUCK_MINUTES || 30);
const SLOTS = ['local', 'web'];
const MIME_EXT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};
const MAGIC: [string, number[]][] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/webp', [0x52, 0x49, 0x46, 0x46]], // RIFF....WEBP
];

const fail = (code: string, message: string, status = HttpStatus.BAD_REQUEST) => {
  throw new HttpException({ code, message }, status);
};

async function streamHead(stream: any, n: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let len = 0;
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
    len += chunk.length;
    if (len >= n) break;
  }
  return Buffer.concat(chunks).subarray(0, n);
}

@Injectable()
export class ShotsService {
  private logger = new Logger(ShotsService.name);
  private db: any = getDb();
  private s3: S3Client | null = null;

  constructor() {
    if (this.isConfigured()) {
      this.s3 = new S3Client({
        region: process.env.R2_REGION || 'auto',
        endpoint: process.env.R2_ENDPOINT!,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });
      this.logger.log('R2 client ready (audit shots)');
    } else {
      this.logger.log('R2 belum dikonfigurasi — endpoint audit-shots nonaktif (R2_NOT_CONFIGURED)');
    }
  }

  isConfigured() {
    return !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
  }

  private needS3(): S3Client {
    if (!this.s3 || !process.env.R2_BUCKET_NAME) {
      fail('R2_NOT_CONFIGURED', 'Penyimpanan R2 belum dikonfigurasi di server.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.s3!;
  }

  private cleanName(name: string): string {
    const base = String(name || '').split(/[\\/]/).pop() || 'screenshot.jpg';
    return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'screenshot.jpg';
  }

  async createUploadUrl(deptUuid: string, slot: string, filename: string, sizeBytes: number, contentType: string, who: string) {
    const s3 = this.needS3();
    const id = randomUUID();
    const clean = this.cleanName(filename);
    if (!SLOTS.includes(slot)) fail('BAD_SLOT', `Slot harus salah satu: ${SLOTS.join(', ')}.`);
    const exts = MIME_EXT[contentType];
    if (!exts) fail('NOT_IMAGE', 'File harus gambar PNG, JPG, atau WebP.');
    if (!exts.some((e) => clean.toLowerCase().endsWith(e))) fail('EXT_MIME_MISMATCH', `Ekstensi file tidak cocok dengan tipe ${contentType}.`);
    const size = Number(sizeBytes) || 0;
    if (size <= 0 || size > MAX_BYTES) fail('BAD_SIZE', `Ukuran gambar 1..${MAX_MB} MB.`);
    const rec: any = await this.db.pq(`SELECT uuid FROM popinava_outlets WHERE uuid=$1 LIMIT 1`, [deptUuid]);
    if (!(rec.rows || rec)[0]) fail('OUTLET_NOT_FOUND', 'Outlet tidak ditemukan.', HttpStatus.NOT_FOUND);
    const key = `audit-shots/${deptUuid}/${slot}/${Date.now()}-${clean}`;
    const now = new Date().toISOString();
    await this.db.pq(
      `INSERT INTO audit_shots (id,dept_uuid,slot,filename,storage_key,size_bytes,content_type,status,uploaded_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'uploading',$8,$9,$9)`,
      [id, deptUuid, slot, clean, key, size, contentType, who, now],
    );
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, ContentType: contentType, ContentLength: size }),
      { expiresIn: URL_TTL },
    );
    return { ok: true, id, url, expiresIn: URL_TTL, maxBytes: MAX_BYTES };
  }

  async confirmUpload(id: string, who: string) {
    const s3 = this.needS3();
    const r: any = await this.db.pq(`SELECT * FROM audit_shots WHERE id=$1 LIMIT 1`, [id]);
    const row = (r.rows || r)[0];
    if (!row) fail('SHOT_NOT_FOUND', 'Data screenshot tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (row.status === 'completed') return { ok: true, id, status: 'completed' };
    const now = new Date().toISOString();
    const markFailed = async (msg: string) => {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: row.storage_key }));
      } catch (e) {
        this.logger.warn(`Hapus R2 objek gagal verifikasi (${id}): ${(e as any)?.message}`);
      }
      await this.db.pq(`UPDATE audit_shots SET status='failed', updated_at=$1 WHERE id=$2`, [now, id]);
      fail('VERIFY_FAILED', msg);
    };
    try {
      const head: any = await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: row.storage_key }));
      const actual = Number(head.ContentLength || 0);
      if (!actual || actual > MAX_BYTES) return markFailed(`Ukuran file di storage tidak valid (maks ${MAX_MB} MB).`);
      const got: any = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: row.storage_key, Range: 'bytes=0-11' }));
      const magic = await streamHead(got.Body, 12);
      const ok = MAGIC.some(([, bytes]) => bytes.every((b, i) => magic[i] === b)) &&
        (row.content_type !== 'image/webp' || magic.subarray(8, 12).toString('latin1') === 'WEBP');
      if (!ok) return markFailed('Isi file bukan gambar PNG/JPG/WebP yang valid.');
      await this.db.pq(`UPDATE audit_shots SET status='completed', size_bytes=$1, updated_at=$2 WHERE id=$3`, [actual, now, id]);
      await logActivity(this.db, { who, action: `mengunggah screenshot audit (${row.slot.toUpperCase()})`, category: 'popinava', detail: row.filename, recordUuid: row.dept_uuid });
      return { ok: true, id, status: 'completed', sizeBytes: actual };
    } catch (e: any) {
      if (e?.status === HttpStatus.BAD_REQUEST) throw e;
      return markFailed('File belum sampai ke storage atau tidak terbaca.');
    }
  }

  async listByOutlet(deptUuid: string) {
    const r: any = await this.db.pq(
      `SELECT id,slot,filename,size_bytes as "sizeBytes",status,created_at as "createdAt" FROM audit_shots WHERE dept_uuid=$1 ORDER BY created_at DESC`,
      [deptUuid],
    );
    return (r.rows || r).map((x: any) => ({
      id: x.id, slot: x.slot, filename: x.filename, sizeBytes: Number(x.sizeBytes || x.sizebytes || 0),
      status: x.status, createdAt: x.createdAt || x.createdat,
    }));
  }

  async downloadUrl(id: string, inline = false) {
    const s3 = this.needS3();
    const r: any = await this.db.pq(`SELECT * FROM audit_shots WHERE id=$1 LIMIT 1`, [id]);
    const row = (r.rows || r)[0];
    if (!row) fail('SHOT_NOT_FOUND', 'Data screenshot tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (row.status !== 'completed') fail('NOT_READY', 'File belum selesai diunggah.');
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
    const r: any = await this.db.pq(`SELECT * FROM audit_shots WHERE id=$1 LIMIT 1`, [id]);
    const row = (r.rows || r)[0];
    if (!row) fail('SHOT_NOT_FOUND', 'Data screenshot tidak ditemukan.', HttpStatus.NOT_FOUND);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: row.storage_key }));
    } catch (e) {
      this.logger.warn(`Hapus R2 gagal (DB tidak disentuh): ${(e as any)?.message}`);
      fail('R2_DELETE_FAILED', 'Gagal menghapus file di penyimpanan — data dipertahankan, coba lagi.', HttpStatus.BAD_GATEWAY);
    }
    await this.db.pq(`DELETE FROM audit_shots WHERE id=$1`, [id]);
    await logActivity(this.db, { who, action: `menghapus screenshot audit (${row.slot.toUpperCase()})`, category: 'popinava', detail: row.filename, recordUuid: row.dept_uuid });
    return { ok: true, id };
  }

  @Cron('*/10 * * * *')
  async cleanupStuck() {
    try {
      const r: any = await this.db.execute(
        `DELETE FROM audit_shots WHERE status='uploading' AND created_at < (NOW() - INTERVAL '${STUCK_MINUTES} minutes') RETURNING id, storage_key` as any,
      );
      const rows = r.rows || r || [];
      if (this.s3 && rows.length) {
        for (const x of rows) {
          try { await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: x.storage_key || x.storageKey })); } catch {}
        }
      }
      if (rows.length) this.logger.log(`Bersihkan ${rows.length} upload shot macet`);
      const f: any = await this.db.execute(
        `DELETE FROM audit_shots WHERE status='failed' AND created_at < (NOW() - INTERVAL '24 hours') RETURNING id, storage_key` as any,
      );
      const failed = f.rows || f || [];
      if (this.s3 && failed.length) {
        for (const x of failed) {
          try { await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: x.storage_key || x.storageKey })); } catch {}
        }
      }
      if (failed.length) this.logger.log(`Bersihkan ${failed.length} upload shot gagal tua`);
    } catch {}
  }
}
