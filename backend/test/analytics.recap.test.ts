// Uji rekap 11 tab Report Summary: helper bersama, agregasi kasus, dan
// tabel pendukung. node:test + pg-mem; jangan menyentuh Postgres asli.
process.env.DATABASE_URL = '';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTables, db } from './helpers/pgmem.ts';
import { esc } from '../src/db/sql.ts';
import { AnalyticsService, VALID_TAG, billingOf, userOf } from '../src/analytics/analytics.service.ts';

async function addTables() {
  await db().execute(
    `CREATE TABLE IF NOT EXISTS case_tax (record_uuid TEXT PRIMARY KEY, ppn_mode TEXT, ppn_percent REAL, ppn_amount INTEGER, pph INTEGER DEFAULT 0, updated_by TEXT, updated_at TEXT)` as any,
  );
  for (const col of [
    'date_issue TEXT',
    'start_date TEXT',
    'finish_date TEXT',
    'charges INTEGER DEFAULT 0',
    'billing_status TEXT',
    'module TEXT',
    'sub_module TEXT',
    'issue TEXT',
    'pic_name TEXT',
    'assign_to TEXT',
    'status TEXT',
    'support_category TEXT',
    'support_type TEXT',
    'channel_ticket TEXT',
    'billing_category TEXT',
    'group_kpi TEXT',
  ]) {
    try {
      await db().execute(`ALTER TABLE assistance_records ADD COLUMN ${col}` as any);
    } catch {
      // kolom sudah ada (rerun)
    }
  }
}

async function seedCase(r: {
  uuid: string;
  no?: string;
  client: string;
  dateIssue: string;
  charges?: number;
  billing?: string;
  module?: string;
  subModule?: string;
  audit?: string;
  invoice?: string;
  assign?: string;
  status?: string;
  ppnMode?: string | null;
  ppnPercent?: number | null;
  ppnAmount?: number | null;
  paymentNote?: string | null;
}) {
  const no = r.no ?? r.uuid;
  await db().execute(
    `INSERT INTO assistance_records (record_uuid,no,client,date_issue,charges,billing_status,module,sub_module,issue,pic_name,assign_to,status,support_category,support_type,channel_ticket,billing_category,group_kpi)
     VALUES ('${esc(r.uuid)}','${esc(no)}','${esc(r.client)}','${esc(r.dateIssue)}',${r.charges ?? 0},'${esc(r.billing ?? '')}','${esc(r.module ?? '')}','${esc(r.subModule ?? '')}','issue','pic','${esc(r.assign ?? '')}','${esc(r.status ?? 'DONE')}','SERVICE','SUPPORT TYPE - C','WHATSAPP','SERVICE','• GENERAL REQUEST')
     ON CONFLICT (record_uuid) DO UPDATE SET client=EXCLUDED.client` as any,
  );
  await db().execute(
    `INSERT INTO audit_status (record_uuid,action,updated_at) VALUES ('${esc(r.uuid)}','${esc(r.audit ?? 'BELUM DIVALIDASI')}','x') ON CONFLICT (record_uuid) DO UPDATE SET action=EXCLUDED.action` as any,
  );
  await db().execute(
    `INSERT INTO invoice_status (record_uuid,status,updated_at,payment_note) VALUES ('${esc(r.uuid)}','${esc(r.invoice ?? 'MENUNGGU INVOICE')}','x',${r.paymentNote ? `'${esc(r.paymentNote)}'` : 'NULL'})
     ON CONFLICT (record_uuid) DO UPDATE SET status=EXCLUDED.status, payment_note=EXCLUDED.payment_note` as any,
  );
  await db().execute(
    `INSERT INTO case_tax (record_uuid,ppn_mode,ppn_percent,ppn_amount,pph,updated_at) VALUES ('${esc(r.uuid)}',${r.ppnMode ? `'${esc(r.ppnMode)}'` : 'NULL'},${r.ppnPercent ?? 'NULL'},${r.ppnAmount ?? 'NULL'},0,'x')
     ON CONFLICT (record_uuid) DO UPDATE SET ppn_mode=EXCLUDED.ppn_mode, ppn_percent=EXCLUDED.ppn_percent, ppn_amount=EXCLUDED.ppn_amount` as any,
  );
}

describe('analytics recap helpers', () => {
  before(async () => {
    setupTables();
    await addTables();
    await seedCase({ uuid: 'r-a', client: 'BRAND-A', dateIssue: '20261101' });
    await seedCase({ uuid: 'r-b', client: 'BRAND-B', dateIssue: '20261102' });
  });

  it('mengekspor helper normalisasi dan getRangeRows', async () => {
    const svc = new AnalyticsService();
    const rows = await svc.getRangeRows('2026-11-01', '2026-11-30');
    assert.equal(rows.length, 2);
    assert.equal(VALID_TAG, 'VALID - SIAP INVOICE');
    assert.equal(billingOf('ONCALL'), 'ON-CALL');
    assert.equal(billingOf(''), 'LAINNYA');
    assert.equal(userOf(' rama '), 'RAMA');
  });
});
