import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession } from '../src/auth/session.ts';
import { RolesController } from '../src/roles/roles.controller.ts';
import { logActivity, resolveWho } from '../src/logs/activity.ts';

const unique = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe('Imp#3 audit log append-only', () => {
  before(() => {
    setupTables();
  });

  it('id + created_at baris log dibuat server; payload client tidak bisa memalsukannya', async () => {
    const suffix = unique();
    const user = await seedUser('Support', `aud-${suffix}@revota.id`);
    const token = await createSession(db(), user.id);
    const action = `append-${suffix}`;
    const evil = { who: 'attacker', id: 'evil-id', created_at: '1999-01-01T00:00:00.000Z', action, detail: 'dari client' };
    const before = Date.now() - 5000;
    const controller = new RolesController();
    await controller.addLog(evil, { headers: { 'x-auth-token': token } });
    const r: any = await db().pq(`SELECT id, who, created_at FROM activity_logs WHERE action=$1 LIMIT 1`, [action]);
    const row = (r.rows || r)[0];
    assert.ok(row, 'baris log tersimpan');
    assert.notEqual(row.id, 'evil-id', 'id baris = UUID server, bukan dari client');
    assert.notEqual(row.created_at, '1999-01-01T00:00:00.000Z', 'created_at = timestamp server');
    assert.ok(Date.parse(row.created_at) >= before, 'created_at dekat waktu server');
    assert.equal(row.who, 'Support', 'actor = session, bukan who client');
  });

  it('endpoint addLog dijaga SessionGuard (kelas-level)', async () => {
    // guard NestJS hanya jalan lewat pipeline HTTP — uji deklarasinya di sini;
    // penolakan request tanpa token diuji e2e lewat app.
    const guards: any[] = Reflect.getMetadata?.('__guards__', RolesController) || [];
    assert.ok(
      guards.some((g: any) => g && g.name === 'SessionGuard'),
      'RolesController harus memakai SessionGuard kelas-level',
    );
  });

  it('resolveWho HANYA dari sesi — tanpa sesi → system, header/argumen client diabaikan', async () => {
    const noSes = await resolveWho(db(), { headers: { 'x-user-email': 'attacker@evil.id' } });
    assert.equal(noSes, 'system', 'tanpa sesi valid → system, bukan akun apa pun');
    const spoof = await resolveWho(db(), { headers: {} }, 'attacker@evil.id');
    assert.equal(spoof, 'system', 'argumen fallback client tidak lagi dipercaya');
  });

  it('logActivity tanpa pemanggil who → system (bukan nama privileged)', async () => {
    const action = `defwho-${unique()}`;
    await logActivity(db(), { action });
    const r: any = await db().pq(`SELECT who FROM activity_logs WHERE action=$1 LIMIT 1`, [action]);
    assert.equal((r.rows || r)[0]?.who, 'system');
  });

  it('tulis log selalu append: dua entry → dua baris, id unik', async () => {
    const a = `append-a-${unique()}`;
    const b = `append-b-${unique()}`;
    await logActivity(db(), { who: 'Support', action: a });
    await logActivity(db(), { who: 'Support', action: b });
    const r: any = await db().pq(`SELECT id FROM activity_logs WHERE action=$1 OR action=$2`, [a, b]);
    const rows = r.rows || r;
    assert.equal(rows.length, 2, 'kedua entry tersimpan');
    assert.notEqual(rows[0].id, rows[1].id, 'id unik per baris');
  });

  it('sumber backend tidak punya jalur UPDATE/DELETE/TRUNCATE activity_logs', () => {
    const src = path.join(__dirname, '../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) {
          const txt = fs.readFileSync(p, 'utf8');
          if (/UPDATE\s+activity_logs/i.test(txt) || /DELETE\s+FROM\s+activity_logs/i.test(txt) || /TRUNCATE\s+activity_logs/i.test(txt)) {
            offenders.push(path.relative(src, p));
          }
        }
      }
    };
    walk(src);
    assert.deepEqual(offenders, [], `activity_logs append-only: ditemukan mutasi di ${offenders.join(', ')}`);
  });
});
