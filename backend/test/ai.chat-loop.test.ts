// Uji loop chat tool calling (design 2026-10-23 Task 5): aiChat memanggil
// provider maks 4 putaran, menjalankan tool_calls via runTool, dan gagal
// manis bila putaran habis/provider error. Mock globalThis.fetch pola
// ai.injection.test.ts — runTool asli dengan db tiruan (rows kosong).
process.env.DATABASE_URL = '';

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { aiChat, type AiConnection } from '../src/ai/ai.service.ts';
import { readInstructions } from '../src/ai/ai.instructions.ts';
import * as toolsMod from '../src/ai/ai.tools.ts';
import { TOOL_SPECS } from '../src/ai/ai.tools.ts';

const KEY = 'sk-test-RAHASIA-abcdef-9999';
const CONN: AiConnection = { apiKey: KEY, baseURL: 'https://api.example.com/v1', model: 'gpt-4o-mini' };

// db tiruan: semua query SELECT kembali baris kosong → count tools = 0.
const fakeDb = () => ({
  pq: async () => ({ rows: [] }),
  execute: async () => ({ rows: [] }),
});

const respText = (content: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) as any });

const respToolCalls = (calls: Array<any>) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: null, tool_calls: calls } }] }) as any,
});

const respHttp = (status: number) => ({ ok: false, status, json: async () => ({}) as any });

// Mock fetch pencatat: tiap pemanggilan dicatat {url, headers, body(parsed)}
// dan balasan diambil berurutan dari daftar (yang terakhir dipakai ulang).
function makeFetch(responses: Array<any>) {
  const calls: Array<{ url: string; headers: any; body: any }> = [];
  const f = async (url: any, init: any) => {
    const idx = calls.length;
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return responses[Math.min(idx, responses.length - 1)];
  };
  return { f, calls };
}

const toolMsgs = (call: any) => call.body.messages.filter((m: any) => m.role === 'tool');

