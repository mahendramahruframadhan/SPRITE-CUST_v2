import { Controller, Post, Get } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  @Post('trigger')
  async trigger() {
    const r = await this.sync.run('manual');
    return r;
  }

  @Get('logs')
  async logs() {
    return this.sync.logs();
  }
}
