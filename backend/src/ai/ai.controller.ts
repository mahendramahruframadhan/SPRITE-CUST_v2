import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';

const esc = (v: any) => String(v ?? '').replace(/'/g, "''");
export const maskKey = (k: string) => (!k ? '' : k.length <= 4 ? '••••' : `••••${k.slice(-4)}`);

// Konfigurasi SPRITE AI — asisten resmi project SPRITE-CUST_v2 (diatur pemilik,
// abaikan bila sudah diimplementasikan). Aturan: HANYA jawab seputar project
// (Frontend, Backend, Database, arsitektur, fitur, setup, troubleshooting, code,
// dokumentasi); di luar itu tolak sopan dengan templat di bawah.
const SYSTEM_PROMPT = `Nama: SPRITE AI. Peran: Asisten data project SPRITE-CUST_v2.
GAYA KOMUNIKASI: Bahasa Indonesia natural, ringkas, to the point. JANGAN
bahasa teknis kecuali user eksplisit minta. Jawaban harus mudah dipahami
non-teknis; sebut modul saja (Kasus, Billing, Finance, HR, Roles, Konfig)
tanpa kata SQL/kode/ORM. Tidak perlu jelaskan cara kerja kecuali diminta.

ATURAN WAJIB:
1. HANYA jawab yang berkaitan dengan project ini. Di luar project (berita, cuaca,
coding umum, teknologi lain, curhat, pertanyaan umum) tolak sopan, mis: "Maaf,
saya hanya bisa membantu seputar project SPRITE-CUST_v2. Ada yang ingin
ditanyakan soal data kasus, billing, finance, HR, atau konfigurasi?"
2. Jawab dari knowledge base + snapshot data. Jika tak ada di dokumentasi/
snapshot: jujur sampaikan datanya belum tersedia + tawarkan alternatif terdekat
(mis. total all-time, atau data bulan berjalan). Jangan mengarang.
3. Bila user tanya angka/jumlah → prioritaskan memberikan angka dulu, baru
penjelasan singkat.
4. Kalau data detail per bulan tertentu belum ada di snapshot, sebutkan
data yang tersedia + minta filter langsung di halaman terkait.
5. JANGAN beri query SQL/kode/penjelasan teknis kecuali user eksplisit minta
("kode-nya"/"cara query"/"gimana hitung di database").
6. Sesudah jawab boleh tawarkan lanjutan yang berguna, mis. "Mau saya breakdown
per bulan?", "Mau top client-nya?", "Mau cek status audit-nya?".

CONTOH JAWABAN:
User: "berapa on call bulan Agustus?"
Jawaban: "Total ON-CALL bulan Agustus 2026 adalah 8 kasus (dari 145 kasus
Agustus). Detail bisa difilter di menu Kasus periode 01-08-2026 s.d. 31-08-2026."
BUKAN bahasa teknis seperti "SELECT COUNT(*) FROM assistance_records WHERE
billing_status='ON-CALL' AND date_issue LIKE '202608%'".`;

// Knowledge base ringkas project (sumber kebenaran untuk jawaban AI).
const PROJECT_KB = `STACK: Frontend React 18 + Vite 5 + Tailwind (port 5173, proxy /api), Backend NestJS 10 + Drizzle ORM (port 5005, prefix /api), DB Postgres 16 Docker (db sprite_cust).
HALAMAN: /login, /signup, /dashboard, /kasus (data+filter+CSV), /mockup, /form (POST /api/cases), /hrreport, /cfg (GET/PUT /api/config + toggle AI), /billing (PATCH audit), /finance (PATCH invoice), /roles (CRUD user, matriks izin, log).
ROLE: Super Admin (semua akses, dikunci) | Admin CS | Support | Finance | Viewer. Matriks di tabel role_permissions, diatur di /roles.
TABEL DB: assistance_records (2034 seed), user/account/session/verification, audit_status, invoice_status, sync_logs, app_config (sheetConfig, agentConfig, aiConfig), role_permissions, activity_logs.
AKUN: rani/budi/sari/finance/vina/admin @revota.id (password awal password123, admin & finance 12345).
MODE: SHEETS_MOCK=true (tanpa Google API); sync manual POST /api/sync/trigger.`;

// Proxy chat ke AI eksternal (OpenAI-compatible). Key hanya di server (DB app_config
// key 'aiConfig') — browser tak pernah pegang key. GET config selalu ter-mask.
@Controller('ai')
export class AiController {
  private db: any = getDb();

  private async loadConfig() {
    try {
      const r: any = await this.db.execute(`SELECT value FROM app_config WHERE key='aiConfig'` as any);
      const row = (r.rows || r)[0];
      return row?.value ? JSON.parse(row.value) : {};
    } catch {
      return {};
    }
  }

  // Pilih koneksi: id eksplisit dari switcher chat → active → legacy aiConfig.
  private async pickConnection(connectionId: any) {
    const id = String(connectionId || '').trim();
    if (id) {
      try {
        const r: any = await this.db.execute(`SELECT value FROM app_config WHERE key='aiConnections'` as any);
        const row = (r.rows || r)[0];
        const list = row?.value ? JSON.parse(row.value)?.connections : null;
        if (Array.isArray(list)) {
          const hit = list.find((c: any) => c && c.id === id && c.apiKey && !String(c.apiKey).startsWith('••••'));
          if (hit) return hit;
        }
      } catch {}
    }
    return this.loadActive();
  }

  // Koneksi aktif: item active di aiConnections; fallback aiConfig lama (migrasi otomatis FE).
  private async loadActive() {
    try {
      const r: any = await this.db.execute(`SELECT value FROM app_config WHERE key='aiConnections'` as any);
      const row = (r.rows || r)[0];
      const list = row?.value ? JSON.parse(row.value)?.connections : null;
      if (Array.isArray(list)) {
        const hit = list.find((c: any) => c && c.active && c.apiKey && !String(c.apiKey).startsWith('••••'));
        if (hit) return hit;
      }
    } catch {}
    const legacy = await this.loadConfig();
    const apiKey = String(legacy.apiKey || '');
    if (apiKey && !apiKey.startsWith('••••')) return legacy;
    return null;
  }

  // Daftar koneksi untuk switcher model (tanpa key!) — user login mana pun boleh lihat.
  @Get('connections')
  async connections(@Headers('x-user-email') email: string) {
    const who = String(email || '').toLowerCase().trim();
    if (!who) return [];
    try {
      const r: any = await this.db.execute(`SELECT value FROM app_config WHERE key='aiConnections'` as any);
      const row = (r.rows || r)[0];
      const list = row?.value ? JSON.parse(row.value)?.connections : null;
      if (!Array.isArray(list)) return [];
      return list
        .filter((c: any) => c && c.id && c.name)
        .map((c: any) => ({ id: c.id, name: c.name, provider: c.provider || '', model: c.model || '', active: !!c.active, hasKey: !!c.apiKey }));
    } catch {
      return [];
    }
  }

  @Post('chat')
  async chat(@Body() body: any, @Headers('x-user-email') email: string) {
    const who = String(email || '').toLowerCase().trim();
    if (!who) return { ok: false, error: 'login dulu' };
    const u: any = await this.db.execute(`SELECT active FROM "user" WHERE lower(email)='${esc(who)}' LIMIT 1` as any);
    const row = (u.rows || u)[0];
    if (!row || !Number(row.active ?? 1)) return { ok: false, error: 'akun tidak dikenal/dinonaktifkan' };

    const cfg = await this.pickConnection(body.connectionId);
    const apiKey = String(cfg?.apiKey || '');
    if (!cfg || !apiKey) {
      return { ok: false, error: 'Tidak ada AI aktif — daftarkan & aktifkan di /roles → AI & API Key' };
    }
    const baseURL = String(cfg.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = String(cfg.model || 'gpt-4o-mini');
    const msgs = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    if (!msgs.length) return { ok: false, error: 'messages kosong' };

    // Konteks ringkas data agar AI bisa jawab soal kasus & tagihan (query cepat)
    let snapshot = '';
    try {
      const now = new Date();
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prevYm = (() => {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();
      const rp = (n: any) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
      const num = (n: any) => Number(n || 0).toLocaleString('id-ID');

      const t: any = await this.db.execute(`SELECT COUNT(*) as c FROM assistance_records` as any);
      const s: any = await this.db.execute(`SELECT status, COUNT(*) as c FROM assistance_records GROUP BY status` as any);
      const ch: any = await this.db.execute(`SELECT SUM(charges) as s FROM assistance_records` as any);
      const done: any = await this.db.execute(`SELECT COUNT(*) as c, COALESCE(SUM(charges),0) as s FROM assistance_records WHERE status='DONE'` as any);
      const mth: any = await this.db.execute(`SELECT COUNT(*) as c, COALESCE(SUM(charges),0) as s FROM assistance_records WHERE date_issue LIKE '${ym}%'` as any);
      const prev: any = await this.db.execute(`SELECT COUNT(*) as c, COALESCE(SUM(charges),0) as s FROM assistance_records WHERE date_issue LIKE '${prevYm}%'` as any);

      // Billing all-time + bulan ini + bulan lalu
      const bill: any = await this.db.execute(`SELECT billing_status as b, COUNT(*) as c, COALESCE(SUM(charges),0) as s FROM assistance_records GROUP BY billing_status` as any);
      const billMth: any = await this.db.execute(`SELECT billing_status as b, COUNT(*) as c, COALESCE(SUM(charges),0) as s FROM assistance_records WHERE date_issue LIKE '${ym}%' GROUP BY billing_status` as any);
      const billPrev: any = await this.db.execute(`SELECT billing_status as b, COUNT(*) as c, COALESCE(SUM(charges),0) as s FROM assistance_records WHERE date_issue LIKE '${prevYm}%' GROUP BY billing_status` as any);

      // Top client & modul all-time
      const topClient: any = await this.db.execute(`SELECT client, COUNT(*) as c FROM assistance_records GROUP BY client ORDER BY c DESC LIMIT 5` as any);
      const topModule: any = await this.db.execute(`SELECT module, COUNT(*) as c FROM assistance_records GROUP BY module ORDER BY c DESC LIMIT 5` as any);

      // Audit & invoice
      const audit: any = await this.db.execute(`SELECT action, COUNT(*) as c FROM audit_status GROUP BY action ORDER BY c DESC` as any);
      const invoice: any = await this.db.execute(`SELECT status, COUNT(*) as c FROM invoice_status GROUP BY status ORDER BY c DESC` as any);

      // HR / kategori support
      const kpi: any = await this.db.execute(`SELECT support_category as k, COUNT(*) as c FROM assistance_records GROUP BY support_category ORDER BY c DESC LIMIT 5` as any);
      const supportType: any = await this.db.execute(`SELECT support_type as t, COUNT(*) as c FROM assistance_records GROUP BY support_type ORDER BY c DESC LIMIT 5` as any);

      const byStatus = ((s.rows || s) as any[]).map((r: any) => `${r.status || '?'}: ${num(r.c)}`).join(', ');
      const dRow = (done.rows || done)[0] || {};
      const mRow = (mth.rows || mth)[0] || {};
      const pRow = (prev.rows || prev)[0] || {};
      const fmtBill = (arr: any[]) => ((arr || []) as any[]).map((r: any) => `${r.b || '?'}: ${num(r.c)} (${rp(r.s)})`).join(', ') || '—';
      const fmtSimple = (arr: any[], label: string) => ((arr || []) as any[]).map((r: any) => `${r[label] || '?'}: ${num(r.c)}`).join(', ') || '—';

      snapshot = [
        `Data saat ini: total ${num((t.rows || t)[0]?.c)} kasus (${byStatus}), total tagihan all-time ${rp((ch.rows || ch)[0]?.s)}.`,
        `Kasus DONE: ${num(dRow.c)} (tagihan ${rp(dRow.s)}).`,
        `Bulan berjalan (${ym}): ${num(mRow.c)} kasus, tagihan ${rp(mRow.s)}. Bulan lalu (${prevYm}): ${num(pRow.c)} kasus, tagihan ${rp(pRow.s)}.`,
        `Billing all-time: ${fmtBill(bill.rows || bill)}. Bulan ini: ${fmtBill(billMth.rows || billMth)}. Bulan lalu: ${fmtBill(billPrev.rows || billPrev)}.`,
        `Top 5 client: ${fmtSimple(topClient.rows || topClient, 'client')}. Top 5 modul: ${fmtSimple(topModule.rows || topModule, 'module')}.`,
        `Status audit: ${fmtSimple(audit.rows || audit, 'action')}. Status invoice: ${fmtSimple(invoice.rows || invoice, 'status')}.`,
        `Kategori support (HR): ${fmtSimple(kpi.rows || kpi, 'k')}. Jenis support: ${fmtSimple(supportType.rows || supportType, 't')}.`,
      ].join('\n');
    } catch {}

    try {
      const r = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: `${SYSTEM_PROMPT}\n\nKNOWLEDGE BASE:\n${PROJECT_KB}\n\nSNAPSHOT DATA:\n${snapshot}` },
            ...msgs.filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
          ],
        }),
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j?.error?.message || `provider HTTP ${r.status}` };
      const reply = j?.choices?.[0]?.message?.content?.trim();
      if (!reply) return { ok: false, error: 'provider tidak mengembalikan jawaban' };
      return { ok: true, reply };
    } catch (e: any) {
      return { ok: false, error: `gagal hubungi AI: ${e.message || e}` };
    }
  }
}
