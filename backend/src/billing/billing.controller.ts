import { Controller, Patch, Param, Body, Get, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { logActivity, resolveWho, caseLabel } from '../logs/activity';
import { Perm, PermGuard } from '../auth/perm.guard';
import { SessionGuard } from '../auth/session.guard';

@UseGuards(SessionGuard)
@Controller()
export class BillingController {
  private db: any = getDb();
  @Get('billing/stats')
  @UseGuards(PermGuard)
  @Perm('billing')
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
  @UseGuards(PermGuard)
  @Perm('billing')
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
  // Peta status validasi per kasus — dipakai frontend menyinkronkan tampilan lokal
  // dengan kebenaran backend (validasi dari browser lain) saat halaman dimuat.
  // Baca terbuka seperti GET lain.
  @Get('billing/audit-map')
  @UseGuards(PermGuard)
  @Perm('billing')
  async auditMap() {
    const r: any = await this.db.execute(`SELECT record_uuid, action FROM audit_status` as any);
    const map: Record<string, string> = {};
    for (const x of (r.rows || r || [])) {
      if (x && (x.record_uuid || x.recorduuid) && x.action) map[x.record_uuid || x.recorduuid] = x.action;
    }
    return { ok: true, map };
  }
  // Peta pajak per kasus: dipakai frontend menyinkronkan tampilan lokal
  // dengan kebenaran backend saat halaman dimuat. Baca terbuka seperti GET lain.
  @Get('billing/tax-map')
  @UseGuards(PermGuard)
  @Perm('finance')
  async taxMap() {
    const r: any = await this.db.execute(`SELECT record_uuid, ppn_mode, ppn_percent, ppn_amount, pph FROM case_tax` as any);
    const map: Record<string, { ppn: { mode: string; percent: number; amount: number } | null; pph: boolean }> = {};
    for (const x of (r.rows || r || [])) {
      const uuid = x && (x.record_uuid || x.recorduuid);
      if (!uuid) continue;
      const mode = x.ppn_mode || x.ppnmode;
      map[uuid] = {
        ppn: mode ? { mode, percent: Number(x.ppn_percent ?? x.ppnpercent ?? 0), amount: Number(x.ppn_amount ?? x.ppnamount ?? 0) } : null,
        pph: Number(x.pph ?? 0) === 1,
      };
    }
    return { ok: true, map };
  }
  @Patch('cases/:uuid/audit')
  @UseGuards(PermGuard)
  @Perm('billing')
  async audit(@Param('uuid') uuid: string, @Body() body: any, @Req() req: any) {
    const action = body.action || body.status;
    if (!action) return { ok:false, error:'action required' };
    await this.db.pq(`INSERT INTO audit_status (record_uuid,action,updated_at) VALUES ($1,$2,$3) ON CONFLICT (record_uuid) DO UPDATE SET action=EXCLUDED.action, updated_at=EXCLUDED.updated_at`, [uuid, action, new Date().toISOString()]);
    await logActivity(this.db, { who: await resolveWho(this.db, req), action: `mengubah status validasi ${await caseLabel(this.db, uuid)}`, category: 'Validasi', detail: `menjadi ${action}`, recordUuid: uuid });
    return { ok:true, recordUuid: uuid, action };
  }
  @Patch('cases/:uuid/invoice')
  @UseGuards(PermGuard)
  @Perm('finance')
  async invoice(@Param('uuid') uuid: string, @Body() body: any, @Req() req: any) {
    const status = String(body.status || '').trim();
    if (!status) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Status tidak boleh kosong.' }, HttpStatus.BAD_REQUEST);
    const canon = status.toUpperCase();
    // Kunci total: MENUNGGU murni otomatis (upload/hapus PDF) — manual ditolak.
    // Alur dua arah (bisa mundur satu langkah untuk revisi):
    //   TERBIT  ← otomatis dari upload PDF; manual HANYA undo dari DIKIRIM
    //   DIKIRIM ← maju dari TERBIT, atau undo dari PAID
    //   PAID    ← dari DIKIRIM, wajib ≥1 PDF completed + paymentNote
    // Status kustom non-kanonis (buatan admin via Pengaturan) tetap lolos seperti dulu.
    if (canon === 'MENUNGGU INVOICE') {
      throw new HttpException({ code: 'INVOICE_AUTO_LOCKED', message: `Status "${status}" diatur otomatis oleh sistem (upload/hapus PDF) — tidak bisa diubah manual.` }, 422);
    }
    const who = await resolveWho(this.db, req);
    const cur: any = await this.db.pq(`SELECT status FROM invoice_status WHERE record_uuid=$1 LIMIT 1`, [uuid]);
    const curStatus = String((cur.rows || cur)[0]?.status || 'MENUNGGU INVOICE').toUpperCase();
    if (canon === 'DIKIRIM') {
      if (curStatus !== 'INVOICE TERBIT' && curStatus !== 'UNPAID' && curStatus !== 'DIKIRIM' && curStatus !== 'PAID') {
        throw new HttpException({ code: 'NOT_TERBIT_YET', message: 'Belum bisa ditandai terkirim — status harus INVOICE TERBIT dulu (upload PDF invoice).' }, 422);
      }
      const nowD = new Date().toISOString();
      await this.db.pq(`INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ($1,$2,$3) ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at`, [uuid, status, nowD]);
      const undoFromPaid = curStatus === 'PAID';
      await logActivity(this.db, { who, action: undoFromPaid ? `mengurungkan SUDAH DIBAYAR ${await caseLabel(this.db, uuid)}` : `menandai invoice terkirim ${await caseLabel(this.db, uuid)}`, category: 'Invoice', detail: undoFromPaid ? 'kembali ke TERKIRIM (revisi)' : 'menunggu pembayaran', recordUuid: uuid });
      return { ok: true, recordUuid: uuid, status };
    }
    if (canon === 'INVOICE TERBIT') {
      // Undo satu langkah: hanya dari DIKIRIM (urungkan pengiriman untuk revisi).
      if (curStatus !== 'DIKIRIM') {
        throw new HttpException({ code: 'INVOICE_AUTO_LOCKED', message: 'INVOICE TERBIT diatur otomatis oleh sistem (upload PDF) — hanya bisa dikembalikan dari status TERKIRIM (urungkan kirim).' }, 422);
      }
      const nowT = new Date().toISOString();
      await this.db.pq(`INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ($1,$2,$3) ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at`, [uuid, status, nowT]);
      await logActivity(this.db, { who, action: `mengurungkan pengiriman ${await caseLabel(this.db, uuid)}`, category: 'Invoice', detail: 'kembali ke INVOICE TERBIT (revisi)', recordUuid: uuid });
      return { ok: true, recordUuid: uuid, status };
    }
    if (canon === 'PAID') {
      if (curStatus !== 'DIKIRIM' && curStatus !== 'PAID') {
        throw new HttpException({ code: 'NOT_DIKIRIM_YET', message: 'Belum bisa PAID — tandai invoice sudah terkirim (TERKIRIM) dulu.' }, 422);
      }
      const c: any = await this.db.pq(`SELECT COUNT(*) as c FROM invoice_pdfs WHERE record_uuid=$1 AND status='completed'`, [uuid]);
      if (!Number((c.rows || c)[0]?.c || 0)) {
        throw new HttpException({ code: 'INVOICE_NEED_PDF', message: 'Belum bisa PAID — upload minimal 1 PDF invoice dulu.' }, 422);
      }
      const paymentNote = String(body.paymentNote || body.note || '').trim().slice(0, 500);
      if (!paymentNote) {
        throw new HttpException({ code: 'PAYMENT_NOTE_REQUIRED', message: 'Keterangan pembayaran wajib diisi untuk menandai PAID.' }, 422);
      }
      const now = new Date().toISOString();
      await this.db.pq(`INSERT INTO invoice_status (record_uuid,status,updated_at,payment_note,paid_at,paid_by) VALUES ($1,$2,$3,$4,$3,$5) ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at, payment_note=EXCLUDED.payment_note, paid_at=EXCLUDED.paid_at, paid_by=EXCLUDED.paid_by`, [uuid, status, now, paymentNote, who]);
      const invNo = String(body.invoiceNo || body.no || '').trim();
      await logActivity(this.db, { who, action: `menandai SUDAH DIBAYAR ${await caseLabel(this.db, uuid)}`, category: 'Invoice', detail: `${paymentNote}${invNo ? ` • no. invoice ${invNo}` : ''}`, recordUuid: uuid });
      return { ok: true, recordUuid: uuid, status, paymentNote };
    }
    await this.db.pq(`INSERT INTO invoice_status (record_uuid,status,updated_at) VALUES ($1,$2,$3) ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at`, [uuid, status, new Date().toISOString()]);
    const invNo = String(body.invoiceNo || body.no || '').trim();
    await logActivity(this.db, { who: await resolveWho(this.db, req), action: `mengubah status invoice ${await caseLabel(this.db, uuid)}`, category: 'Invoice', detail: `menjadi ${status}${invNo ? ` • no. invoice ${invNo}` : ''}`, recordUuid: uuid });
    return { ok:true, recordUuid: uuid, status };
  }
  // Pajak per baris ON-CALL: PPN menambah charges, PPH hanya penanda status.
  // Urutan guard: bentuk body dulu, lalu keberadaan kasus, batas ON-CALL,
  // terakhir kunci PAID.
  @Patch('cases/:uuid/tax')
  @UseGuards(PermGuard)
  @Perm('finance')
  async tax(@Param('uuid') uuid: string, @Body() body: any, @Req() req: any) {
    const bad = (msg: string) => new HttpException({ code: 'TAX_INVALID', message: msg }, 422);
    if (!body || typeof body !== 'object') throw bad('Body pajak wajib objek { ppn, pph }.');
    if (typeof body.pph !== 'boolean') throw bad('Status PPH wajib boolean.');
    const pph = body.pph === true;
    const rawPpn = body.ppn ?? null;
    let ppn: { mode: string; percent: number; amount: number } | null = null;
    if (rawPpn && rawPpn.enabled !== false) {
      if (typeof rawPpn !== 'object') throw bad('Entri PPN wajib objek atau null.');
      if (rawPpn.mode !== 'percent' && rawPpn.mode !== 'rupiah') throw bad('Mode PPN hanya persen atau rupiah.');
      if (rawPpn.mode === 'percent') {
        if (typeof rawPpn.percent !== 'number' || !Number.isFinite(rawPpn.percent) || rawPpn.percent <= 0 || rawPpn.percent > 100) {
          throw bad('Persen PPN wajib angka 0 < p <= 100.');
        }
        ppn = { mode: 'percent', percent: rawPpn.percent, amount: Number(rawPpn.amount || 0) };
      } else {
        if (typeof rawPpn.amount !== 'number' || !Number.isInteger(rawPpn.amount) || rawPpn.amount < 0) {
          throw bad('Nilai rupiah PPN wajib bilangan bulat >= 0.');
        }
        ppn = { mode: 'rupiah', percent: 0, amount: rawPpn.amount };
      }
    }
    const c: any = await this.db.pq(`SELECT billing_status FROM assistance_records WHERE record_uuid=$1 LIMIT 1`, [uuid]);
    const caseRow = (c.rows || c)[0];
    if (!caseRow) throw new HttpException({ code: 'NOT_FOUND', message: 'Kasus tidak ditemukan.' }, HttpStatus.NOT_FOUND);
    const bs = String(caseRow.billing_status || caseRow.billingstatus || '').replace(/[\s-]/g, '').toUpperCase();
    if (bs !== 'ONCALL') {
      throw new HttpException({ code: 'TAX_NOT_ONCALL', message: 'Pajak hanya untuk transaksi ON-CALL.' }, 422);
    }
    const inv: any = await this.db.pq(`SELECT status FROM invoice_status WHERE record_uuid=$1 LIMIT 1`, [uuid]);
    const invStatus = String((inv.rows || inv)[0]?.status || '').trim().toUpperCase();
    if (invStatus === 'PAID') {
      throw new HttpException({ code: 'TAX_PAID_LOCKED', message: 'Pajak terkunci karena invoice sudah PAID (lunas).' }, 422);
    }
    const now = new Date().toISOString();
    const who = await resolveWho(this.db, req);
    await this.db.pq(`INSERT INTO case_tax (record_uuid,ppn_mode,ppn_percent,ppn_amount,pph,updated_by,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (record_uuid) DO UPDATE SET ppn_mode=EXCLUDED.ppn_mode, ppn_percent=EXCLUDED.ppn_percent, ppn_amount=EXCLUDED.ppn_amount, pph=EXCLUDED.pph, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at`, [uuid, ppn?.mode || null, ppn?.percent ?? null, ppn?.amount ?? null, pph ? 1 : 0, who, now]);
    await logActivity(this.db, { who, action: `mengubah pajak ${await caseLabel(this.db, uuid)}`, category: 'Pajak', detail: ppn ? `PPN ${ppn.mode === 'percent' ? `${ppn.percent}%` : `Rp ${ppn.amount}`}${pph ? ' + PPH' : ''}` : `Non PPN${pph ? ', PPH aktif' : ''}`, recordUuid: uuid });
    return { ok: true, recordUuid: uuid, tax: { ppn, pph } };
  }
}
