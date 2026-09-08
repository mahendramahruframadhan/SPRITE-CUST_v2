import { Controller, Get, Post, Query, Param, Body, Req, HttpException, UseGuards } from '@nestjs/common';
import { CasesService } from './cases.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { getDb } from '../db/drizzle.service';
import { logActivity, resolveWho } from '../logs/activity';

@Controller('cases')
export class CasesController {
  constructor(private cases: CasesService) {}

  @Get()
  async list(@Query() q: any) {
    return this.cases.findAll(q);
  }

  @Get('stats/summary')
  async stats() {
    return this.cases.stats();
  }

  @Get(':uuid')
  async one(@Param('uuid') uuid: string) {
    const r = await this.cases.findOne(uuid);
    if (!r) throw new HttpException('Not found', 404);
    return r;
  }

  @Post()
  @UseGuards(PermGuard)
  @Perm('form')
  async create(@Body() body: any, @Req() req: any) {
    try {
      const row = await this.cases.create(body);
      await logActivity(getDb(), {
        who: await resolveWho(getDb(), req, body.who),
        action: `menambah kasus baru (${row.client})`,
        category: 'Penambahan',
        detail: String(row.issue || '').slice(0, 200),
        recordUuid: row.recordUuid,
      });
      return { ok: true, data: row };
    } catch (e: any) {
      throw new HttpException(e.message || 'Create failed', 400);
    }
  }
}
