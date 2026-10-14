// Uji review security backend/src (F1/F1b/F1c/F2):
// (1) F1 — PUT /roles/permissions: pemegang izin 'roles' NON-Super-Admin tidak
//     boleh menaikkan izin modul yang belum dipegangnya (self-escalation lewat
//     matriks), tapi tetap boleh menyimpan dalam batas wewenangnya. Super Admin
//     tetap bebas, dan rewrite tidak menghapus baris di luar payload (no wipe).
// (2) F1b — POST /users/:id/password: non-SA tidak boleh mereset password Super
//     Admin. H3 melindungi role/aktif, endpoint password luput → pintu takeover
//     (bisa login sebagai SA setelah mereset).
// (3) F1c — PATCH /users/:id: non-SA tidak boleh mengubah email Super Admin
//     (lockout: login berbasis email → SA tak bisa masuk).
// (4) F2 — kegagalan di tengah rewrite matriks harus rollback penuh (transaksi),
//     bukan meninggalkan matriks terhapus separuh (jendela lockout izin).
// node:test + pg-mem. Jalankan: npm test
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession, resolveSessionUser } from '../src/auth/session.ts';
import { RolesController } from '../src/roles/roles.controller.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { esc } from '../src/db/sql.ts';

const uniq = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const withToken = (t: string) => ({ headers: { 'x-auth-token': t } });

async function grant(role: string, mod: string, allowed: number) {
  await db().execute(
    `INSERT INTO role_permissions (role,module,allowed) VALUES ('${esc(role)}','${esc(mod)}',${allowed})` as any,
  );
}

// Tiap test mulai dari matriks eksplisit: helper pg-mem tanpa PRIMARY KEY
// membuat grant() berulang pada (role,module) sama melahirkan baris duplikat
// (nilai terakhir menang saat dibaca) — sumber kebocoran antar-test.
const resetPerms = async () => {
  await db().execute(`DELETE FROM role_permissions` as any);
};

async function perm(role: string, mod: string): Promise<number | null> {
  const r: any = await db().execute(
    `SELECT allowed FROM role_permissions WHERE role='${esc(role)}' AND module='${esc(mod)}'` as any,
  );
  const row = (r.rows || r)[0];
  return row ? Number(row.allowed) : null;
}

// Buat pengguna + sesi + grant modul tertentu ke role-nya.
async function client(role: string, mods: [string, number][]) {
  const u = await seedUser(role, `${role.split(' ')[0].toLowerCase()}-${uniq()}@revota.id`);
  const token = await createSession(db(), u.id);
  for (const [m, a] of mods) await grant(role, m, a);
  return { user: u, req: withToken(token) };
}

// Skema dibuat sekali per proses file — pg-mem menolak DDL kedua yang sama.
before(() => {
  setupTables();
});

