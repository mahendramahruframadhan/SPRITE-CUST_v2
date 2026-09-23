import { Controller, Patch, Param, Body, Get, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { logActivity, resolveWho, caseLabel } from '../logs/activity';

const esc = (v: any) => String(v ?? '').replace(/'/g, "''");

@Controller()
export class BillingController {
  private db: any = getDb();
  @Get('billing/stats')
  async stats() {
    const a: any = await this.db.execute(`SELECT action, COUNT(*) as c FROM audit_status GROUP BY action` as any);
    const inv: any = await this.db.execute(`SELECT status, COUNT(*) as c FROM invoice_status GROUP BY status` as any);
    const tot: any = await this.db.execute(`SELECT SUM(charges) as s FROM assistance_records` as any);
    return { auditCounts: a.rows||a, invoiceCounts: inv.rows||inv, totalCharges: (tot.rows||tot)[0]?.s || 0 };
  }
  // Peta status invoice per kasus — dipakai frontend menyinkronkan tampilan lokal
  // dengan kebenaran backend (otomasi upload/hapus PDF) saat halaman dimuat.
  // Baca terbuka seperti GET lain. notes: bukti pembayaran baris PAID.
  @Get('billing/invoice-map')
  async invoiceMap() {
    const r: any = await this.db.execute(`SELECT record_uuid, status FROM invoice_status` as any);
    const map: Record<string, string> = {};
    for (const x of (r.rows || r || [])) {
      if (x && (x.record_uuid || x.recorduuid) && x.status) map[x.record_uuid || x.recorduuid] = x.status;
    }
    let notes: Record<string, { note: string; paidAt: string; paidBy: string }> = {};
    try {
      const n: any = await this.db.execute(`SELECT record_uuid, payment_note, paid_at, paid_by FROM invoice_status WHERE status='PAID'` as any);
      for (const x of (n.rows || n || [])) {
        const uuid = x.record_uuid || x.recorduuid;
        if (uuid) notes[uuid] = { note: x.payment_note || x.paymentnote || '', paidAt: x.paid_at || x.paidat || '', paidBy: x.paid_by || x.paidby || '' };
      }
    } catch {
      // DB lama sebelum kolom payment_* ada — migrasi di initDb menutupnya.
    }
    return { ok: true, map, notes };
  }
  @Patch('cases/:uuid/audit')
  @UseGuards(PermGuard)
  @Perm('billing')
  async audit(@Param('uuid') uuid: string, @Body() body: any, @Req() req: any) {
    const action = body.action || body.status;
    if (!action) return { ok:false, error:'action required' };
    await this.db.execute(`INSERT INTO audit_status (record_uuid,action,updated_at) VALUES ('${uuid.replace(/'/g,"''")}','${action.replace(/'/g,"''")}','${new Date().toISOString()}') ON CONFLICT (record_uuid) DO UPDATE SET action=EXCLUDED.action, updated_at=EXCLUDED.updated_at` as any);
    await logActivity(this.db, { who: await resolveWho(this.db, req, body.who), action: `mengubah status validasi ${await caseLabel(this.db, uuid)}`, category: 'Validasi', detail: `menjadi ${action}`, recordUuid: uuid });
    return { ok:true, recordUuid: uuid, action };
  }
  @Patch('cases/:uuid/invoice')
  @UseGuards(PermGuard)
  @Perm('finance')
  async invoice(@Param('uuid') uuid: string, @Body() body: any, @Req() req: any) {
    const status = String(body.status || '').trim();
    if (!status) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Status tidak boleh kosong.' }, HttpStatus.BAD_REQUEST);
    const canon = status.toUpperCase();
    // Kunci total: MENUNGGU & TERBIT murni otomatis (upload/hapus PDF) — manual ditolak.
    // Status manual yang diizinkan alur:
    //   DIKIRIM  — dari INVOICE TERBIT (invoice diterbitkan lalu ditandai sudah dikirim)
    //   PAID     — dari DIKIRIM, wajib ≥1 PDF completed + paymentNote (bukti pembayaran)
    // Status kustom non-kanonis (buatan admin via Pengaturan) tetap lolos seperti dulu.
    if (canon === 'MENUNGGU INVOICE' || canon === 'INVOICE TERBIT') {
      throw new HttpException({ code: 'INVOICE_AUTO_LOCKED', message: `Status "${status}" diatur otomatis oleh sistem (upload/hapus PDF) — tidak bisa diubah manual.` }, 422);
    }
    const who = await resolveWho(this.db, req, body.who);
    const cur: any = await this.db.execute(`SELECT status FROM invoice_status WHERE record_uuid='${esc(uuid)}' LIMIT 1` as any);
    const curStatus = String((cur.rows || cur)[0]?.status || 'MENUNGGU INVOICE').toUpperCase();
    if (canon === 'DIKIRIM') {
      if (curStatus !== 'INVOICE TERBIT' && curStatus !== 'UNPAID' && curStatus !== 'DIKIRIM') {
        throw new HttpException({ code: 'NOT_TERBIT_YET', message: 'Belum bisa ditandai dikirim — status harus INVOICE TERBIT dulu (upload PDF invoice).' }, 422);
      }
      const nowD = new Date().toISOString();
      await this.db.execute(`INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ('${esc(uuid)}','${esc(status)}','${nowD}') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at` as any);
      await logActivity(this.db, { who, action: `menandai invoice dikirim ${await caseLabel(this.db, uuid)}`, category: 'Invoice', detail: 'menunggu pembayaran', recordUuid: uuid });
      return { ok: true, recordUuid: uuid, status };
    }
    if (canon === 'PAID') {
      if (curStatus !== 'DIKIRIM' && curStatus !== 'PAID') {
        throw new HttpException({ code: 'NOT_DIKIRIM_YET', message: 'Belum bisa PAID — tandai invoice sudah dikirim (DIKIRIM) dulu.' }, 422);
      }
      const c: any = await this.db.execute(`SELECT COUNT(*) as c FROM invoice_pdfs WHERE record_uuid='${esc(uuid)}' AND status='completed'` as any);
      if (!Number((c.rows || c)[0]?.c || 0)) {
        throw new HttpException({ code: 'INVOICE_NEED_PDF', message: 'Belum bisa PAID — upload minimal 1 PDF invoice dulu.' }, 422);
      }
      const paymentNote = String(body.paymentNote || body.note || '').trim().slice(0, 500);
      if (!paymentNote) {
        throw new HttpException({ code: 'PAYMENT_NOTE_REQUIRED', message: 'Keterangan pembayaran wajib diisi untuk menandai PAID.' }, 422);
      }
      const now = new Date().toISOString();
      await this.db.execute(`INSERT INTO invoice_status (record_uuid,status,updated_at,payment_note,paid_at,paid_by) VALUES ('${esc(uuid)}','${esc(status)}','${now}','${esc(paymentNote)}','${now}','${esc(who)}') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at, payment_note=EXCLUDED.payment_note, paid_at=EXCLUDED.paid_at, paid_by=EXCLUDED.paid_by` as any);
      const invNo = String(body.invoiceNo || body.no || '').trim();
      await logActivity(this.db, { who, action: `menandai PAID ${await caseLabel(this.db, uuid)}`, category: 'Invoice', detail: `${paymentNote}${invNo ? ` • no. invoice ${invNo}` : ''}`, recordUuid: uuid });
      return { ok: true, recordUuid: uuid, status, paymentNote };
    }
    await this.db.execute(`INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ('${uuid.replace(/'/g,"''")}','${status.replace(/'/g,"''")}','${new Date().toISOString()}') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at` as any);
    const invNo = String(body.invoiceNo || body.no || '').trim();
    await logActivity(this.db, { who: await resolveWho(this.db, req, body.who), action: `mengubah status invoice ${await caseLabel(this.db, uuid)}`, category: 'Invoice', detail: `menjadi ${status}${invNo ? ` • no. invoice ${invNo}` : ''}`, recordUuid: uuid });
    return { ok:true, recordUuid: uuid, status };
  }
}
