import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { resolveSessionUser } from '../auth/session';
import { SessionGuard } from '../auth/session.guard';
import { Perm, PermGuard } from '../auth/perm.guard';
import { NotificationsService } from './notifications.service';

// Notifikasi milik sesi: GET/PATCH/DELETE terbuka untuk user login mana pun,
// kirim (POST) dijaga PermGuard izin 'notifications' (matriks role_permissions,
// diatur halaman /roles; Super Admin selalu lolos). Semua query di-scope
// user_id — milik orang lain = 404, bukan 403, untuk tidak bocorkan eksistensi
// notifikasi orang lain.
@UseGuards(SessionGuard)
@Controller('notifications')
export class NotificationsController {
  private db = getDb();
  private svc = new NotificationsService();

  @Get()
  async list(@Req() req: any) {
    return this.svc.list(await this.actorId(req));
  }

  @Post()
  @UseGuards(PermGuard)
  @Perm('notifications')
  async send(@Body() b: any, @Req() req: any) {
    return this.svc.send(b?.userIds, b?.type, b?.title, b?.body, b?.link, b?.groupId);
  }

  @Patch(':id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    await this.svc.markRead(await this.actorId(req), String(id));
    return { ok: true };
  }

  @Patch('read-all')
  async markAll(@Req() req: any) {
    await this.svc.markAllRead(await this.actorId(req));
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    await this.svc.remove(await this.actorId(req), String(id));
    return { ok: true };
  }

  // Actor = user yang sudah dipasang SessionGuard di req.user; fallback
  // resolve (kompatibilitas pemanggilan langsung/test).
  private async actorId(req: any): Promise<string> {
    const u: any = req.user || (await resolveSessionUser(this.db, req));
    return String(u?.id || '');
  }
}
