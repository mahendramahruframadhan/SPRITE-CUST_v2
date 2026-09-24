import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { resolveSessionUser } from './session';

// Guard sesi login TANPA cek modul — untuk endpoint yang boleh dipakai user
// login mana pun (mis. AI chat yang berbiaya per request) tapi wajib tertutup
// bagi anonim. Tanpa token sesi valid → 401 (frontend mengarahkan login ulang).
@Injectable()
export class SessionGuard implements CanActivate {
  private db: any = getDb();
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const u: any = await resolveSessionUser(this.db, req);
    if (!u) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sesi berakhir — silakan login lagi.' });
    return true;
  }
}
