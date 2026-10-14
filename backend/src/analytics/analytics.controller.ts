import { Controller, Get, Query, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { SessionGuard } from '../auth/session.guard';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkRange(from: string, to: string) {
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    throw new HttpException({ code: 'ANALYTICS_INVALID_RANGE', message: 'Format tanggal harus YYYY-MM-DD.' }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (from && to && from > to) {
    throw new HttpException({ code: 'ANALYTICS_INVALID_RANGE', message: 'Rentang tanggal tidak valid (Date From melebihi Date Until).' }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

@UseGuards(SessionGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('overview')
  @UseGuards(PermGuard)
  @Perm('analytics')
  async overview(@Query() q: any) {
    const from = String(q.from || '');
    const to = String(q.to || '');
    checkRange(from, to);
    return this.analytics.getOverview(from || '1970-01-01', to || '2999-12-31');
  }

  @Get('drilldown')
  @UseGuards(PermGuard)
  @Perm('analytics')
  async drilldown(@Query() q: any) {
    const dim = String(q.dim || '');
    const key = String(q.key || '');
    // dim/key opsional: tanpa keduanya = semua pool tervalidasi (tabel default).
    if (dim && dim !== 'brand' && dim !== 'module') {
      throw new HttpException({ code: 'ANALYTICS_INVALID_DIM', message: 'Dimensi drilldown hanya brand|module.' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (dim && !key) {
      throw new HttpException({ code: 'ANALYTICS_INVALID_DIM', message: 'Key drilldown wajib diisi.' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const from = String(q.from || '');
    const to = String(q.to || '');
    checkRange(from, to);
    return this.analytics.getDrilldown({
      dim,
      key,
      from: from || '1970-01-01',
      to: to || '2999-12-31',
      q: String(q.q || ''),
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 50,
    });
  }
}
