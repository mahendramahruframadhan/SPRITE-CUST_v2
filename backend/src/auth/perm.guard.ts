import { Injectable, CanActivate, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getDb } from '../db/drizzle.service';
import { resolveSessionUser } from './session';

export const Perm = (module: string) => SetMetadata('permModule', module);

// Cek matriks role_permissions — dipakai PermGuard dan pemfilteran respons
// (mis. GET /users). Super Admin selalu lolos; tanpa baris izin → ditolak.
export async function hasModulePerm(db: any, role: string | undefined | null, mod: string): Promise<boolean> {
  if (role === 'Super Admin') return true;
  if (!role) return false;
  const p: any = await db.pq(`SELECT allowed FROM role_permissions WHERE role=$1 AND module=$2`, [role, mod]);
  return Number((p.rows || p)[0]?.allowed || 0) === 1;
}

// Guard izin per modul. Frontend mengirim x-auth-token (token sesi dari
// sign-in, lihat auth/session.ts); role dibaca dari DB + matriks
// role_permissions. Super Admin selalu lolos.
// Tanpa token sesi valid → 401. Header x-user-email TIDAK dipercaya untuk
// otorisasi (bisa dipalsukan). Dipasang di method TULIS serta sejumlah GET
// sensitif (review M-3: tagihan, log, pengguna, dst. — bukan hanya tulis);
// GET alur login/Dashboard tetap SessionGuard kelas-level.
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
    return hasModulePerm(this.db, u.role || 'Viewer', mod);
  }
}
