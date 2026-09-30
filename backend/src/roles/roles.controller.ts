import { Controller, Get, Put, Post, Patch, Delete, Param, Body, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { logActivity, resolveWho } from '../logs/activity';
import { Perm, PermGuard } from '../auth/perm.guard';
import { hashPassword } from '../auth/password';
import { SessionGuard } from '../auth/session.guard';
import { resolveSessionUser } from '../auth/session';

const ROLES = ['Super Admin', 'Admin CS', 'Support', 'Finance', 'Viewer'];
const MODULES = ['dashboard', 'cases', 'form', 'hrreport', 'cfg', 'billing', 'finance', 'mockup', 'roles', 'logs', 'settings'];

// CRUD pengguna + matriks izin + log aktivitas untuk halaman /roles — semua di Postgres.
// Class-level SessionGuard: SEMUA endpoint (termasuk GET) wajib x-auth-token
// valid; method tulis tambahan dijaga PermGuard izin 'roles'. (Dulu ada
// PermGuard class-level — GET roles/permissions ikut 403 untuk role tanpa
// izin 'roles', merusak alur login frontend.)
@UseGuards(SessionGuard)
@Controller()
export class RolesController {
  private db: any = getDb();

  @Get('users')
  async users() {
    const r: any = await this.db.execute(`SELECT id,name,email,role,active,created_at FROM "user" ORDER BY created_at` as any);
    return (r.rows || r).map((u: any) => ({ ...u, active: !!Number(u.active) }));
  }

  @Patch('users/:id')
  @UseGuards(PermGuard)
  @Perm('roles')
  async updateUser(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    // H3: dulu siapa pun berizin modul 'roles' bisa menaikkan akun mana pun
    // menjadi Super Admin, atau menonaktifkan/menurunkan Super Admin —
    // termasuk mengunci total sistem dengan mematikan SEMUA Super Admin.
    const actor = await resolveSessionUser(this.db, req);
    const actorIsSA = actor?.role === 'Super Admin';
    const curR: any = await this.db.pq(`SELECT role, active FROM "user" WHERE id=$1 LIMIT 1`, [id]);
    const cur = (curR.rows || curR)[0];
    if (!cur) throw new HttpException({ code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan.' }, HttpStatus.NOT_FOUND);
    const targetIsSA = cur.role === 'Super Admin';
    const targetWasActive = Number(cur.active ?? 1) === 1;
    const grantSA = b.role === 'Super Admin' && cur.role !== 'Super Admin';
    const demoteSA = targetIsSA && b.role && ROLES.includes(b.role) && b.role !== 'Super Admin';
    const deactivate = b.active !== undefined && !b.active;

    // Memberi status SA, atau mengutak-atik SA yang ada → hanya sesama SA.
    // (Matriks /roles memang mengizinkan SA mencentang modul 'roles' untuk
    // role lain — tanpa ini, role itu langsung bisa self-escalate.)
    if ((grantSA || (targetIsSA && (demoteSA || deactivate))) && !actorIsSA) {
      throw new HttpException(
        { code: 'SUPERADMIN_PROTECTED', message: 'Hanya Super Admin yang dapat memberi/mencabut status Super Admin.' },
        HttpStatus.FORBIDDEN,
      );
    }
    // SA aktif terakhir tidak boleh hilang — oleh siapa pun, termasuk SA lain.
    if (targetIsSA && targetWasActive && (demoteSA || deactivate)) {
      const rest: any = await this.db.pq(
        `SELECT COUNT(*) as c FROM "user" WHERE role='Super Admin' AND COALESCE(active,1)=1 AND id<>$1`,
        [id],
      );
      if (!Number((rest.rows || rest)[0]?.c || 0)) {
        throw new HttpException(
          { code: 'LAST_SUPERADMIN', message: 'Tidak bisa menonaktifkan/menurunkan Super Admin aktif terakhir.' },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const sets: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => { params.push(val); sets.push(`${col}=$${params.length}`); };
    if (b.name) push('name', b.name);
    if (b.email) push('email', String(b.email).toLowerCase());
    if (b.role && ROLES.includes(b.role)) push('role', b.role);
    if (b.active !== undefined) push('active', b.active ? 1 : 0);
    if (!sets.length) return { ok: false, error: 'nothing to update' };
    push('updated_at', new Date().toISOString());
    params.push(id);
    await this.db.pq(`UPDATE "user" SET ${sets.join(',')} WHERE id=$${params.length}`, params);
    return { ok: true };
  }

  @Delete('users/:id')
  @UseGuards(PermGuard)
  @Perm('roles')
  async remove(@Param('id') id: string) {
    const r: any = await this.db.pq(`SELECT role FROM "user" WHERE id=$1`, [id]);
    const row = (r.rows || r)[0];
    if (!row) return { ok: false, error: 'not found' };
    if (row.role === 'Super Admin') return { ok: false, error: 'Super Admin tidak dapat dihapus' };
    await this.db.pq(`DELETE FROM account WHERE user_id=$1`, [id]);
    await this.db.pq(`DELETE FROM "user" WHERE id=$1`, [id]);
    return { ok: true };
  }

  @Post('users/:id/password')
  @UseGuards(PermGuard)
  @Perm('roles')
  async password(@Param('id') id: string, @Body() b: any) {
    const p = String(b.password || '');
    if (p.length < 5) return { ok: false, error: 'password min. 5 karakter' };
    const password = await hashPassword(p);
    await this.db.pq(`UPDATE account SET password=$1, updated_at=$2 WHERE user_id=$3`, [password, new Date().toISOString(), id]);
    // H4: tanpa ini, token sesi yang sudah bocor/dipegang penyerang tetap
    // valid sampai kedaluwarsa (7 hari) — reset password tidak memulihkan
    // akun yang direbut. Cabut SEMUA sesi target; sesi lain tidak tersentuh.
    await this.db.pq(`DELETE FROM session WHERE user_id=$1`, [id]);
    return { ok: true };
  }

  @Get('roles/permissions')
  async getPerms() {
    const r: any = await this.db.execute(`SELECT role,module,allowed FROM role_permissions` as any);
    const perms: any = {};
    for (const row of r.rows || r) {
      (perms[row.role] = perms[row.role] || {})[row.module] = Number(row.allowed) ? 1 : 0;
    }
    return { perms };
  }

  @Put('roles/permissions')
  @UseGuards(PermGuard)
  @Perm('roles')
  async putPerms(@Body() b: any) {
    const perms = b.perms || b;
    const now = new Date().toISOString();
    await this.db.execute(`DELETE FROM role_permissions` as any);
    for (const role of Object.keys(perms)) {
      if (!ROLES.includes(role)) continue;
      for (const mod of Object.keys(perms[role])) {
        await this.db.pq(`INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ($1,$2,$3,$4)`, [role, mod, perms[role][mod] ? 1 : 0, now]);
      }
    }
    // Kunci anti-lockout: Super Admin selalu penuh meski request direkayasa
    for (const mod of MODULES) {
      await this.db.execute(`INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ('Super Admin','${mod}',1,'${now}') ON CONFLICT (role,module) DO UPDATE SET allowed=1, updated_at='${now}'` as any);
    }
    return { ok: true };
  }

  @Get('roles/logs')
  async logs() {
    const r: any = await this.db.execute(`SELECT id,who,action,category,detail,record_uuid,created_at as time FROM activity_logs ORDER BY created_at DESC LIMIT 200` as any);
    return (r.rows || r).map((l: any) => ({ id: l.id, who: l.who, act: l.action, action: l.action, category: l.category || null, detail: l.detail || null, recordUuid: l.record_uuid || null, time: l.time }));
  }

  // POST terbuka untuk semua role: setiap pengguna boleh mencatat aktivitasnya
  // sendiri (who dari body, fallback header x-user-email). Tanpa ini, role
  // Finance/Support selalu 403 dan aktivitasnya hilang dari Logs.
  @Post('roles/logs')
  async addLog(@Body() b: any, @Req() req: any) {
    if (!b.action) return { ok: false, error: 'action required' };
    const who = await resolveWho(this.db, req);
    await logActivity(this.db, { who, action: b.action, category: b.category, detail: b.detail, recordUuid: b.recordUuid || b.record_uuid });
    return { ok: true };
  }
}
