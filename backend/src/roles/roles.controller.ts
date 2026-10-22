import { Controller, Get, Put, Post, Patch, Delete, Param, Body, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { logActivity, resolveWho } from '../logs/activity';
import { Perm, PermGuard, hasModulePerm } from '../auth/perm.guard';
import { hashPassword } from '../auth/password';
import { SessionGuard } from '../auth/session.guard';
import { resolveSessionUser } from '../auth/session';
import { esc } from '../db/sql';

const ROLES = ['Super Admin', 'Admin CS', 'Support', 'Finance', 'Viewer'];
// Union seluruh modul yang ada di matriks: seed init.ts + id halaman
// frontend (termasuk report + analytics yang dienforce/dikelola UI).
// Dipakai untuk (a) filter kunci payload dan (b) kunci anti-lockout
// Super Admin — sebelumnya daftar ini lebih sempit dari seed, jadi ada modul
// yang tidak pernah dipaksa penuh.
// Union seluruh modul yang ada di matriks: seed init.ts + id halaman
// frontend (termasuk report + analytics yang dienforce/dikelola UI).
// Dipakai untuk (a) filter kunci payload dan (b) kunci anti-lockout
// Super Admin — sebelumnya daftar ini lebih sempit dari seed, jadi ada modul
// yang tidak pernah dipaksa penuh. Di-export untuk test matriks.
export const MODULES = [
  'dashboard', 'cases', 'form', 'clients', 'followups', 'hrreport', 'cfg', 'popinava',
  'billing', 'finance', 'report', 'analytics', 'mockup', 'roles', 'logs', 'settings',
  'notifications',
];

// CRUD pengguna + matriks izin + log aktivitas untuk halaman /roles — semua di Postgres.
// Class-level SessionGuard: SEMUA endpoint (termasuk GET) wajib x-auth-token
// valid; method tulis tambah dijaga PermGuard izin 'roles', GET roles/logs
// dijaga izin 'logs' (M-3), dan GET users memfilter respons per izin
// 'roles' (M-3). (Dulu ada PermGuard class-level — GET roles/permissions ikut
// 403 untuk role tanpa izin 'roles', merusak alur login frontend.)
@UseGuards(SessionGuard)
@Controller()
export class RolesController {
  private db: any = getDb();

  @Get('users')
  async users(@Req() req: any) {
    const r: any = await this.db.execute(`SELECT id,name,email,role,active,created_at FROM "user" ORDER BY created_at` as any);
    const all = (r.rows || r).map((u: any) => ({ ...u, active: !!Number(u.active) }));
    // M-3: daftar lengkap (email + role semua orang) hanya untuk role berizin
    // 'roles'. Role lain tetap bisa GET — hanya menerima barisnya SENDIRI
    // (SettingsPage butuh id sendiri untuk edit profil), tanpa perubahan UI.
    const actor = (req as any)?.user || (await resolveSessionUser(this.db, req));
    if (!actor || (await hasModulePerm(this.db, actor.role, 'roles'))) return all;
    return all.filter((u: any) => u.id === actor.id);
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
    const curR: any = await this.db.pq(`SELECT role, active, email FROM "user" WHERE id=$1 LIMIT 1`, [id]);
    const cur = (curR.rows || curR)[0];
    if (!cur) throw new HttpException({ code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan.' }, HttpStatus.NOT_FOUND);
    const targetIsSA = cur.role === 'Super Admin';
    const targetWasActive = Number(cur.active ?? 1) === 1;
    const grantSA = b.role === 'Super Admin' && cur.role !== 'Super Admin';
    const demoteSA = targetIsSA && b.role && ROLES.includes(b.role) && b.role !== 'Super Admin';
    const deactivate = b.active !== undefined && !b.active;
    const activate = b.active !== undefined && !!b.active;
    // F1c: dua lubang yang luput dari guard H3:
    // - ubah email SA → lockout (login berbasis email; proteksi status/role
    //   sudah menutup jalan lain, tapi email masih bebas diubah siapa pun
    //   berizin 'roles');
    // - aktifkan kembali SA yang dinonaktifkan → membatalkan keputusan sesama
    //   SA dan mengembalikan akun itu ke kekuasaan penuh.
    const changeEmail = !!b.email && String(b.email).toLowerCase() !== String(cur.email || '').toLowerCase();
    const activateSA = targetIsSA && activate;
    const perturbSA = demoteSA || deactivate || changeEmail || activateSA;

    // Memberi status SA, atau mengutak-atik SA yang ada → hanya sesama SA.
    // (Matriks /roles memang mengizinkan SA mencentang modul 'roles' untuk
    // role lain — tanpa ini, role itu langsung bisa self-escalate.)
    if ((grantSA || (targetIsSA && perturbSA)) && !actorIsSA) {
      throw new HttpException(
        { code: 'SUPERADMIN_PROTECTED', message: 'Hanya Super Admin yang dapat mengubah akun Super Admin (status, role, atau email).' },
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
  async password(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    // F1b: endpoint ini luput dari guard H3 — tanpa cek di sini, pemegang izin
    // 'roles' NON-Super-Admin bisa mereset password Super Admin lalu login
    // sebagai SA (takeover seluruh sistem; guard role/aktif jadi tidak berarti).
    const actor = await resolveSessionUser(this.db, req);
    const t: any = await this.db.pq(`SELECT role FROM "user" WHERE id=$1`, [id]);
    const target = (t.rows || t)[0];
    if (target?.role === 'Super Admin' && actor?.role !== 'Super Admin') {
      throw new HttpException(
        { code: 'SUPERADMIN_PROTECTED', message: 'Hanya Super Admin yang dapat mereset password Super Admin.' },
        HttpStatus.FORBIDDEN,
      );
    }
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
  async putPerms(@Body() b: any, @Req() req: any) {
    const perms = b.perms || b;
    const actor = await resolveSessionUser(this.db, req);
    if (!actor) {
      throw new HttpException(
        { code: 'SESSION_EXPIRED', message: 'Sesi berakhir — silakan login lagi.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // F1: pemegang izin 'roles' NON-Super-Admin hanya boleh menulis modul yang
    // benar-benar dipegang role-nya (baris allowed=1). Tanpa ini non-SA bisa
    // mencentang modul baru untuk role-nya sendiri → self-escalation penuh
    // (mis. menambah 'billing' lalu menerbitkan invoice, atau 'cfg' lalu
    // merewrite master sheet).
    const actorIsSA = actor.role === 'Super Admin';
    let held = new Set<string>();
    if (!actorIsSA) {
      const h: any = await this.db.pq(`SELECT module FROM role_permissions WHERE role=$1 AND allowed=1`, [actor.role]);
      held = new Set(((h.rows || h) as any[]).map((r) => String(r.module)));
    }

    // Matriks sekarang jadi dasar tulis: baris di LUAR payload TIDAK boleh
    // hilang (no wipe — API menerima payload parsial) dan perubahan di luar
    // wewenang dipertahankan apa adanya, dilaporkan lewat `skipped`.
    const curR: any = await this.db.execute(`SELECT role,module,allowed FROM role_permissions` as any);
    const final: Record<string, Record<string, number>> = {};
    for (const row of curR.rows || curR) {
      (final[row.role] = final[row.role] || {})[row.module] = Number(row.allowed) ? 1 : 0;
    }

    const skipped: { role: string; module: string }[] = [];
    for (const role of Object.keys(perms)) {
      if (!ROLES.includes(role)) continue;
      final[role] = final[role] || {};
      for (const mod of Object.keys(perms[role] || {})) {
        if (!MODULES.includes(mod)) continue;
        const want = perms[role][mod] ? 1 : 0;
        if (!actorIsSA && !held.has(mod)) {
          if (want !== (final[role][mod] ?? 0)) skipped.push({ role, module: mod });
          continue;
        }
        final[role][mod] = want;
      }
    }

    // Kunci anti-lockout: Super Admin selalu penuh meski request direkayasa.
    final['Super Admin'] = final['Super Admin'] || {};
    for (const mod of MODULES) final['Super Admin'][mod] = 1;

    // F2: tulis SATU transaksi (pola config.controller) — kegagalan di tengah
    // rewrite membatalkan seluruh perubahan, bukan meninggalkan matriks
    // terhapus separuh (jendela lockout izin). Tanpa ON CONFLICT: tabel sudah
    // kosong oleh DELETE, cukup INSERT biasa.
    const now = new Date().toISOString();
    await this.db.transaction(async (tx: any) => {
      await tx.execute(`DELETE FROM role_permissions` as any);
      for (const [role, mods] of Object.entries(final)) {
        for (const [mod, allowed] of Object.entries(mods)) {
          await tx.execute(
            `INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ('${esc(role)}','${esc(mod)}','${allowed}','${now}')` as any,
          );
        }
      }
    });
    return { ok: true, skipped };
  }

  @Get('roles/logs')
  @UseGuards(PermGuard)
  @Perm('logs')
  async logs() {
    const r: any = await this.db.execute(`SELECT id,who,action,category,detail,record_uuid,created_at as time FROM activity_logs ORDER BY created_at DESC LIMIT 200` as any);
    return (r.rows || r).map((l: any) => ({ id: l.id, who: l.who, act: l.action, action: l.action, category: l.category || null, detail: l.detail || null, recordUuid: l.record_uuid || null, time: l.time }));
  }

  // Imp#3: client hanya mengirim action/category/detail/recordUuid — actor
  // (who), id, dan created_at SELALU dibuat server dari sesi.
  // M-4: @Perm('logs') menutup self-attribution injection — tanpa guard, role
  // mana pun bisa menyuntik baris log palsu atas namanya. Role tanpa izin
  // logs (Support/Viewer) ditolak 403; pemanggil Settings memakai .catch()
  // sehingga UI tidak patah (hanya entri aktivitasnya yang tidak tercatat).
  // logActivity server-side (billing dsb.) tidak lewat endpoint ini.
  @Post('roles/logs')
  @UseGuards(PermGuard)
  @Perm('logs')
  async addLog(@Body() b: any, @Req() req: any) {
    if (!b.action) return { ok: false, error: 'action required' };
    const who = await resolveWho(this.db, req);
    await logActivity(this.db, { who, action: b.action, category: b.category, detail: b.detail, recordUuid: b.recordUuid || b.record_uuid });
    return { ok: true };
  }
}
