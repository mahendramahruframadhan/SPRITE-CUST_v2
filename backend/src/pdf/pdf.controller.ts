import { Controller, Post, Get, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { getDb } from '../db/drizzle.service';
import { resolveWho } from '../logs/activity';

// API PDF invoice (R2 presigned URL). Tulis dijaga modul finance;
// baca daftar per kasus sengaja terbuka seperti GET lain (lihat PermGuard).
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
      await resolveWho(this.db, req, b.who),
    );
  }

  @Post('pdf/confirm')
  @UseGuards(PermGuard)
  @Perm('finance')
  async confirm(@Body() b: any, @Req() req: any) {
    return this.pdf.confirmUpload(String(b.id || ''), await resolveWho(this.db, req, b.who));
  }

  @Get('pdf/by-case/:uuid')
  async byCase(@Param('uuid') uuid: string) {
    return this.pdf.listByCase(uuid);
  }

  @Get('pdf/:id/download-url')
  @UseGuards(PermGuard)
  @Perm('finance')
  async downloadUrl(@Param('id') id: string) {
    return this.pdf.downloadUrl(id);
  }

  @Delete('pdf/:id')
  @UseGuards(PermGuard)
  @Perm('finance')
  async remove(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    return this.pdf.remove(id, await resolveWho(this.db, req, b?.who));
  }
}
