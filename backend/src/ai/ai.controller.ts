import { Controller, Get, Post, Body, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { SessionGuard } from '../auth/session.guard';
import { consumeRateLimit } from '../auth/rate-limit';
import { getSecret } from '../config/app-secret';
import { aiChat } from './ai.service';
import { logActivity } from '../logs/activity';

export const maskKey = (k: string) => (!k ? '' : k.length <= 4 ? '••••' : `••••${k.slice(-4)}`);

// Fail-closed: env tak numerik (NaN) dulu lolos `Math.max(1, NaN)` → NaN →
// `hits >= NaN` selalu false → kuota tak terbatas. Sekarang jatuh ke default 10.
export const parseAiRateLimit = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === '') return 10;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.floor(n));
};

const AI_MAX_REQUESTS_PER_MINUTE = parseAiRateLimit(process.env.AI_MAX_REQUESTS_PER_MINUTE);
const AI_MAX_MESSAGES = 8;
const AI_MAX_MESSAGE_CHARS = 2000;

// F3: kuota AI memakai store bersama di auth/rate-limit — entri kedaluwarsa
// ikut tersapu (dulu Map lokal aiHits tak pernah dihapus → kebocoran memori).
const AI_QUOTA_WINDOW_MS = 60_000;

// Cakupan ditutup (review M-2): metadata cloud 169.254, CGNAT 100.64/10,
// 0.0.0.0, benchmark 198.18/19, IPv6 link-local fe80 & ULA fc/fd, plus alamat
// mapped ::ffff:x.x.x.x yang dicek ulang sebagai IPv4.
const isPrivateHost = (hostname: string): boolean => {
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.startsWith('::ffff:')) {
    const v4 = host.slice('::ffff:'.length);
    return /^\d+\.\d+\.\d+\.\d+$/.test(v4) ? isPrivateHost(v4) : true;
  }
  return (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^0\./.test(host) ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    /^198\.1[89]\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host)
  );
};

const allowedAiHosts = (): Set<string> => new Set(
  String(process.env.AI_ALLOWED_HOSTS || 'api.openai.com')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

export const normalizeAiBaseUrl = (value: any): string | null => {
  const raw = String(value || 'https://api.openai.com/v1').trim().replace(/\/$/, '');
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.port && parsed.port !== '443') return null;
    if (isPrivateHost(hostname) || !allowedAiHosts().has(hostname)) return null;
    return raw;
  } catch {
    return null;
  }
};

const consumeAiQuota = (key: string): boolean =>
  consumeRateLimit(`ai:chat:${key}`, AI_MAX_REQUESTS_PER_MINUTE, AI_QUOTA_WINDOW_MS);

// Kill-switch agen chatbot-cs (design 2026-10-23 Task 6): app_config key
// 'agentConfig' → JSON {agents:[{id,enabled}]}. Entry 'chatbot-cs' ADA dengan
// enabled===false → nonaktif. Key/entry tidak ada atau gagal baca/parse →
// aktif (fail-open, ketersediaan diutamakan).
const isAiDisabled = async (db: any): Promise<boolean> => {
  try {
    const r: any = await db.pq(`SELECT value FROM app_config WHERE key='agentConfig'`, []);
    const raw = (r.rows || r)[0]?.value;
    if (!raw) return false;
    const cfg = JSON.parse(raw);
    const entry = Array.isArray(cfg?.agents) ? cfg.agents.find((a: any) => a?.id === 'chatbot-cs') : null;
    return !!(entry && entry.enabled === false);
  } catch {
    return false;
  }
};

// Proxy chat ke AI eksternal (OpenAI-compatible). Key hanya di server (secret
// storage khusus app_secrets — Imp#2) — browser tak pernah pegang key. GET
// config AI selalu ter-mask.
@Controller('ai')
export class AiController {
  private db: any = getDb();

