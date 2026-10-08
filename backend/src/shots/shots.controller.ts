import { Controller, Post, Get, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ShotsService } from './shots.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { getDb } from '../db/drizzle.service';
import { resolveWho } from '../logs/activity';
import { SessionGuard } from '../auth/session.guard';

@UseGuards(SessionGuard)
@Controller()
export class ShotsController {
  private db: any = getDb();
  constructor(private shots: ShotsService) {}

  @Post('popinava/audit-shots/upload-url')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async uploadUrl(@Body() b: any, @Req() req: any) {
    return this.shots.createUploadUrl(
      String(b.deptUuid || ''), String(b.slot || ''), String(b.filename || ''),
      Number(b.sizeBytes) || 0, String(b.contentType || ''),
      await resolveWho(this.db, req),
    );
  }

  @Post('popinava/audit-shots/confirm')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async confirm(@Body() b: any, @Req() req: any) {
    return this.shots.confirmUpload(String(b.id || ''), await resolveWho(this.db, req));
  }

  @Get('popinava/audit-shots/by-outlet/:deptUuid')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async byOutlet(@Param('deptUuid') deptUuid: string) {
    return this.shots.listByOutlet(deptUuid);
  }

  @Get('popinava/audit-shots/:id/download-url')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async downloadUrl(@Param('id') id: string, @Query('inline') inline?: string) {
    return this.shots.downloadUrl(id, inline === '1');
  }

  @Delete('popinava/audit-shots/:id')
  @UseGuards(PermGuard)
  @Perm('popinava')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.shots.remove(id, await resolveWho(this.db, req));
  }
}
