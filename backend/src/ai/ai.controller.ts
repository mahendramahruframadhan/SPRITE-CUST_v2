import { Controller, Post, Body, Headers } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';

const esc = (v: any) => String(v ?? '').replace(/'/g, "''");
export const maskKey = (k: string) => (!k ? '' : k.length <= 4 ? '••••' : `••••${k.slice(-4)}`);

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

  @Post('chat')
  async chat(@Body() body: any, @Headers('x-user-email') email: string) {
    const who = String(email || '').toLowerCase().trim();
    if (!who) return { ok: false, error: 'login dulu' };
    const u: any = await this.db.execute(`SELECT active FROM "user" WHERE lower(email)='${esc(who)}' LIMIT 1` as any);
    const row = (u.rows || u)[0];
    if (!row || !Number(row.active ?? 1)) return { ok: false, error: 'akun tidak dikenal/dinonaktifkan' };

    const cfg = await this.loadConfig();
    const apiKey = String(cfg.apiKey || '');
    if (!apiKey || apiKey.startsWith('••••')) {
      return { ok: false, error: 'AI belum dikonfigurasi — atur API key di /cfg → AI Assistant' };
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
            { role: 'system', content: `Kamu asisten data bantuan (Bahasa Indonesia, ringkas, maksimal 6 baris). ${snapshot}` },
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
