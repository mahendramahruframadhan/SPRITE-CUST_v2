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
    // Satu-satunya status manual adalah PAID, dan wajib sudah ada ≥1 PDF completed.
    // Status kustom non-kanonis (buatan admin via Pengaturan) tetap lolos seperti dulu.
    if (canon === 'MENUNGGU INVOICE' || canon === 'INVOICE TERBIT') {
      throw new HttpException({ code: 'INVOICE_AUTO_LOCKED', message: `Status "${status}" diatur otomatis oleh sistem (upload/hapus PDF) — tidak bisa diubah manual.` }, 422);
    }
    if (canon === 'PAID') {
      const c: any = await this.db.execute(`SELECT COUNT(*) as c FROM invoice_pdfs WHERE record_uuid='${esc(uuid)}' AND status='completed'` as any);
      if (!Number((c.rows || c)[0]?.c || 0)) {
        throw new HttpException({ code: 'INVOICE_NEED_PDF', message: 'Belum bisa PAID — upload minimal 1 PDF invoice dulu.' }, 422);
      }
    }
    await this.db.execute(`INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ('${uuid.replace(/'/g,"''")}','${status.replace(/'/g,"''")}','${new Date().toISOString()}') ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at` as any);
    const invNo = String(body.invoiceNo || body.no || '').trim();
    await logActivity(this.db, { who: await resolveWho(this.db, req, body.who), action: `mengubah status invoice ${await caseLabel(this.db, uuid)}`, category: 'Invoice', detail: `menjadi ${status}${invNo ? ` • no. invoice ${invNo}` : ''}`, recordUuid: uuid });
    return { ok:true, recordUuid: uuid, status };
  }
}
