import { Controller, Get, Put, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import * as crypto from 'crypto';

const ROLES = ['Super Admin', 'Admin CS', 'Support', 'Finance', 'Viewer'];
const esc = (v: any) => String(v ?? '').replace(/'/g, "''");

// CRUD pengguna + matriks izin + log aktivitas untuk halaman /roles — semua di Postgres.
@Controller()
export class RolesController {
  private db: any = getDb();

  @Get('users')
  async users() {
    const r: any = await this.db.execute(`SELECT id,name,email,role,active,created_at FROM "user" ORDER BY created_at` as any);
    return (r.rows || r).map((u: any) => ({ ...u, active: !!Number(u.active) }));
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() b: any) {
    const sets: string[] = [];
    if (b.name) sets.push(`name='${esc(b.name)}'`);
    if (b.email) sets.push(`email='${esc(String(b.email).toLowerCase())}'`);
    if (b.role && ROLES.includes(b.role)) sets.push(`role='${b.role}'`);
    if (b.active !== undefined) sets.push(`active=${b.active ? 1 : 0}`);
    if (!sets.length) return { ok: false, error: 'nothing to update' };
    sets.push(`updated_at='${new Date().toISOString()}'`);
    await this.db.execute(`UPDATE "user" SET ${sets.join(',')} WHERE id='${esc(id)}'` as any);
    return { ok: true };
  }

  @Delete('users/:id')
  async remove(@Param('id') id: string) {
    const e = esc(id);
    const r: any = await this.db.execute(`SELECT role FROM "user" WHERE id='${e}'` as any);
    const row = (r.rows || r)[0];
    if (!row) return { ok: false, error: 'not found' };
    if (row.role === 'Super Admin') return { ok: false, error: 'Super Admin tidak dapat dihapus' };
    await this.db.execute(`DELETE FROM account WHERE user_id='${e}'` as any);
    await this.db.execute(`DELETE FROM "user" WHERE id='${e}'` as any);
    return { ok: true };
  }

  @Post('users/:id/password')
  async password(@Param('id') id: string, @Body() b: any) {
    const p = String(b.password || '');
    if (p.length < 6) return { ok: false, error: 'password min. 6 karakter' };
    const e = esc(id);
    await this.db.execute(`UPDATE account SET password='${esc(p)}', updated_at='${new Date().toISOString()}' WHERE user_id='${e}'` as any);
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
  async putPerms(@Body() b: any) {
    const perms = b.perms || b;
    const now = new Date().toISOString();
    await this.db.execute(`DELETE FROM role_permissions` as any);
    for (const role of Object.keys(perms)) {
      if (!ROLES.includes(role)) continue;
      for (const mod of Object.keys(perms[role])) {
        await this.db.execute(`INSERT INTO role_permissions (role,module,allowed,updated_at) VALUES ('${role}','${esc(mod)}',${perms[role][mod] ? 1 : 0},'${now}')` as any);
      }
    }
    return { ok: true };
  }

  @Get('roles/logs')
  async logs() {
    const r: any = await this.db.execute(`SELECT who,action,created_at as time FROM activity_logs ORDER BY created_at DESC LIMIT 30` as any);
    return (r.rows || r).map((l: any) => ({ who: l.who, act: l.action, time: l.time }));
  }

  @Post('roles/logs')
  async addLog(@Body() b: any) {
    if (!b.action) return { ok: false, error: 'action required' };
    await this.db.execute(`INSERT INTO activity_logs (id,who,action,created_at) VALUES ('${crypto.randomUUID()}','${esc(b.who || 'Admin')}','${esc(b.action)}','${new Date().toISOString()}')` as any);
    return { ok: true };
  }
}
