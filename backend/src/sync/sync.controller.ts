import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SessionGuard } from '../auth/session.guard';
import { Perm, PermGuard } from '../auth/perm.guard';

@UseGuards(SessionGuard)
@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  @Post('trigger')
  @UseGuards(PermGuard)
  @Perm('roles')
  async trigger() {
    const r = await this.sync.run('manual');
    return r;
  }

  @Get('logs')
  async logs() {
    return this.sync.logs();
  }
}
