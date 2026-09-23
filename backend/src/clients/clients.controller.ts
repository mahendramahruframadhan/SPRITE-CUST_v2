import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { Perm, PermGuard } from '../auth/perm.guard';
import { getDb } from '../db/drizzle.service';
import { resolveWho } from '../logs/activity';

// API koleksi client/brand + status kontrak (halaman Client & Brand).
// Tulis dijaga modul 'clients'; baca (GET) terbuka seperti modul lain.
@Controller()
export class ClientsController {
  constructor(private svc: ClientsService) {}

  @Get('clients')
  async listClients() {
    return this.svc.listClients();
  }

  @Post('clients')
  @UseGuards(PermGuard)
  @Perm('clients')
  async createClient(@Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.createClient(b, await resolveWho(getDb(), req, b?.who)) };
  }

  @Patch('clients/:id')
  @UseGuards(PermGuard)
  @Perm('clients')
  async updateClient(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.updateClient(id, b, await resolveWho(getDb(), req, b?.who)) };
  }

  @Delete('clients/:id')
  @UseGuards(PermGuard)
  @Perm('clients')
  async removeClient(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    return { ok: true, data: await this.svc.removeClient(id, await resolveWho(getDb(), req, b?.who)) };
  }

  @Get('brand-status')
  async listStatuses() {
    return this.svc.listStatuses();
  }

  @Post('brand-status')
  @UseGuards(PermGuard)
  @Perm('clients')
  async createStatus(@Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.createStatus(b, await resolveWho(getDb(), req, b?.who)) };
  }

  @Patch('brand-status/:id')
  @UseGuards(PermGuard)
  @Perm('clients')
  async updateStatus(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    return { ok: true, data: await this.svc.updateStatus(id, b, await resolveWho(getDb(), req, b?.who)) };
  }

  @Delete('brand-status/:id')
  @UseGuards(PermGuard)
  @Perm('clients')
  async removeStatus(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    return { ok: true, data: await this.svc.removeStatus(id, await resolveWho(getDb(), req, b?.who)) };
  }
}
