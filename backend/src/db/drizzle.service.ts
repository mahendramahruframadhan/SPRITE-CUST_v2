import { Injectable } from '@nestjs/common';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { newDb } from 'pg-mem';
import * as schema from './schema.pg';
import { Pool } from 'pg';

// ponytail: pg-mem in-memory Postgres for local dev (no Docker, no native build). When DATABASE_URL is postgres://, switch to real Pool — see README upgrade path
import { isProduction } from '../config/env';

let _db: any = null;
let _mem: any = null;
let _pool: any = null;

// Imp#1: binding parameter di level driver pool — text + nilai terpisah
// ($1..$n). sql-tag drizzle dipakai gagal di pg-mem ("getTypeParser is not
// supported"), sedangkan pool.query(text, params) jalan di pg-mem maupun
// Postgres asli. db.pq() adalah jalur utama query dengan input eksternal.
function attachPq(db: any, pool: any) {
  db.pq = (text: string, params: any[] = []) =>
    pool.query(text, params.map((v) => (v === undefined ? null : v)));
}

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL || '';
  const isRealPg = /^postgres(?:ql)?:\/\//.test(url);
  if (isProduction() && !isRealPg) {
    throw new Error('DATABASE_URL production harus memakai postgresql:// atau postgres://.');
  }
  if (isRealPg) {
    const pool = new Pool({ connectionString: url });
    _pool = pool;
    _db = drizzlePg(pool, { schema: schema as any });
    attachPq(_db, pool);
    return _db;
  }
  // local: pg-mem
  _mem = newDb();
  // pg-mem adapter creates a pg-compatible Pool
  const { Pool: MemPool } = _mem.adapters.createPg();
  const pool = new MemPool();
  _pool = pool;
  _db = drizzlePg(pool, { schema: schema as any });
  attachPq(_db, pool);
  // create tables on first call via initDb, but ensure pool ready
  return _db;
}

export function getMemDb() {
  if (!_mem) getDb();
  return _mem;
}

@Injectable()
export class DrizzleService {
  public readonly db = getDb();
}
