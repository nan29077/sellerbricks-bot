// 사진으로 상품 정보 초안 만들기 — 관리자가 고른 AI(Claude/GPT)의 이미지 이해 기능 사용. 키가 없으면 null.
import { getApiKey, getLlmSettings } from '../lib/settings.js';

export interface VisionDraft {
  name?: string;
  description?: string;
  category?: string;
}

const PROMPT = (text: string) =>
  [
    '이 사진은 라이브커머스 셀러가 판매하려는 상품이야. 셀러 메시지: "' + text.slice(0, 300) + '"',
    '사진과 메시지를 보고 JSON 하나만 출력해. 다른 말은 하지 마.',
    '{"name": "상품명(20자 이내, 브랜드가 보이면 포함)", "category": "카테고리", "description": "상품 설명 3~5줄 (사실 위주, 줄바꿈 \\n)"}',
    '규칙: 사진에 없는 효능·성분·인증은 지어내지 마. 치료·완치·100% 같은 과장 표현 금지. 가격·재고는 쓰지 마.',
  ].join('\n');

function parseJson(text: string): VisionDraft | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as VisionDraft;
    return {
      name: typeof j.name === 'string' ? j.name.trim().slice(0, 60) : undefined,
      description: typeof j.description === 'string' ? j.description.trim().slice(0, 1500) : undefined,
      category: typeof j.category === 'string' ? j.category.trim().slice(0, 30) : undefined,
    };
  } catch {
    return null;
  }
}

export async function visionAvailable(): Promise<boolean> {
  const llm = await getLlmSettings();
  return llm.effective === 'CLAUDE' || llm.effective === 'GPT';
}

export async function extractProductFromImage(img: { base64: string; contentType: string }, text: string): Promise<{ draft: VisionDraft | null; error?: string; provider?: string }> {
  const llm = await getLlmSettings();
  if (llm.effective !== 'CLAUDE' && llm.effective !== 'GPT') return { draft: null };
  const signal = AbortSignal.timeout(25_000);
  try {
    if (llm.effective === 'CLAUDE') {
      const { key } = await getApiKey('anthropic');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: llm.claudeModel,
          max_tokens: 600,
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: img.contentType, data: img.base64 } }, { type: 'text', text: PROMPT(text) }] }],
        }),
        signal,
      });
      const j = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
      if (!res.ok) return { draft: null, error: `Claude 이미지 분석 오류 HTTP ${res.status} ${j.error?.message ?? ''}`, provider: 'CLAUDE' };
      return { draft: parseJson((j.content ?? []).map((b) => b.text ?? '').join('')), provider: 'CLAUDE' };
    }
    const { key } = await getApiKey('openai');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: llm.gptModel,
        max_completion_tokens: 1200,
        messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${img.contentType};base64,${img.base64}` } }, { type: 'text', text: PROMPT(text) }] }],
      }),
      signal,
    });
    const j = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!res.ok) return { draft: null, error: `GPT 이미지 분석 오류 HTTP ${res.status} ${j.error?.message ?? ''}`, provider: 'GPT' };
    return { draft: parseJson(j.choices?.[0]?.message?.content ?? ''), provider: 'GPT' };
  } catch (e) {
    return { draft: null, error: `이미지 분석 실패: ${(e as Error).message}` };
  }
}
