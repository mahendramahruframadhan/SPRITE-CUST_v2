import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, seedUser, db } from './helpers/pgmem.ts';
import { createSession } from '../src/auth/session.ts';
import { RolesController } from '../src/roles/roles.controller.ts';
import { ConfigController } from '../src/config/config.controller.ts';
import { CasesService } from '../src/cases/cases.service.ts';

const unique = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe('High security protections', () => {
  before(() => {
    setupTables();
  });

  it('activity log memakai actor session dan mengabaikan who dari client', async () => {
    const suffix = unique();
    const user = await seedUser('Support', `log-${suffix}@revota.id`);
    const token = await createSession(db(), user.id);
    const action = `activity-${suffix}`;
    const controller = new RolesController();
    await controller.addLog({ who: 'attacker', action }, { headers: { 'x-auth-token': token } });
    const result = await db().execute(`SELECT who FROM activity_logs WHERE action='${action}' LIMIT 1` as any);
    assert.equal((result.rows || result)[0]?.who, 'Support');
  });

  it('role non-Super Admin tidak dapat mengubah konfigurasi AI', async () => {
    const suffix = unique();
    const user = await seedUser('Admin CS', `ai-${suffix}@revota.id`);
    const token = await createSession(db(), user.id);
    const controller = new ConfigController();
    // Imp#2: /config generik tolak key AI untuk SEMUA role (403 AI_CONFIG_SEPARATED);
    // batasan Super Admin untuk endpoint khusus /config/ai diuji di
    // test/ai.config.separation.test.ts.
    await assert.rejects(
      () => controller.put({ key: 'aiConfig', config: { baseURL: 'https://attacker.example/v1' } }, { headers: { 'x-auth-token': token } }),
      (e: any) => e?.status === 403 && e?.response?.code === 'AI_CONFIG_SEPARATED',
    );
  });

  it('create kasus berhenti ketika append Google Sheets gagal', async () => {
    const service = new CasesService({ appendCase: async () => false } as any);
    (service as any).db = { execute: async () => ({ rows: [] }) };
    await assert.rejects(
      () => service.create({ client: 'Client', issue: 'Issue', dateIssue: '20260925' }),
      (e: any) => e?.status === 502 && e?.response?.code === 'SHEETS_WRITE_FAILED',
    );
  });
});