describe('F1 — matriks izin dibatasi wewenang pemegang roles', () => {
  it('non-SA berizin roles TIDAK bisa memberi role-nya modul yang belum dipegangnya', async () => {
    await resetPerms();
    const { req } = await client('Admin CS', [['roles', 1], ['cases', 1], ['cfg', 0]]);
    const ctl = new RolesController();
    const r: any = await (ctl as any).putPerms(
      { perms: { 'Admin CS': { roles: 1, cases: 1, cfg: 1 } } },
      req,
    );
    assert.equal(r?.ok, true, 'simpan dalam wewenang lain tetap diproses');
    assert.deepEqual(
      r?.skipped,
      [{ role: 'Admin CS', module: 'cfg' }],
      'perubahan di luar wewenang wajib dilaporkan lewat skipped',
    );
    assert.equal(await perm('Admin CS', 'cfg'), 0, 'izin cfg tidak boleh naik — self-escalation');
    assert.equal(await perm('Admin CS', 'cases'), 1, 'izin dalam wewenang tetap tersimpan');
  });

  it('non-SA berizin roles TIDAK bisa memberi role LAIN modul yang belum dipegangnya', async () => {
    await resetPerms();
    const { req } = await client('Admin CS', [['roles', 1], ['cases', 1]]);
    await grant('Support', 'billing', 0);
    const ctl = new RolesController();
    const r: any = await (ctl as any).putPerms({ perms: { Support: { billing: 1 } } }, req);
    assert.equal(await perm('Support', 'billing'), 0, 'grant billing oleh non-pemegang billing harus ditolak');
    assert.deepEqual(r?.skipped, [{ role: 'Support', module: 'billing' }], 'wajib dilaporkan sebagai skipped');
  });

  it('non-SA berizin roles BISA menyimpan dalam batas modul yang dipegangnya (tanpa over-block)', async () => {
    await resetPerms();
    const { req } = await client('Admin CS', [['roles', 1], ['cases', 1]]);
    await grant('Support', 'billing', 1);
    const ctl = new RolesController();
    const r: any = await (ctl as any).putPerms({ perms: { Support: { cases: 1 } } }, req);
    assert.equal(r?.ok, true);
    assert.deepEqual(r?.skipped, [], 'tidak ada skipped untuk perubahan dalam wewenang');
    assert.equal(await perm('Support', 'cases'), 1, 'perubahan sah tersimpan');
    assert.equal(await perm('Support', 'billing'), 1, 'baris di luar payload TIDAK boleh terhapus (no wipe)');
  });

  it('Super Admin tetap bebas mengubah matriks + anti-lockout tetap penuh', async () => {
    await resetPerms();
    const { req } = await client('Super Admin', [['roles', 1]]);
    await grant('Support', 'cases', 1);
    const ctl = new RolesController();
    const r: any = await (ctl as any).putPerms({ perms: { Support: { cases: 1, cfg: 1 } } }, req);
    assert.equal(r?.ok, true);
    assert.deepEqual(r?.skipped, [], 'SA tidak pernah di-skip');
    assert.equal(await perm('Support', 'cfg'), 1, 'SA boleh memberi modul apa pun');
    assert.equal(await perm('Super Admin', 'roles'), 1, 'kunci anti-lockout: SA tetap penuh');
    assert.equal(await perm('Super Admin', 'dashboard'), 1, 'kunci anti-lockout: modul lain SA tetap 1');
  });
});

describe('F1b — reset password Super Admin dilindungi', () => {
  it('non-SA berizin roles TIDAK bisa mereset password Super Admin', async () => {
    const sa = await seedUser('Super Admin', `sa-${uniq()}@revota.id`);
    const saToken = await createSession(db(), sa.id);
    const { req } = await client('Admin CS', [['roles', 1]]);

    const ctl = new RolesController();
    await assert.rejects(
      () => (ctl as any).password(sa.id, { password: 'dicuri-oleh-attacker-1' }, req),
      (e: any) =>
        e?.status === 403 && e?.response?.code === 'SUPERADMIN_PROTECTED',
      'reset password SA oleh non-SA harus 403 SUPERADMIN_PROTECTED',
    );

    // Sesi SA yang sudah ada TIDAK ikut tercabut oleh percobaan reset yang
    // ditolak. (Dicatat sebelum signIn: kebijakan satu-sesi-per-user memang
    // membuat login baru mengusir sesi lama — lihat auth/session.ts.)
    assert.ok(await resolveSessionUser(db(), withToken(saToken)), 'sesi SA tidak boleh tercabut');
    // SA masih bisa login dengan password lamanya (bukti password tak berubah)
    const auth = new AuthController();
    const si: any = await auth.signIn(
      { email: sa.email, password: 'password123' },
      { headers: {} },
      undefined,
    );
    assert.ok(si?.user, `SA harus tetap bisa login (respons: ${JSON.stringify(si)})`);
  });

  it('Super Admin tetap bisa mereset password admin lain (tidak over-block)', async () => {
    const { user } = await client('Admin CS', [['roles', 1]]);
    const { req } = await client('Super Admin', [['roles', 1]]);
    const ctl = new RolesController();
    const r: any = await (ctl as any).password(user.id, { password: 'baru-aman-12345' }, req);
    assert.equal(r?.ok, true, 'reset oleh SA harus sukses');
    const auth = new AuthController();
    const si: any = await auth.signIn({ email: user.email, password: 'baru-aman-12345' }, { headers: {} }, undefined);
    assert.ok(si?.user, 'password baru harus berlaku');
  });
});

