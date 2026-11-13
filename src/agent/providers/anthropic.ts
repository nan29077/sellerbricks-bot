// Claude (Anthropic Messages API) — SDK 없이 fetch 로 호출
import type { LlmProvider, ProviderParams, ProviderResult } from '../types.js';

const URL = 'https://api.anthropic.com/v1/messages';
const MAX_ROUNDS = 5;

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } | { type: 'tool_result'; tool_use_id: string; content: string };
type Msg = { role: 'user' | 'assistant'; content: string | Block[] };

export async function testAnthropicKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, message: '연결 성공' };
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, message: `HTTP ${res.status} ${j.error?.message ?? ''}`.trim() };
  } catch (e) {
    return { ok: false, message: `연결 실패: ${(e as Error).message}` };
  }
}

export const anthropicProvider: LlmProvider = {
  name: 'CLAUDE',
  async run(p: ProviderParams): Promise<ProviderResult> {
    const messages: Msg[] = [...p.history.map((h) => ({ role: h.role, content: h.text }) as Msg), { role: 'user', content: p.userText }];
    const tools = p.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    let tokensIn = 0;
    let tokensOut = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: p.model, max_tokens: 1024, system: p.system, messages, tools: tools.length ? tools : undefined }),
        signal: p.signal,
      });
      const j = (await res.json().catch(() => ({}))) as {
        content?: Block[];
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(`Claude API 오류 HTTP ${res.status}: ${j.error?.message ?? ''}`);
      tokensIn += j.usage?.input_tokens ?? 0;
      tokensOut += j.usage?.output_tokens ?? 0;
      const content = j.content ?? [];
      const uses = content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
      if (j.stop_reason !== 'tool_use' || !uses.length) {
        const text = content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim();
        return { text, tokensIn, tokensOut };
      }
      messages.push({ role: 'assistant', content });
      const results: Block[] = [];
      for (const u of uses) {
        const r = await p.exec(u.name, u.input || {});
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify({ summary: r.summary, data: r.data }).slice(0, 12000) });
      }
      messages.push({ role: 'user', content: results });
    }
    return { text: '', tokensIn, tokensOut };
  },
};
