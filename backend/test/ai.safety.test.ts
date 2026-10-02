// Uji keamanan modul AI (temuan review M-1 & M-2).
// M-1: AI_MAX_REQUESTS_PER_MINUTE harus fail-closed — env tak numerik jatuh ke
// default 10, bukan NaN yang membuat kuota tak terbatas.
// M-2: isPrivateHost harus menutup rentang sensitif: metadata cloud 169.254,
// CGNAT 100.64/10, 0.0.0.0, benchmark 198.18/19, IPv6 link-local/ULA, dan
// alamat mapped ::ffff:x.x.x.x.
// node:test bawaan; jalankan: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAiRateLimit, normalizeAiBaseUrl } from '../src/ai/ai.controller.ts';

describe('M-1 parseAiRateLimit (fail-closed)', () => {
  it('env tak numerik / kosong / tak terisi → default 10 (bukan NaN)', () => {
    assert.equal(parseAiRateLimit(undefined), 10);
    assert.equal(parseAiRateLimit(''), 10);
    assert.equal(parseAiRateLimit('abc'), 10);
    assert.equal(parseAiRateLimit('10x'), 10);
  });

  it('env numerik dipakai apa adanya, di-bawah 1 di-clamp ke 1', () => {
    assert.equal(parseAiRateLimit('7'), 7);
    assert.equal(parseAiRateLimit('0'), 1);
    assert.equal(parseAiRateLimit('-3'), 1);
    assert.equal(parseAiRateLimit('2.5'), 2);
  });
});

describe('M-2 normalizeAiBaseUrl menolak host privat/sensitif', () => {
  const withAllowlist = (hosts: string, fn: () => void) => {
    const saved = process.env.AI_ALLOWED_HOSTS;
    process.env.AI_ALLOWED_HOSTS = hosts;
    try {
      fn();
    } finally {
      if (saved === undefined) delete process.env.AI_ALLOWED_HOSTS;
      else process.env.AI_ALLOWED_HOSTS = saved;
    }
  };

  it('metadata cloud 169.254.x.x ditolak meski masuk allowlist', () => {
    withAllowlist('169.254.169.254', () => {
      assert.equal(normalizeAiBaseUrl('https://169.254.169.254/v1'), null);
    });
  });

  it('CGNAT 100.64/10 dan 0.0.0.0 ditolak meski masuk allowlist', () => {
    withAllowlist('100.64.0.1,0.0.0.0', () => {
      assert.equal(normalizeAiBaseUrl('https://100.64.0.1/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://0.0.0.0/v1'), null);
    });
  });

  it('IPv6 privat ditolak: link-local fe80, ULA fc/fd, mapped ::ffff:127.0.0.1', () => {
    withAllowlist('[fe80::1],[fc00::1],[fd12:3456::1],[::ffff:127.0.0.1]', () => {
      assert.equal(normalizeAiBaseUrl('https://[fe80::1]/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://[fc00::1]/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://[fd12:3456::1]/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://[::ffff:127.0.0.1]/v1'), null);
    });
  });

  it('rentang privat lama tetap ditolak (regresi 10./127./192.168./172.16-31)', () => {
    withAllowlist('10.1.2.3,127.0.0.1,192.168.1.1,172.16.0.1,172.31.255.255,localhost', () => {
      assert.equal(normalizeAiBaseUrl('https://10.1.2.3/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://127.0.0.1/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://192.168.1.1/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://172.16.0.1/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://172.31.255.255/v1'), null);
      assert.equal(normalizeAiBaseUrl('https://localhost/v1'), null);
    });
  });

  it('host publik yang diizinkan tetap diterima', () => {
    withAllowlist('api.openai.com', () => {
      assert.equal(normalizeAiBaseUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1');
    });
  });
});
