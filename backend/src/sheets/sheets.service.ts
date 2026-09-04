import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

const SHEET_ID = process.env.SHEET_ID || '1dJKS7iJ80iK2rV5Jd9D6ap3yATcaUOlj07IcJg74CuY';

// Header mapping mirrors SheetConfigPage.jsx headerMapping — column order = Col No
// ponytail: hardcode minimal mapping for data tab; full 25 col mapping loaded from sheetConfig when available
const COLS = ['no','dateIssue','startDate','finishDate','client','picName','module','subModule','location','issue','assignTo','status','supportCategory','billingStatus','billingCategory','refPriceList','channelTicket','supportType','charges','completionNotes','groupKpi','groupKpiDesc','month','weeknum','recordUuid'];

@Injectable()
export class SheetsService {
  private logger = new Logger(SheetsService.name);
  private sheets: any = null;
  private mock = process.env.SHEETS_MOCK === 'true' || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  constructor() {
    if (!this.mock) {
      try {
        const jsonStr = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!, 'base64').toString('utf8');
        const creds = JSON.parse(jsonStr);
        const auth = new google.auth.JWT({
          email: creds.client_email,
          key: creds.private_key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.sheets = google.sheets({ version: 'v4', auth });
        this.logger.log('Sheets JWT auth ready');
      } catch (e) {
        this.logger.warn('Sheets JWT init failed, fallback to mock: ' + e);
        this.mock = true;
      }
    } else {
      this.logger.log('Sheets MOCK mode — reads from DB/seed, writes echo to sync_logs');
    }
  }

  isMock() { return this.mock; }

  async readDataTab(): Promise<any[]> {
    if (this.mock) return [];
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Data!A:ZZ', // gid 1535609154 tab usually named Data
      });
      const rows: string[][] = res.data.values || [];
      if (rows.length < 2) return [];
      const header = rows[0].map((h: string) => h.trim());
      const idx = (name: string) => header.findIndex((h: string) => h.toLowerCase() === name.toLowerCase());
      // map using header row, fallback to COLS order
      return rows.slice(1).map((r) => {
        const obj: any = {};
        for (const col of COLS) {
          const i = idx(col) >= 0 ? idx(col) : COLS.indexOf(col);
          obj[col] = r[i] ?? '';
        }
        // normalize recordUuid
        obj.recordUuid = obj.recordUuid || r[idx('recordUuid')] || '';
        obj.charges = Number(String(obj.charges).replace(/[^\d-]/g, '')) || 0;
        return obj;
      }).filter((o: any) => o.recordUuid);
    } catch (e) {
      this.logger.error('Sheets read failed', e);
      return [];
    }
  }

  async appendCase(row: any): Promise<boolean> {
    if (this.mock) {
      this.logger.log(`[MOCK] appendCase ${row.recordUuid} — echo only, will be upserted to DB by sync`);
      return true;
    }
    try {
      const values = [COLS.map((c) => row[c] ?? '')];
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Data!A:ZZ',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
      return true;
    } catch (e) {
      this.logger.error('Sheets append failed', e);
      return false;
    }
  }
}
