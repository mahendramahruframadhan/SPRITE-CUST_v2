import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import { FollowupsService } from './followups.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { getDb } from '../db/drizzle.service';
import { resolveWho } from '../logs/activity';
import { SessionGuard } from '../auth/session.guard';

// Endpoint Client Follow-Up (PRD §10). Semua wajib sesi (SessionGuard kelas);
// method tulis dijaga PermGuard modul 'followups'. Rute statis (summary,
// export) dideklarasikan sebelum :id agar tidak tertelah oleh param.
@UseGuards(SessionGuard)
@Controller()
export class FollowupsController {
  constructor(private svc: FollowupsService) {}

  @Get('followups')
  async list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Get('followups/summary')
  async summary() {
    return this.svc.summary();
  }

  @Get('followups/export')
  async exportCsv(@Query() q: any, @Res() res: any) {
    const csv = await this.svc.exportCsv(q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan-followup.csv"');
    res.send(csv);
  }

  @Get('followups/:id')
  async get(@Param('id') id: string) {
    return { ok: true, data: await this.svc.get(id) };
  }

  @Post('followups')
  @UseGuards(PermGuard)
  @Perm('followups')
  async create(@Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.create(b, await resolveWho(getDb(), req)) };
  }

  @Patch('followups/:id')
  @UseGuards(PermGuard)
  @Perm('followups')
  async update(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.update(id, b, await resolveWho(getDb(), req)) };
  }

  @Delete('followups/:id')
  @UseGuards(PermGuard)
  @Perm('followups')
  async remove(@Param('id') id: string, @Req() req: any) {
    return { ok: true, data: await this.svc.remove(id, await resolveWho(getDb(), req)) };
  }

  @Post('followups/:id/notes')
  @UseGuards(PermGuard)
  @Perm('followups')
  async addNote(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.addNote(id, b, await resolveWho(getDb(), req)) };
  }
}
