import { Controller, Post, Get, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
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
    try {
      return await this.sync.run('manual');
    } catch (e: any) {
      // M1: kegagalan baca Sheets → 502 eksplisit, bukan 500 generik.
      if (e?.code === 'SHEETS_READ_FAILED') {
        throw new HttpException(
          { code: 'SHEETS_READ_FAILED', message: String(e.message || 'Gagal membaca Google Sheets.') },
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw e;
    }
  }

  @Get('logs')
  async logs() {
    return this.sync.logs();
  }
}
