import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { ok: true, service: 'sprite-cust-backend', port: process.env.PORT || 5005, sheetsMock: process.env.SHEETS_MOCK === 'true' };
  }
  @Get()
  root() {
    return { ok: true, docs: '/api/health, /api/cases, /api/sync/trigger, /api/auth/*' };
  }
}
