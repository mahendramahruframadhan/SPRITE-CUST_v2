import { Injectable, CanActivate, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getDb } from '../db/drizzle.service';
import { resolveSessionUser } from './session';
import { esc } from '../db/sql';

export const Perm = (module: string) => SetMetadata('permModule', module);

// Guard izin tulis per modul. Frontend mengirim x-auth-token (token sesi dari
// sign-in, lihat auth/session.ts); role dibaca dari DB + matriks
// role_permissions. Super Admin selalu lolos.
// Tanpa token sesi valid → 403. Header x-user-email TIDAK dipercaya untuk
// otorisasi (bisa dipalsukan). Baca (GET) sengaja terbuka.
@Injectable()
export class PermGuard implements CanActivate {
  private db: any = getDb();
  constructor(private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const mod = this.reflector.getAllAndOverride<string>('permModule', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!mod) return true;
    const req = ctx.switchToHttp().getRequest();
    const u: any = await resolveSessionUser(this.db, req);
    // 401 = sesi hilang/tak valid (frontend mengarahkan login ulang);
    // false = 403 = sesi valid tapi modul tak diizinkan.
    if (!u) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sesi berakhir — silakan login lagi.' });
    const role = u.role || 'Viewer';
    if (role === 'Super Admin') return true;
    const p: any = await this.db.execute(`SELECT allowed FROM role_permissions WHERE role='${esc(role)}' AND module='${esc(mod)}'` as any);
    return Number((p.rows || p)[0]?.allowed || 0) === 1;
  }
}
