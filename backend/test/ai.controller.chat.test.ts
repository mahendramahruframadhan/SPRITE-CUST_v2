// Uji endpoint POST /ai/chat baru (design 2026-10-23 Task 6): chat via loop
// tool calling (aiChat) + log activity `ai_chat` berstatus ok/error/disabled —
// log memuat rounds/tools tetapi TIDAK PERNAH isi pesan user. Provider gagal
// tetap {ok:false} tanpa lempar; kill-switch mematikan tanpa kuota & provider.
// pg-mem (helpers) + fetch tiruan. Jalankan: npm test

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

const lastAiChatLogs = async () => {
  const r: any = await db().pq(
    `SELECT who, action, category, detail FROM activity_logs WHERE action='ai_chat' AND category='ai' ORDER BY created_at DESC`,
    [],
  );
  return r.rows || [];
};

const reqs = (id: string, email: string) => ({ user: { id, email }, ip: '127.0.0.1' });

describe('POST /ai/chat — log ai_chat + alur baru', () => {
  const realFetch = (globalThis as any).fetch;

  before(async () => {
    setupTables();
    await db().pq(
      `INSERT INTO app_secrets (key,value,updated_at) VALUES ($1,$2,$3)`,
      ['aiConnections', SECRET_VALUE, new Date().toISOString()],
    );
  });

  afterEach(() => {
    (globalThis as any).fetch = realFetch;
  });

  it('chat OK → log detail status=ok + rounds=, TANPA isi pesan user', async () => {
    await db().pq(`DELETE FROM activity_logs`, []);
    (globalThis as any).fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'jawaban aman' } }] }),
    });
    const ctl = new AiController();
    const r: any = await ctl.chat(
      { messages: [{ role: 'user', content: 'berapa kasus' }] },
      reqs('ctl-1', 'cs.a@revota.id'),
    );
    assert.equal(r?.ok, true, JSON.stringify(r));
    const logs = await lastAiChatLogs();
    assert.ok(logs.length >= 1, 'harus ada baris log ai_chat');
    const detail = String(logs[0].detail);
    assert.ok(detail.includes('status=ok'), `detail memuat status=ok: ${detail}`);
    assert.ok(detail.includes('rounds='), `detail memuat rounds=: ${detail}`);
    assert.ok(!detail.includes('berapa kasus'), 'detail TIDAK boleh memuat isi pesan user');
  });

  it('provider gagal (HTTP 500) → log status=error, response {ok:false} tanpa lempar', async () => {
    await db().pq(`DELETE FROM activity_logs`, []);
    (globalThis as any).fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const ctl = new AiController();
    const r: any = await ctl.chat(
      { messages: [{ role: 'user', content: 'cek billing' }] },
      reqs('ctl-2', 'cs.b@revota.id'),
    );
    assert.equal(r?.ok, false, 'response {ok:false}');
    const logs = await lastAiChatLogs();
    assert.ok(logs.length >= 1, 'harus ada baris log ai_chat');
    assert.ok(String(logs[0].detail).includes('status=error'), 'detail memuat status=error');
  });

  it('kill-switch aktif → log status=disabled, fetch & log kuota tidak jalan', async () => {
    await db().pq(`DELETE FROM activity_logs`, []);
    await db().pq(
      `INSERT INTO app_config (key,value,updated_at) VALUES ($1,$2,$3)`,
      ['agentConfig', JSON.stringify({ agents: [{ id: 'chatbot-cs', enabled: false }] }), new Date().toISOString()],
    );
    let called = 0;
    (globalThis as any).fetch = async () => { called++; return { ok: true, json: async () => ({}) } as any; };
    const ctl = new AiController();
    const r: any = await ctl.chat(
      { messages: [{ role: 'user', content: 'halo' }] },
      reqs('ctl-3', 'cs.c@revota.id'),
    );
    assert.equal(r?.ok, false, 'chat dimatikan kill-switch');
    assert.equal(called, 0, 'provider tidak dihubungi');
    const logs = await lastAiChatLogs();
    assert.ok(logs.length >= 1, 'harus ada baris log ai_chat');
    assert.ok(String(logs[0].detail).includes('status=disabled'), 'detail memuat status=disabled');
  });
});