  private async loadConfig() {
    try {
      const raw = await getSecret(this.db, 'aiConfig');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  // Pilih koneksi: id eksplisit dari switcher chat → active → legacy aiConfig.
  private async pickConnection(connectionId: any) {
    const id = String(connectionId || '').trim();
    if (id) {
      try {
        const raw = await getSecret(this.db, 'aiConnections');
        const list = raw ? JSON.parse(raw)?.connections : null;
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
      const raw = await getSecret(this.db, 'aiConnections');
      const list = raw ? JSON.parse(raw)?.connections : null;
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
  @UseGuards(SessionGuard)
  async connections() {
    try {
      const raw = await getSecret(this.db, 'aiConnections');
      const list = raw ? JSON.parse(raw)?.connections : null;
      if (!Array.isArray(list)) return [];
      return list
        .filter((c: any) => c && c.id && c.name)
        .map((c: any) => ({ id: c.id, name: c.name, provider: c.provider || '', model: c.model || '', active: !!c.active, hasKey: !!c.apiKey }));
    } catch {
      return [];
    }
  }

  // Chat AI (berbiaya per request) — wajib login (SessionGuard memvalidasi
  // token + status aktif), tanpa cek modul agar semua role bisa memakai.
  @Post('chat')
  @UseGuards(SessionGuard)
  async chat(@Body() body: any, @Req() req: any) {
    const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-AI_MAX_MESSAGES) : [];
    if (!rawMessages.length) return { ok: false, error: 'messages kosong' };
    if (rawMessages.some((message: any) => String(message?.content || '').length > AI_MAX_MESSAGE_CHARS)) {
      return { ok: false, error: `Setiap pesan maksimal ${AI_MAX_MESSAGE_CHARS} karakter.` };
    }

    const who = String(req?.user?.email || 'system').slice(0, 120);

    // Kill-switch lebih dulu — sebelum kuota: agen dimatikan pemilik data,
    // tanpa konsumsi kuota dan tanpa menyentuh provider AI.
    if (await isAiDisabled(this.db)) {
      await logActivity(this.db, { who, action: 'ai_chat', category: 'ai', detail: 'status=disabled' });
      return { ok: false, error: 'Asisten sedang dinonaktifkan.' };
    }

    const quotaKey = String(req?.user?.id || req?.ip || req?.socket?.remoteAddress || 'unknown');
    if (!consumeAiQuota(quotaKey)) {
      // Sebelum melempar 429: catat status=rate_limited (log memakai detail
      // status yang sama dengan alur error AI — tanpa isi pesan user).
      await logActivity(this.db, { who, action: 'ai_chat', category: 'ai', detail: 'status=rate_limited' });
      throw new HttpException({ code: 'AI_RATE_LIMITED', message: 'Terlalu banyak permintaan AI. Coba lagi sebentar.' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const cfg = await this.pickConnection(body.connectionId);
    const apiKey = String(cfg?.apiKey || '');
    if (!cfg || !apiKey) {
      return { ok: false, error: 'Tidak ada AI aktif — daftarkan & aktifkan di /roles → AI & API Key' };
    }
    const baseURL = normalizeAiBaseUrl(cfg.baseURL);
    if (!baseURL) {
      return { ok: false, error: 'Provider AI tidak diizinkan.' };
    }

    // Loop chat model-tool (maks 4 putaran): instruksi + tools di ai.service,
    // controller hanya pintu masuk (guard, kuota, kill-switch, koneksi, log).
    const res = await aiChat(this.db, { apiKey, baseURL, model: String(cfg.model || 'gpt-4o-mini') }, rawMessages);

    // Log status tanpa isi pesan (detail ≤500 — dipotong logActivity).
    await logActivity(this.db, {
      who,
      action: 'ai_chat',
      category: 'ai',
      detail: `status=${res.ok ? 'ok' : res.provider ? 'provider_error' : 'error'}; rounds=${res.rounds}; tools=${(res.toolsCalled || []).slice(0, 10).join(',')}`,
    });

    return res.ok ? { ok: true, reply: res.reply } : { ok: false, error: res.error };
  }
}
