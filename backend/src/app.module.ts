import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';
import { CasesController } from './cases/cases.controller';
import { CasesService } from './cases/cases.service';
import { SheetsService } from './sheets/sheets.service';
import { SyncService } from './sync/sync.service';
import { SyncController } from './sync/sync.controller';
import { BillingController } from './billing/billing.controller';
import { ConfigController } from './config/config.controller';
import { MastersController } from './masters/masters.controller';
import { DrizzleService } from './db/drizzle.service';
import { AuthController } from './auth/auth.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot()],
  controllers: [HealthController, CasesController, SyncController, BillingController, ConfigController, MastersController, AuthController],
  providers: [DrizzleService, CasesService, SheetsService, SyncService],
})
export class AppModule {}
