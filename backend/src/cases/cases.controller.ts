import { Controller, Get, Post, Query, Param, Body, HttpException, UseGuards } from '@nestjs/common';
import { CasesService } from './cases.service';
import { Perm, PermGuard } from '../auth/perm.guard';

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
  async create(@Body() body: any) {
    try {
      const row = await this.cases.create(body);
      return { ok: true, data: row };
    } catch (e: any) {
      throw new HttpException(e.message || 'Create failed', 400);
    }
  }
}
