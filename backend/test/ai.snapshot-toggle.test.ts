// Uji kill-switch "agentConfig" (design 2026-10-23 Task 6): entry agents
// id 'chatbot-cs' dengan enabled===false mematikan chat AI — TANPA kuota dan
// TANPA menyentuh provider. Key/konfigurasi hilang atau agen lain yang
// dimatikan → chat tetap aktif. Pengganti uji snapshot env AI_SNAPSHOT_ENABLED
// yang sudah tidak berlaku (snapshot dihapus, logika chat pindah ke ai.service).
// pg-mem (helpers) + fetch tiruan (pola ai.chat-loop.test.ts). Jalankan: npm test

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, db } from './helpers/pgmem.ts';
import { AiController } from '../src/ai/ai.controller.ts';

const SECRET_VALUE = JSON.stringify({
  connections: [
    {
      id: 'c1',
      name: 'utama',
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-uji-tidak-asli',
      active: true,
    },
  ],
});

const setAgentConfig = async (agents: any) => {
  await db().pq(`DELETE FROM app_config WHERE key=$1`, ['agentConfig']);
  if (agents !== undefined) {
    await db().pq(
      `INSERT INTO app_config (key,value,updated_at) VALUES ($1,$2,$3)`,
      ['agentConfig', JSON.stringify({ agents }), new Date().toISOString()],
    );
  }
};

let fetchCalls = 0;
const stubFetch = () => {
  fetchCalls = 0;
  (globalThis as any).fetch = async () => {
    fetchCalls++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'hai' } }] }) };
  };
};

describe('Kill-switch agentConfig (chatbot-cs disabled)', () => {
  const realFetch = (globalThis as any).fetch;

  before(async () => {
    setupTables();
    await db().pq(
      `INSERT INTO app_secrets (key,value,updated_at) VALUES ($1,$2,$3)`,
      ['aiConnections', SECRET_VALUE, new Date().toISOString()],
    );
  });

  beforeEach(async () => {
    await setAgentConfig(undefined);
  });

  afterEach(() => {
    (globalThis as any).fetch = realFetch;
  });

  it('app_config tanpa agentConfig → chat tetap jalan, fetch provider terpanggil', async () => {
    stubFetch();
    const ctl = new AiController();
    const r: any = await ctl.chat(
      { messages: [{ role: 'user', content: 'halo' }] },
      { user: { id: 'sw-1', email: 'sw1@revota.id' }, ip: '127.0.0.1' },
    );
    assert.equal(r?.ok, true, `chat harus jalan: ${JSON.stringify(r)}`);
    assert.ok(fetchCalls >= 1, 'fetch provider terpanggil');
  });

  it("agentConfig {agents:[{id:'chatbot-cs',enabled:false}]} → {ok:false}, fetch TIDAK terpanggil", async () => {
    await setAgentConfig([{ id: 'chatbot-cs', enabled: false }]);
    stubFetch();
    const ctl = new AiController();
    const r: any = await ctl.chat(
      { messages: [{ role: 'user', content: 'halo' }] },
      { user: { id: 'sw-2', email: 'sw2@revota.id' }, ip: '127.0.0.1' },
    );
    assert.equal(r?.ok, false, 'kill-switch harus mematikan chat');
    assert.equal(fetchCalls, 0, 'provider TIDAK boleh dihubungi saat disabled');
  });

  it("agentConfig {agents:[{id:'auto-reply',enabled:false}]} → chat jalan (agent lain tak berpengaruh)", async () => {
    await setAgentConfig([{ id: 'auto-reply', enabled: false }]);
    stubFetch();
    const ctl = new AiController();
    const r: any = await ctl.chat(
      { messages: [{ role: 'user', content: 'halo' }] },
      { user: { id: 'sw-3', email: 'sw3@revota.id' }, ip: '127.0.0.1' },
    );
    assert.equal(r?.ok, true, `chat harus tetap jalan: ${JSON.stringify(r)}`);
    assert.ok(fetchCalls >= 1, 'fetch provider terpanggil');
  });
});
