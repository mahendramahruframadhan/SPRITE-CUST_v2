import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { getDb } from '../db/drizzle.service';
import { resolveWho } from '../logs/activity';
import { SessionGuard } from '../auth/session.guard';

@UseGuards(SessionGuard)
@Controller()
export class ClientsController {
  constructor(private svc: ClientsService) {}

  @Get('clients')
  @UseGuards(PermGuard)
  @Perm('clients')
  async listClients() {
    return this.svc.listClients();
  }

  @Post('clients')
  @UseGuards(PermGuard)
  @Perm('clients')
  async createClient(@Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.createClient(b, await resolveWho(getDb(), req)) };
  }

  @Patch('clients/:id')
  @UseGuards(PermGuard)
  @Perm('clients')
  async updateClient(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.updateClient(id, b, await resolveWho(getDb(), req)) };
  }

  @Delete('clients/:id')
  @UseGuards(PermGuard)
  @Perm('clients')
  async removeClient(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    return { ok: true, data: await this.svc.removeClient(id, await resolveWho(getDb(), req)) };
  }

  @Get('brand-status')
  async listStatuses() {
    return this.svc.listStatuses();
  }

  @Post('brand-status')
  @UseGuards(PermGuard)
  @Perm('clients')
  async createStatus(@Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.createStatus(b, await resolveWho(getDb(), req)) };
  }

  @Patch('brand-status/:id')
  @UseGuards(PermGuard)
  @Perm('clients')
  async updateStatus(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.updateStatus(id, b, await resolveWho(getDb(), req)) };
  }

  @Delete('brand-status/:id')
  @UseGuards(PermGuard)
  @Perm('clients')
  async removeStatus(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    return { ok: true, data: await this.svc.removeStatus(id, await resolveWho(getDb(), req)) };
  }
}
