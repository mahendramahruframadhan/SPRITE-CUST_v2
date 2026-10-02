import { Controller, Post, Get, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { getDb } from '../db/drizzle.service';
import { resolveWho } from '../logs/activity';
import { SessionGuard } from '../auth/session.guard';

@UseGuards(SessionGuard)
@Controller()
export class PdfController {
  private db: any = getDb();
  constructor(private pdf: PdfService) {}

  @Post('pdf/upload-url')
  @UseGuards(PermGuard)
  @Perm('finance')
  async uploadUrl(@Body() b: any, @Req() req: any) {
    return this.pdf.createUploadUrl(
      String(b.recordUuid || ''), String(b.filename || ''), Number(b.sizeBytes) || 0,
      await resolveWho(this.db, req),
    );
  }

  @Post('pdf/confirm')
  @UseGuards(PermGuard)
  @Perm('finance')
  async confirm(@Body() b: any, @Req() req: any) {
    return this.pdf.confirmUpload(String(b.id || ''), await resolveWho(this.db, req));
  }

  @Get('pdf/by-case/:uuid')
  @UseGuards(PermGuard)
  @Perm('finance')
  async byCase(@Param('uuid') uuid: string) {
    return this.pdf.listByCase(uuid);
  }

  // Kondisi true/false tombol Unduh/Hapus (sumber kebenaran server).
  // M-3: baca kini dijaga PermGuard finance — sama dengan unduh/hapus
  // (frontend hanya memanggilnya dari FinanceAuditPage).
  @Get('pdf/state/:uuid')
  @UseGuards(PermGuard)
  @Perm('finance')
  async state(@Param('uuid') uuid: string) {
    return this.pdf.caseState(uuid);
  }

  // Riwayat invoice + validasi + PDF per kasus. M-3: dijaga finance seperti by-case/state.
  @Get('pdf/history/:uuid')
  @UseGuards(PermGuard)
  @Perm('finance')
  async history(@Param('uuid') uuid: string) {
    return this.pdf.caseHistory(uuid);
  }

  @Get('pdf/:id/download-url')
  @UseGuards(PermGuard)
  @Perm('finance')
  async downloadUrl(@Param('id') id: string, @Query('inline') inline?: string) {
    // ?inline=1 → disposition inline untuk iframe pratinjau; default attachment (unduh)
    return this.pdf.downloadUrl(id, inline === '1' || inline === 'true');
  }

  @Delete('pdf/:id')
  @UseGuards(PermGuard)
  @Perm('finance')
  async remove(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    return this.pdf.remove(id, await resolveWho(this.db, req));
  }
}
