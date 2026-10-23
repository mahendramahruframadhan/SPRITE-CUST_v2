// Loop chat model-tool (design 2026-10-23 Task 5): panggil provider
// OpenAI-compatible maks MAX_ROUNDS putaran. Tool yang diminta model
// dijalankan via runTool (registry read-only ai.tools.ts) dan hasilnya
// (termasuk {error}) dikirim balik sebagai pesan role 'tool' agar model
// melanjutkan jawaban. Kontrak aman: API key hanya di header Authorization,
// body tak pernah memuatnya; system prompt tunggal dari readInstructions().

import { TOOL_SPECS, runTool } from './ai.tools';
import { readInstructions } from './ai.instructions';

export interface AiConnection {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface ChatResult {
  ok: boolean;
  reply?: string;
  error?: string;
  rounds: number;
  toolsCalled: string[];
}

const MAX_ROUNDS = 4;
const MAX_TOKENS = 500;
const MESSAGE_MAX_CHARS = 2000;
const DEFAULT_MODEL = 'gpt-4o-mini';

interface ToolCallMsg {
  id?: any;
  type?: string;
  function?: { name?: string; arguments?: string };
}

// Validasi ulang input (tidak percaya caller): hanya role user/assistant
// dengan content string, dipotong MESSAGE_MAX_CHARS.
function validMessages(messages: any): Array<{ role: string; content: string }> {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, MESSAGE_MAX_CHARS) }));
}

// Body per putaran: system prompt tunggal dari readInstructions() + pesan
// tervalidasi; API key TIDAK ada di body (hanya header Authorization).
function buildBody(
  model: string,
  convo: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCallMsg[];
    tool_call_id?: string;
  }>,
) {
  return {
    model: model || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    tool_choice: 'auto',
    tools: TOOL_SPECS,
    messages: [{ role: 'system', content: readInstructions() }, ...convo],
  };
}

// Respons provider bisa tool_calls array (nol, satu, atau lebih) — selain itu
// dianggap bukan permintaan tool.
function extractToolCalls(msg: any): ToolCallMsg[] {
  return msg && Array.isArray(msg.tool_calls) ? (msg.tool_calls as ToolCallMsg[]) : [];
}

// Arguments dari model bisa rusak/malformed → fallback {} (runTool toleran).
function amanParse(args: unknown): Record<string, unknown> {
  if (typeof args !== 'string' || !args.trim()) return {};
  try {
    const parsed = JSON.parse(args);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Error provider ringkas tanpa detail teknis berlebih.
const fmtProviderError = (status: number) => `provider HTTP ${status}`;

export async function aiChat(
  db: any,
  conn: AiConnection,
  messages: Array<{ role: string; content: string }>,
): Promise<ChatResult> {
  const conversation: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCallMsg[];
    tool_call_id?: string;
  }> = validMessages(messages);
  const toolsCalled: string[] = [];
  let rounds = 0;

  for (rounds = 1; rounds <= MAX_ROUNDS; rounds++) {
    let response: Response | null = null;
    try {
      response = await fetch(`${conn.baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.apiKey}` },
        body: JSON.stringify(buildBody(conn.model, conversation)),
      });
    } catch {
      return { ok: false, error: 'gagal hubungi AI', rounds, toolsCalled };
    }

    if (!response.ok) {
      return { ok: false, error: fmtProviderError(response.status), rounds, toolsCalled };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      return { ok: false, error: 'gagal hubungi AI', rounds, toolsCalled };
    }

    const message = data?.choices?.[0]?.message;
    const toolCalls = extractToolCalls(message);

    if (toolCalls.length > 0) {
      // Pesan assistant dengan tool_calls diteruskan apa adanya; tiap call
      // dijalankan dan hasilnya dikirim balik sebagai pesan tool.
      conversation.push({
        role: 'assistant',
        content: typeof message?.content === 'string' ? (message.content as string) : null,
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const name = call?.function?.name || '';
        toolsCalled.push(name);
        const result = await runTool(db, name, amanParse(call?.function?.arguments));
        conversation.push({
          role: 'tool',
          tool_call_id: call?.id ?? '',
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // tool_calls dengan content null TIDAK dianggap jawaban.
    const reply = typeof message?.content === 'string' ? message.content.trim() : '';
    if (reply) {
      return { ok: true, reply, rounds, toolsCalled };
    }
    // Respons kosong/tak bisa dipakai: putaran dipakai, lanjut ke berikutnya.
  }

  return { ok: false, error: 'Asisten belum bisa memproses pertanyaan ini.', rounds: MAX_ROUNDS, toolsCalled };
}
