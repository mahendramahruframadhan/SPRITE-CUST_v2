// Imp#2: secret storage khusus modul AI (tabel app_secrets).
// AI key / koneksi TIDAK PERNAH disimpan di app_config — config umum tidak
// boleh memuat secret. Baca legacy: bila baris AI masih ada di app_config
// ( instalasi lama ), pindahkan ke app_secrets lalu HAPUS dari app_config.
import { rowsOf } from '../db/sql';

const SECRET_KEYS = new Set(['aiConfig', 'aiConnections']);

export async function getSecret(db: any, key: string): Promise<string | null> {
  if (!SECRET_KEYS.has(key)) return null;
  try {
    const r: any = await db.pq(`SELECT value FROM app_secrets WHERE key=$1`, [key]);
    const row = rowsOf(r)[0];
    if (row?.value) return row.value;
    const l: any = await db.pq(`SELECT value FROM app_config WHERE key=$1`, [key]);
    const legacy = rowsOf(l)[0]?.value;
    if (!legacy) return null;
    await db.pq(
      `INSERT INTO app_secrets (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
      [key, legacy, new Date().toISOString()],
    );
    await db.pq(`DELETE FROM app_config WHERE key=$1`, [key]);
    return legacy;
  } catch {
    return null;
  }
}

export async function setSecret(db: any, key: string, value: string): Promise<void> {
  if (!SECRET_KEYS.has(key)) throw new Error('key di luar allowlist secret AI');
  await db.pq(
    `INSERT INTO app_secrets (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
    [key, value, new Date().toISOString()],
  );
}
