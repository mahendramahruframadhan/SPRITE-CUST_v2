import { Controller, Get, Put, Body, Query, Req, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getDb } from '../db/drizzle.service';
import { SessionGuard } from '../auth/session.guard';
import { resolveSessionUser } from '../auth/session';
import { maskKey } from '../ai/ai.controller';
import { getSecret, setSecret } from './app-secret';

// Imp#2: modul konfigurasi AI terpisah dari config umum (/config).
// - GET  : sesi valid apa pun (hasil selalu ter-mask; browser tak pernah
//          menerima key utuh).
// - PUT  : HANYA Super Admin; secret disimpan di app_secrets (storage
//          khusus), app_config tidak pernah memuat AI key.
// Generic /config menolak key AI dengan 403 AI_CONFIG_SEPARATED.
@Controller('config/ai')
@UseGuards(SessionGuard)
export class AiConfigController {
  private db: any = getDb();

  private cleanKey(k: any): string {
    const v = String(k || 'aiConnections').replace(/[^a-zA-Z0-9_]/g, '');
    return v === 'aiConfig' || v === 'aiConnections' ? v : 'aiConnections';
  }

  private async assertSuperAdmin(req: any) {
    const u = await resolveSessionUser(this.db, req);
    if (u?.role !== 'Super Admin') {
      throw new ForbiddenException({ code: 'AI_CONFIG_FORBIDDEN', message: 'Hanya Super Admin yang dapat mengubah konfigurasi AI.' });
    }
  }

  @Get()
  async get(@Query('k') k?: string, @Req() req?: any) {
    const key = this.cleanKey(k);
    const raw = await getSecret(this.db, key);
    if (!raw) return { source: 'empty', key, config: {} };
    const cfg = JSON.parse(raw);
    if (key === 'aiConfig' && cfg.apiKey) cfg.apiKey = maskKey(cfg.apiKey);
    if (key === 'aiConnections' && Array.isArray(cfg.connections)) {
      for (const c of cfg.connections) {
        if (c && c.apiKey) {
          c.hasKey = true;
          c.apiKey = maskKey(c.apiKey);
        }
      }
    }
    return { source: 'db', key, config: cfg };
  }

  @Put()
  async put(@Body() body: any, @Req() req: any) {
    await this.assertSuperAdmin(req);
    const key = this.cleanKey(body?.key);
    const incoming = body?.config || body;

    // key kosong/mask = tidak diubah (jangan timpa key asli dengan ••••)
    const oldRaw = await getSecret(this.db, key);
    const old = oldRaw ? JSON.parse(oldRaw) : {};
    if (key === 'aiConfig' && (!incoming.apiKey || String(incoming.apiKey).startsWith('••••'))) {
      if (old.apiKey) incoming.apiKey = old.apiKey;
    }
    if (key === 'aiConnections' && Array.isArray(incoming.connections)) {
      const oldList = Array.isArray(old.connections) ? old.connections : [];
      const oldById: any = {};
      for (const o of oldList) if (o && o.id) oldById[o.id] = o;
      for (const c of incoming.connections) {
        if (c && c.id && oldById[c.id]?.apiKey && (!c.apiKey || String(c.apiKey).startsWith('••••'))) {
          c.apiKey = oldById[c.id].apiKey;
        }
      }
    }
    await setSecret(this.db, key, JSON.stringify(incoming));
    return { ok: true, key };
  }
}
