// Imp#2: modul konfigurasi AI dipisah dari config umum.
// - Generic GET/PUT /config MENOLAK key aiConfig/aiConnections (403
//   AI_CONFIG_SEPARATED) — pakai endpoint khusus /config/ai.
// - Endpoint khusus: Super Admin hanya untuk tulis; key disimpan di tabel
//   app_secrets (secret storage khusus), app_config TIDAK pernah memuat key.
// - Membaca AI key (ai.controller) lewat getSecret — fallback migrasi legacy
//   dari app_config → app_secrets (baris lama dihapus dari app_config).
// Jalankan: npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { ConfigController } from '../src/config/config.controller.ts';
import { AiConfigController } from '../src/config/ai-config.controller.ts';
import { getSecret } from '../src/config/app-secret.ts';
import { createSession } from '../src/auth/session.ts';
import { rowsOf } from '../src/db/sql.ts';

async function reqFor(email: string) {
  const user: any = rowsOf(await db().pq(`SELECT id FROM "user" WHERE email=$1`, [email]))[0];
  const token = await createSession(db(), user.id);
  return { headers: { 'x-auth-token': token }, ip: '127.0.0.1' };
}

describe('pemisahan modul AI config (Imp#2)', () => {
  before(async () => {
    setupTables();
    await seedUser('Super Admin', 'sa.ai@revota.id');
    await seedUser('Viewer', 'viewer.ai@revota.id');
  });

  it('generic GET ?key=aiConfig DITOLAK 403 AI_CONFIG_SEPARATED', async () => {
    const ctl = new ConfigController();
    await assert.rejects(
      () => ctl.get('aiConfig'),
      (e: any) => e?.status === 403 && e?.response?.code === 'AI_CONFIG_SEPARATED',
      'config umum tidak boleh menyajikan modul AI',
    );
  });

  it('generic PUT key=aiConfig DITOLAK 403 (meski Super Admin)', async () => {
    const ctl = new ConfigController();
    const req = await reqFor('sa.ai@revota.id');
    await assert.rejects(
      () => ctl.put({ key: 'aiConfig', config: { baseURL: 'x' } }, req),
      (e: any) => e?.status === 403 && e?.response?.code === 'AI_CONFIG_SEPARATED',
    );
  });

  it('PUT khusus sebagai Super Admin → key masuk app_secrets, BUKAN app_config', async () => {
    const ai = new AiConfigController();
    const req = await reqFor('sa.ai@revota.id');
    const r: any = await ai.put({ key: 'aiConfig', config: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey: 'sk-rahasia-123' } }, req);
    assert.equal(r.ok, true);

    const inSecrets = rowsOf(await db().pq(`SELECT value FROM app_secrets WHERE key=$1`, ['aiConfig']));
    assert.ok(inSecrets[0]?.value?.includes('sk-rahasia-123'), 'key utuh di app_secrets');
    const inConfig = rowsOf(await db().pq(`SELECT value FROM app_config WHERE key=$1`, ['aiConfig']));
    assert.equal(inConfig.length, 0, 'app_config tidak boleh menyimpan AI key');
  });

  it('GET khusus → ter-mask + hasKey, tanpa membocorkan key utuh', async () => {
    const ai = new AiConfigController();
    const req = await reqFor('viewer.ai@revota.id');
    const r: any = await ai.get('aiConfig', req);
    assert.ok(r?.config, 'shape {source,key,config} dipertahankan');
    assert.ok(!String(r.config.apiKey || '').includes('sk-rahasia-123'), 'key tidak boleh utuh ke browser');
    assert.ok(String(r.config.apiKey || '').includes('••••') || r.config.hasKey, 'key ter-mask');
  });

  it('PUT khusus NON-Super Admin → 403', async () => {
    const ai = new AiConfigController();
    const req = await reqFor('viewer.ai@revota.id');
    await assert.rejects(
      () => ai.put({ key: 'aiConnections', config: { connections: [] } }, req),
      (e: any) => e?.status === 403,
    );
  });

  it('legacy: baris AI di app_config dimigrasi ke app_secrets + dihapus', async () => {
    // bersihkan secret dari test sebelumnya supaya jalur legacy benar-benar ditempuh
    await db().pq(`DELETE FROM app_secrets WHERE key=$1`, ['aiConfig']);
    await db().pq(
      `INSERT INTO app_config (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
      ['aiConfig', JSON.stringify({ apiKey: 'sk-legacy-999', baseURL: 'https://api.zzz/v1' }), new Date().toISOString()],
    );
    const got = JSON.parse((await getSecret(db(), 'aiConfig')) as string);
    assert.equal(got.apiKey, 'sk-legacy-999', 'secret lama tetap terbaca');
    const legacy = rowsOf(await db().pq(`SELECT value FROM app_config WHERE key=$1`, ['aiConfig']));
    assert.equal(legacy.length, 0, 'baris legacy di app_config harus dihapus');
    const again = JSON.parse((await getSecret(db(), 'aiConfig')) as string);
    assert.equal(again.apiKey, 'sk-legacy-999', 'baca kedua dari app_secrets');
  });

  it('ai.controller connections() membaca dari secret storage', async () => {
    await db().pq(
      `INSERT INTO app_secrets (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
      ['aiConnections', JSON.stringify({ connections: [{ id: 'c1', name: 'utama', model: 'm', apiKey: 'sk-c1', active: true }] }), new Date().toISOString()],
    );
    const { AiController } = await import('../src/ai/ai.controller.ts');
    const ctl: any = new AiController();
    ctl.db = db();
    const list: any = await ctl.connections();
    assert.equal(list.length, 1);
    assert.equal(list[0].hasKey, true);
    assert.ok(!('apiKey' in list[0]) || !String(list[0].apiKey).includes('sk-c1'), 'daftar tanpa key utuh');
  });
});
