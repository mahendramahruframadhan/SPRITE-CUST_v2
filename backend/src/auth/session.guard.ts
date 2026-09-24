import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { resolveSessionUser } from './session';

// Guard sesi login TANPA cek modul — untuk endpoint yang boleh dipakai user
// login mana pun (mis. AI chat yang berbiaya per request) tapi wajib tertutup
// bagi anonim. Tanpa token sesi valid → 403.
@Injectable()
export class SessionGuard implements CanActivate {
  private db: any = getDb();
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const u: any = await resolveSessionUser(this.db, req);
    return !!u;
  }
}
