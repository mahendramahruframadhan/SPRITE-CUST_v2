import { Injectable } from '@nestjs/common';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { newDb } from 'pg-mem';
import * as schema from './schema.pg';
import { Pool } from 'pg';

// ponytail: pg-mem in-memory Postgres for local dev (no Docker, no native build). When DATABASE_URL is postgres://, switch to real Pool — see README upgrade path
let _db: any = null;
let _mem: any = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL || '';
  const isRealPg = url.startsWith('postgres');
  if (isRealPg) {
    const pool = new Pool({ connectionString: url });
    _db = drizzlePg(pool, { schema: schema as any });
    return _db;
  }
  // local: pg-mem
  _mem = newDb();
  // pg-mem adapter creates a pg-compatible Pool
  const { Pool: MemPool } = _mem.adapters.createPg();
  const pool = new MemPool();
  _db = drizzlePg(pool, { schema: schema as any });
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
