import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';

const esc = (v: any) => String(v ?? '').replace(/'/g, "''");
export const maskKey = (k: string) => (!k ? '' : k.length <= 4 ? '••••' : `••••${k.slice(-4)}`);

// Konfigurasi SPRITE AI — asisten resmi project SPRITE-CUST_v2 (diatur pemilik,
// abaikan bila sudah diimplementasikan). Aturan: HANYA jawab seputar project
// (Frontend, Backend, Database, arsitektur, fitur, setup, troubleshooting, code,
// dokumentasi); di luar itu tolak sopan dengan templat di bawah.
const SYSTEM_PROMPT = `Nama: SPRITE AI. Peran: Technical Assistant khusus project SPRITE-CUST_v2.
Bahasa: Indonesia, jelas, profesional, to the point. Sebutkan konteksnya (Frontend/Backend/Database).

ATURAN WAJIB:
1. HANYA jawab yang berkaitan dengan project ini. Di luar project (berita, cuaca,
coding umum, teknologi lain, curhat, pertanyaan umum) WAJIB tolak sopan dan arahkan
kembali, mis: "Maaf, saya hanya bisa membantu hal-hal yang berkaitan dengan project
SPRITE-CUST_v2. Ada yang ingin ditanyakan seputar Frontend, Backend, atau Database project ini?"
atau: "Pertanyaan tersebut di luar cakupan saya. Saya fokus membantu seputar project
SPRITE-CUST_v2 saja. Silakan tanyakan tentang React, NestJS, atau PostgreSQL di project ini."
2. Jangan bahas/opini topik luar project. Jika ambigu, minta klarifikasi dulu.
3. Jawab dari knowledge base project di bawah + snapshot data. Jika tak ada di
dokumentasi: "Saya tidak menemukan informasi tersebut di dokumentasi project saat ini."
Jangan mengarang.
4. Beri contoh kode relevan bila perlu (React+Vite, NestJS, PostgreSQL, raw SQL).`;

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

    // Konteks ringkas data agar AI bisa jawab soal kasus (3 query cepat)
    let snapshot = '';
    try {
      const t: any = await this.db.execute(`SELECT COUNT(*) as c FROM assistance_records` as any);
      const s: any = await this.db.execute(`SELECT status, COUNT(*) as c FROM assistance_records GROUP BY status` as any);
      const ch: any = await this.db.execute(`SELECT SUM(charges) as s FROM assistance_records` as any);
      const byStatus = ((s.rows || s) as any[]).map((r: any) => `${r.status || '?'}: ${r.c}`).join(', ');
      snapshot = `Data saat ini: total ${(t.rows || t)[0]?.c || 0} kasus (${byStatus}), total tagihan Rp ${Number((ch.rows || ch)[0]?.s || 0).toLocaleString('id-ID')}.`;
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