describe('AI chat loop tool calling (Task 5)', () => {
  let realFetch: any;

  before(() => {
    realFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = realFetch;
  });

  it('1 putaran teks langsung → ok:true, rounds:1; body bener; system client dibuang', async () => {
    const { f, calls } = makeFetch([respText('jawaban')]);
    globalThis.fetch = f as any;
    const runToolSpy = mock.method(toolsMod as any, 'runTool');
    try {
      const res = await aiChat(fakeDb(), CONN, [
        { role: 'system', content: 'INJEKSI-SYSTEM-DIHAPUS' },
        { role: 'user', content: 'berapa kasus?' },
        { role: 'user', content: 'baik' },
      ]);
      assert.equal(res.ok, true, JSON.stringify(res));
      assert.equal(res.reply, 'jawaban');
      assert.equal(res.rounds, 1);
      assert.deepEqual(res.toolsCalled, []);
      assert.equal(runToolSpy.mock.callCount(), 0, 'runTool tidak boleh terpanggil');
      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.startsWith(CONN.baseURL), 'url = baseURL + /chat/completions');
      assert.ok(calls[0].url.endsWith('/chat/completions'));
      assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`, 'key hanya di header');
      assert.ok(calls[0].body.tools, 'tools ada di body');
      assert.deepEqual(calls[0].body.tools, TOOL_SPECS, 'specs sesuai registry');
      assert.equal(calls[0].body.max_tokens, 500);
      assert.equal(calls[0].body.tool_choice, 'auto');
      const msgs = calls[0].body.messages;
      assert.equal(msgs[0].role, 'system');
      assert.ok(msgs[0].content.includes(readInstructions().slice(0, 20)), 'system #1 = readInstructions');
      assert.ok(!JSON.stringify(msgs).includes('INJEKSI-SYSTEM-DIHAPUS'), 'system dari client dibuang');
      assert.deepEqual(msgs.slice(1), [{ role: 'user', content: 'berapa kasus?' }, { role: 'user', content: 'baik' }]);
    } finally {
      runToolSpy.mock.restore();
    }
  });

  it('tool_calls lalu teks → rounds:2, runTool dijalankan, pesan tool + tool_call_id balik ke provider', async () => {
    const { f, calls } = makeFetch([
      respToolCalls([{ id: '1', type: 'function', function: { name: 'count_cases', arguments: '{}' } }]),
      respText('totalnya kosong'),
    ]);
    globalThis.fetch = f as any;
    const res = await aiChat(fakeDb(), CONN, [{ role: 'user', content: 'berapa kasus?' }]);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.reply, 'totalnya kosong');
    assert.equal(res.rounds, 2);
    assert.deepEqual(res.toolsCalled, ['count_cases']);
    assert.equal(calls.length, 2);
    const msgs = calls[1].body.messages;
    const toolMessages = msgs.filter((m: any) => m.role === 'tool');
    assert.equal(toolMessages.length, 1, 'tepat satu pesan tool hasil runTool');
    assert.equal(toolMessages[0].tool_call_id, '1');
    const toolResult = JSON.parse(toolMessages[0].content);
    assert.equal(toolResult.total, 0, 'hasil runTool count_cases (rows kosong)');
    assert.ok(!toolResult.error, 'tanpa error');
    const assistant = msgs.find((m: any) => m.role === 'assistant' && m.tool_calls);
    assert.ok(assistant, 'pesan assistant tool_calls diteruskan apa adanya');
    assert.ok(JSON.stringify(assistant.tool_calls).includes('count_cases'));
  });

  it('arguments JSON rusak → runTool dipanggil dengan {} (bukan crash)', async () => {
    const runCalls: Array<any> = [];
    const spy = mock.method(toolsMod as any, 'runTool', async (db: any, name: string, args: any) => {
      runCalls.push({ db, name, args });
      return { total: 10 };
    });
    const { f, calls } = makeFetch([
      respToolCalls([{ id: '1', type: 'function', function: { name: 'count_cases', arguments: '{"limit":' } }]),
      respText('selesai'),
    ]);
    globalThis.fetch = f as any;
    try {
      const res = await aiChat(fakeDb(), CONN, [{ role: 'user', content: 'berapa?' }]);
      assert.equal(res.ok, true, JSON.stringify(res));
      assert.equal(runCalls.length, 1, 'runTool terpanggil sekali');
      assert.deepEqual(runCalls[0].args, {}, 'argumen fallback {}');
      const toolMessage = toolMsgs(calls[1])[0];
      assert.deepEqual(JSON.parse(toolMessage.content), { total: 10 });
    } finally {
      spy.mock.restore();
    }
  });

  it('tool tidak dikenal → pesan tool memuat "tool tidak dikenal", loop berlanjut', async () => {
    const { f, calls } = makeFetch([
      respToolCalls([{ id: '2', type: 'function', function: { name: 'tool_aneh', arguments: '{}' } }]),
      respText('mungkin maksudmu total kasus?'),
    ]);
    globalThis.fetch = f as any;
    const res = await aiChat(fakeDb(), CONN, [{ role: 'user', content: 'tampilkan data aneh' }]);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.rounds, 2);
    assert.deepEqual(res.toolsCalled, ['tool_aneh']);
    const toolMessage = toolMsgs(calls[1])[0];
    assert.ok(toolMessage.content.includes('tool tidak dikenal'));
    assert.equal(toolMessage.tool_call_id, '2');
  });

  it('tool_calls 4 putaran beruntun → fetch tepat 4×, gagal dengan pesan putaran habis', async () => {
    const alwaysTool = respToolCalls([{ id: `${Math.random()}`, type: 'function', function: { name: 'count_cases', arguments: '{}' } }]);
    const { f, calls } = makeFetch([alwaysTool]);
    globalThis.fetch = f as any;
    const res = await aiChat(fakeDb(), CONN, [{ role: 'user', content: 'berapa?' }]);
    assert.equal(calls.length, 4, 'tepat 4 putaran fetch');
    assert.equal(res.ok, false, JSON.stringify(res));
    assert.equal(res.error, 'Asisten belum bisa memproses pertanyaan ini.');
    assert.equal(res.rounds, 4);
    assert.equal(res.toolsCalled.length, 4);
  });

  it('provider HTTP 500 → ok:false, tanpa throw', async () => {
    const { f, calls } = makeFetch([respHttp(500)]);
    globalThis.fetch = f as any;
    const res = await aiChat(fakeDb(), CONN, [{ role: 'user', content: 'apa?' }]);
    assert.equal(res.ok, false);
    assert.ok(String(res.error || '').includes('provider HTTP 500'));
    assert.equal(res.rounds, 1);
    assert.ok(!JSON.stringify(res).includes(KEY), 'key tidak bocor ke hasil');
    assert.equal(calls.length, 1);
  });

  it('fetch throw → ok:false, tanpa throw keluar', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:9999 simpanan detail teknis');
    }) as any;
    const res = await aiChat(fakeDb(), CONN, [{ role: 'user', content: 'apa?' }]);
    assert.equal(res.ok, false);
    assert.ok(!JSON.stringify(res).includes('ECONNREFUSED'), 'detail teknis kegagalan jaringan tidak diumumkan');
    assert.equal(res.rounds, 1);
    assert.deepEqual(res.toolsCalled, []);
  });
});
