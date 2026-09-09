import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

const SHEET_ID = process.env.SHEET_ID || '1dJKS7iJ80iK2rV5Jd9D6ap3yATcaUOlj07IcJg74CuY';
// Nama tab data (opsional) — bila dikosongkan: coba 'Data', lalu tab pertama.
// Contoh: SHEET_DATA_TAB=Data September
const SHEET_DATA_TAB = (process.env.SHEET_DATA_TAB || '').trim();

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

  async readDataTab(): Promise<{ rows: any[]; tab: string; readRows: number; skippedRows: number }> {
    const empty = (tab = '') => ({ rows: [], tab, readRows: 0, skippedRows: 0 });
    if (this.mock) return empty();
    try {
      // Urutan: tab dari .env → tab 'Data' → tab pertama spreadsheet
      const candidates: string[] = [];
      if (SHEET_DATA_TAB) candidates.push(SHEET_DATA_TAB);
      candidates.push('Data');
      let range = '';
      let res: any = null;
      let lastErr: any = null;
      for (const tab of candidates) {
        try {
          range = `'${tab.replace(/'/g, "''")}'!A:ZZ`;
          res = await this.sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range,
          });
          this.logger.log(`Membaca tab '${tab}'`);
          break;
        } catch (e: any) {
          this.logger.warn(`Tab '${tab}' tidak terbaca (${e.message})`);
          lastErr = e;
        }
      }
      if (!res) {
        // Fallback terakhir: tab pertama spreadsheet
        const meta = await this.sheets.spreadsheets.get({
          spreadsheetId: SHEET_ID,
          fields: 'sheets.properties.title',
        });
        const title = meta.data.sheets?.[0]?.properties?.title;
        if (!title) throw lastErr || new Error('Tidak ada tab terbaca');
        range = `'${String(title).replace(/'/g, "''")}'!A:ZZ`;
        this.logger.log(`Membaca tab '${title}'`);
        res = await this.sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range,
        });
      }
      const rows: string[][] = res.data.values || [];
      if (rows.length < 2) {
        this.logger.warn(`Tab terbaca tapi kosong (hanya ${rows.length} baris)`);
        return { rows: [], tab: range, readRows: 0, skippedRows: 0 };
      }
      // Deteksi baris header otomatis (20 baris pertama): judul/kosong di atas dilewati.
      // Cocok longgar: "PIC. NAME" ~ picName, "DATE ISSUE" ~ dateIssue, dst.
      const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normCols = COLS.map((c) => norm(c));
      const scoreRow = (r: string[]) => {
        const cells = (r || []).map(norm);
        return normCols.filter((c) => cells.includes(c)).length;
      };
      let headerIdx = 0;
      let best = scoreRow(rows[0] || []);
      for (let i = 1; i < Math.min(rows.length, 20); i++) {
        const s = scoreRow(rows[i] || []);
        if (s > best) {
          best = s;
          headerIdx = i;
        }
      }
      if (best < 5) {
        this.logger.warn(`Header tak dikenali (cocok ${best}/${COLS.length}) — pakai baris pertama`);
        headerIdx = 0;
      }
      this.logger.log(`Header di baris ${headerIdx + 1}, cocok ${best}/${COLS.length} kolom`);
      const header = (rows[headerIdx] || []).map((h: string) => norm(h));
      const idx = (name: string) => header.findIndex((h: string) => h === norm(name));
      // map using header row, fallback to COLS order
      const mapped = rows.slice(headerIdx + 1).map((r) => {
        const obj: any = {};
        for (const col of COLS) {
          const i = idx(col) >= 0 ? idx(col) : COLS.indexOf(col);
          obj[col] = r[i] ?? '';
        }
        // normalize recordUuid (trim: spasi nyasar dari copy-paste bikin ID tak cocok)
        const rawUuid = obj.recordUuid || r[idx('recordUuid')] || '';
        obj.recordUuid = String(rawUuid).trim();
        obj.charges = Number(String(obj.charges).replace(/[^\d-]/g, '')) || 0;
        return obj;
      })
      // Buang baris sampah: gema header ("NO"/"DATE ISSUE") & recordUuid tak wajar
      .filter((o: any) => {
        if (!o.recordUuid) return false;
        const uuid = String(o.recordUuid).trim();
        if (uuid.length < 4 || uuid.includes(',') || /^(record[\s_-]*uuid|charges)$/i.test(uuid)) return false;
        if (String(o.no || '').trim().toLowerCase() === 'no') return false;
        if (String(o.dateIssue || '').trim().toLowerCase() === 'date issue') return false;
        return true;
      });
      this.logger.log(`Tab '${range}': ${rows.length - headerIdx - 1} baris mentah → ${mapped.length} valid (${rows.length - headerIdx - 1 - mapped.length} dilewati)`);
      return { rows: mapped, tab: range, readRows: rows.length - headerIdx - 1, skippedRows: rows.length - headerIdx - 1 - mapped.length };
    } catch (e) {
      this.logger.error('Sheets read failed', e);
      return { rows: [], tab: '', readRows: 0, skippedRows: 0 };
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
