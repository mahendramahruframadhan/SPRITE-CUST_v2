// I2 + I3 (audit): remove() satu statement atomic — catatan riwayat
// dibersihkan FK CASCADE; removeAll() bulk menghapus semua issue + 1 baris
// log aktivitas. pg-mem murni (helper db()), tanpa boot server.
// Jalankan: npm test
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './helpers/pgmem.ts';
import { getMemDb } from '../src/db/drizzle.service.ts';
import { rowsOf } from '../src/db/sql.ts';
import { FollowupsService } from '../src/followups/followups.service.ts';

const ddls = [
  `CREATE TABLE IF NOT EXISTS followups (id TEXT PRIMARY KEY, client_name TEXT NOT NULL, issue_date TEXT NOT NULL, module TEXT NOT NULL, title TEXT NOT NULL, description TEXT, priority TEXT NOT NULL DEFAULT 'Sedang', status TEXT NOT NULL DEFAULT 'Open', followup_date TEXT NOT NULL, pic TEXT, resolved_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  // Cermin init.ts: FK ON DELETE CASCADE menjadi kunci atomicity I2.
  `CREATE TABLE IF NOT EXISTS followup_notes (id TEXT PRIMARY KEY, followup_id TEXT NOT NULL REFERENCES followups(id) ON DELETE CASCADE, note TEXT NOT NULL, is_auto INTEGER DEFAULT 0, who TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS activity_logs (id TEXT PRIMARY KEY, who TEXT, action TEXT, category TEXT, detail TEXT, record_uuid TEXT, created_at TEXT)`,
];

let svc: FollowupsService;
let tablesReady = false;

// DDL dibuat sekali per proses — pg-mem menolak eksekusi ulang statement
// CREATE TABLE IF NOT EXISTS identik (AST coverage). beforeEach hanya
// membersihkan baris.
function ensureTables() {
  if (tablesReady) return;
  const mem = getMemDb();
  for (const ddl of ddls) mem.public.none(ddl); // DDL wajib jalur ini (pola init.ts)
  tablesReady = true;
}

async function seedIssue(id: string, title = 'Isu uji') {
  const now = new Date().toISOString();
  await db().pq(
    `INSERT INTO followups (id,client_name,issue_date,module,title,description,priority,status,followup_date,pic,resolved_at,created_at,updated_at)
     VALUES ($1,'C','2026-01-01','M',$3,'','Sedang','Open','2026-01-02','',NULL,$2,$2)`,
    [id, now, title],
  );
  await db().pq(
    `INSERT INTO followup_notes (id,followup_id,note,is_auto,who,created_at) VALUES ($1,$2,'catatan',0,'tester',$3)`,
    [`n_${id}`, id, now],
  );
}

beforeEach(async () => {
  ensureTables();
  await db().pq(`DELETE FROM followup_notes`);
  await db().pq(`DELETE FROM followups`);
  await db().pq(`DELETE FROM activity_logs`);
  svc = new FollowupsService();
});

describe('I2 — remove atomic via FK cascade', () => {
  it('hapus issue memindahkan catatan riwayatnya juga (tanpa DELETE manual kedua)', async () => {
    await seedIssue('fu_a');
    const r = await svc.remove('fu_a', 'tester');
    assert.equal(r.id, 'fu_a');
    assert.equal(rowsOf(await db().pq(`SELECT count(*)::int AS c FROM followups`))[0].c, 0);
    assert.equal(
      rowsOf(await db().pq(`SELECT count(*)::int AS c FROM followup_notes`))[0].c,
      0,
      'catatan harus ikut terhapus lewat FK CASCADE',
    );
  });

  it('remove issue yang tak ada → 404 NOT_FOUND', async () => {
    await assert.rejects(
      () => svc.remove('fu_tidak_ada', 'tester'),
      (e: any) => e?.response?.code === 'NOT_FOUND' || e?.code === 'NOT_FOUND',
    );
  });
});

describe('I3 — removeAll bulk reset', () => {
  it('menghapus semua baris + catatan, dan mencatat satu log aktivitas dengan jumlah baris', async () => {
    await seedIssue('fu_1');
    await seedIssue('fu_2', 'Isu kedua');
    const r = await svc.removeAll('tester');
    assert.ok(r.count >= 2, `count minimal 2, dapat ${r.count}`);
    assert.equal(rowsOf(await db().pq(`SELECT count(*)::int AS c FROM followups`))[0].c, 0);
    assert.equal(rowsOf(await db().pq(`SELECT count(*)::int AS c FROM followup_notes`))[0].c, 0);
    const logs = rowsOf(await db().pq(`SELECT action FROM activity_logs ORDER BY created_at DESC`));
    assert.equal(logs.length, 1, 'harus tepat satu baris log bulk');
    assert.match(logs[0].action, /2 baris/);
  });

  it('reset saat kosong tetap sukses dengan count 0 (tanpa galat)', async () => {
    const r = await svc.removeAll('tester');
    assert.equal(Number(r.count), 0);
  });
});
