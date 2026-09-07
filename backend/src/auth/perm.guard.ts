import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getDb } from '../db/drizzle.service';

export const Perm = (module: string) => SetMetadata('permModule', module);

// Guard izin tulis per modul. Frontend mengirim x-user-email (lihat lib/api.js);
// role dibaca dari DB + matriks role_permissions. Super Admin selalu lolos.
// Tanpa header / user tak dikenal → 403. Baca (GET) sengaja terbuka.
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
    const email = String(req.headers['x-user-email'] || '').toLowerCase().trim();
    if (!email) return false;
    const esc = (v: string) => v.replace(/'/g, "''");
    const r: any = await this.db.execute(`SELECT role FROM "user" WHERE lower(email)='${esc(email)}' LIMIT 1` as any);
    const role = (r.rows || r)[0]?.role || 'Viewer';
    if (role === 'Super Admin') return true;
    const p: any = await this.db.execute(`SELECT allowed FROM role_permissions WHERE role='${esc(role)}' AND module='${esc(mod)}'` as any);
    return Number((p.rows || p)[0]?.allowed || 0) === 1;
  }
}
