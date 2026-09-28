// Uji H8: snapshot data bisnis yang dikirim ke provider AI eksternal harus
// bisa dimatikan via AI_SNAPSHOT_ENABLED=false. Default tetap nyala (fitur
// "berapa on call bulan X" butuh angka), tapi data-owner punya kill-switch
// tanpa deploy ulang.
// node:test + stub db/fetch (tanpa provider AI asli). Jalankan: npm test
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AiController } from '../src/ai/ai.controller.ts';

const CONN_VALUE = JSON.stringify({
  connections: [
    {
      id: 'c1',
      name: 'utama',
      provider: 'openai',
      model: 'gpt-4o-mini',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-uji-tidak-asli',
      active: true,
    },
  ],
});

const stubDb = () => ({
  execute: async (q: string) => {
    if (typeof q === 'string' && q.includes(`key='aiConnections'`)) {
      return { rows: [{ value: CONN_VALUE }] };
    }
    if (typeof q === 'string' && q.includes('FROM assistance_records')) {
      return { rows: [{ c: 1 }] };
    }
    if (typeof q === 'string' && q.includes('GROUP BY')) {
      return { rows: [] };
    }
    if (typeof q === 'string' && q.includes('SUM(charges)')) {
      return { rows: [{ s: 0 }] };
    }
    return { rows: [] };
  },
});

let lastBody: any = null;
const stubFetch = () => {
  lastBody = null;
  (globalThis as any).fetch = async (_url: string, opts: any) => {
    lastBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'hai' } }] }) };
  };
};

describe('H8 — kill-switch snapshot AI', () => {
  const savedFetch = (globalThis as any).fetch;
  const savedFlag = process.env.AI_SNAPSHOT_ENABLED;
  afterEach(() => {
    (globalThis as any).fetch = savedFetch;
    if (savedFlag === undefined) delete process.env.AI_SNAPSHOT_ENABLED;
    else process.env.AI_SNAPSHOT_ENABLED = savedFlag;
  });

  it('default: snapshot data ikut terkirim ke provider', async () => {
    delete process.env.AI_SNAPSHOT_ENABLED;
    stubFetch();
    const ctl = new AiController();
    (ctl as any).db = stubDb();
    const r: any = await ctl.chat(
      { messages: [{ role: 'user', content: 'halo' }] },
      { user: { id: 'u1' }, ip: '127.0.0.1' },
    );
    assert.equal(r?.ok, true);
    const sys = lastBody.messages.find((m: any) => m.role === 'system')?.content || '';
    assert.ok(sys.includes('SNAPSHOT DATA:'), 'snapshot harus ada secara default');
  });

  it("AI_SNAPSHOT_ENABLED=false: tidak ada angka/nama bisnis yang keluar", async () => {
    process.env.AI_SNAPSHOT_ENABLED = 'false';
    stubFetch();
    const ctl = new AiController();
    (ctl as any).db = stubDb();
    const r: any = await ctl.chat(
      { messages: [{ role: 'user', content: 'halo' }] },
      { user: { id: 'u1' }, ip: '127.0.0.1' },
    );
    assert.equal(r?.ok, true);
    const sys = lastBody.messages.find((m: any) => m.role === 'system')?.content || '';
    assert.ok(!sys.includes('Data saat ini:'), 'baris snapshot tidak boleh terkirim');
    assert.ok(sys.includes('KNOWLEDGE BASE:'), 'knowledge base statis tetap boleh');
  });
});
