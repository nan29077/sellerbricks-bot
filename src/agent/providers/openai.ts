// GPT (OpenAI Chat Completions API) — SDK 없이 fetch 로 호출
import type { LlmProvider, ProviderParams, ProviderResult } from '../types.js';

const URL = 'https://api.openai.com/v1/chat/completions';
const MAX_ROUNDS = 5;

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type Msg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export async function testOpenaiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { ok: true, message: '연결 성공' };
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, message: `HTTP ${res.status} ${j.error?.message ?? ''}`.trim() };
  } catch (e) {
    return { ok: false, message: `연결 실패: ${(e as Error).message}` };
  }
}

export const openaiProvider: LlmProvider = {
  name: 'GPT',
  async run(p: ProviderParams): Promise<ProviderResult> {
    const messages: Msg[] = [
      { role: 'system', content: p.system },
      ...p.history.map((h) => (h.role === 'user' ? ({ role: 'user', content: h.text } as Msg) : ({ role: 'assistant', content: h.text } as Msg))),
      { role: 'user', content: p.userText },
    ];
    const tools = p.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    let tokensIn = 0;
    let tokensOut = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: p.model, messages, tools: tools.length ? tools : undefined, max_completion_tokens: 2048 }),
        signal: p.signal,
      });
      const j = (await res.json().catch(() => ({}))) as {
        choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(`GPT API 오류 HTTP ${res.status}: ${j.error?.message ?? ''}`);
      tokensIn += j.usage?.prompt_tokens ?? 0;
      tokensOut += j.usage?.completion_tokens ?? 0;
      const msg = j.choices?.[0]?.message;
      const calls = msg?.tool_calls ?? [];
      if (!calls.length) return { text: (msg?.content ?? '').trim(), tokensIn, tokensOut };
      messages.push({ role: 'assistant', content: msg?.content ?? null, tool_calls: calls });
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.function.arguments || '{}');
        } catch {
          /* 잘못된 인자 → 빈 인자 */
        }
        const r = await p.exec(c.function.name, args);
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ summary: r.summary, data: r.data }).slice(0, 12000) });
      }
    }
    return { text: '', tokensIn, tokensOut };
  },
};