describe('F1c — email Super Admin tidak bisa diubah non-SA', () => {
  it('non-SA TIDAK bisa mengubah email Super Admin (lockout login)', async () => {
    const sa = await seedUser('Super Admin', `sa-${uniq()}@revota.id`);
    const { req } = await client('Admin CS', [['roles', 1]]);
    const ctl = new RolesController();
    await assert.rejects(
      () => (ctl as any).updateUser(sa.id, { email: `dicuri-${uniq()}@evil.id` }, req),
      (e: any) => e?.status === 403,
      'ubah email SA oleh non-SA harus 403',
    );
    const r: any = await db().execute(`SELECT email FROM "user" WHERE id='${esc(sa.id)}'` as any);
    assert.equal((r.rows || r)[0]?.email, sa.email, 'email SA harus tetap asli');
  });

  it('non-SA tetap bisa mengubah email pengguna biasa (tidak over-block)', async () => {
    const victim = await seedUser('Viewer', `korban-${uniq()}@revota.id`);
    const { req } = await client('Admin CS', [['roles', 1]]);
    const ctl = new RolesController();
    const r: any = await (ctl as any).updateUser(victim.id, { email: `baru-${uniq()}@revota.id` }, req);
    assert.equal(r?.ok, true, 'edit email pengguna biasa tetap boleh');
  });
});

describe('F2 — rewrite matriks transaksional', () => {
  it('SELURUH tulisan matriks berjalan di dalam SATU transaksi (atomik)', async () => {
    // Catatan lingkungan: adapter pool pg-mem (test/dev) TIDAK melakukan
    // rollback bila callback transaksi melempar — sudah diverifikasi terpisah;
    // jalur produksi memakai Postgres asli via drizzle + node-postgres Pool
    // yang menghormati BEGIN/ROLLBACK. Kontrak yang bisa diuji di sini (pola
    // sama dengan config.rename.test / M6): tidak ada satu pun tulisan
    // DELETE/INSERT/UPDATE di LUAR pemanggilan transaction, dan seluruh
    // tulisan rewrite berjalan lewat objek tx yang terikat transaksi.
    await resetPerms();
    await grant('Support', 'cases', 1);
    await grant('Finance', 'billing', 1);
    const { req } = await client('Super Admin', [['roles', 1]]);

    const ctl = new RolesController();
    const d: any = (ctl as any).db;
    const orig = {
      execute: d.execute.bind(d),
      pq: d.pq.bind(d),
      transaction: d.transaction.bind(d),
    };
    const isWrite = (sql: any) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(String(sql));
    const outsideWrites: string[] = [];
    let txCalls = 0;
    let txWrites = 0;
    d.execute = (sql: any, ...rest: any[]) => {
      if (isWrite(sql)) outsideWrites.push(String(sql).slice(0, 70));
      return orig.execute(sql, ...rest);
    };
    d.pq = (sql: any, params?: any[]) => {
      if (isWrite(sql)) outsideWrites.push(String(sql).slice(0, 70));
      return orig.pq(sql, params);
    };
    d.transaction = async (fn: any) => {
      txCalls += 1;
      return orig.transaction(async (tx: any) =>
        fn({
          execute: (sql: any, ...rest: any[]) => {
            if (isWrite(sql)) txWrites += 1;
            return tx.execute(sql, ...rest);
          },
        }),
      );
    };
    try {
      const r: any = await (ctl as any).putPerms({ perms: { Support: { cases: 1, cfg: 1 } } }, req);
      assert.equal(r?.ok, true, 'rewrite tetap harus sukses di jalur normal');
    } finally {
      d.execute = orig.execute;
      d.pq = orig.pq;
      d.transaction = orig.transaction;
    }
    assert.equal(txCalls, 1, 'rewrite matriks wajib lewat SATU pemanggilan transaction');
    assert.deepEqual(
      outsideWrites,
      [],
      `tulisan di luar transaksi = jendela wipe (dapat: ${outsideWrites.join(' | ')})`,
    );
    assert.ok(txWrites >= 3, `DELETE + INSERT harus berjalan di dalam transaksi (dapat ${txWrites})`);
  });
});
