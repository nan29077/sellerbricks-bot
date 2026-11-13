// 카카오 오픈빌더 스킬 응답(JSON 2.0) 만들기
// 참고: simpleText 최대 1000자(500자 넘으면 "전체 보기"), listCard 항목 최대 5개·버튼 최대 2개, quickReplies 최대 10개
import type { ListCard } from '../tools/types.js';

export interface KakaoSkillResponse {
  version: '2.0';
  template?: {
    outputs: Record<string, unknown>[];
    quickReplies?: { label: string; action: 'message'; messageText: string }[];
  };
  useCallback?: boolean;
  data?: Record<string, unknown>;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function buildResponse(text: string, card?: ListCard, quickReplies: string[] = []): KakaoSkillResponse {
  const outputs: Record<string, unknown>[] = [{ simpleText: { text: cut(text || ' ', 1000) } }];
  if (card && card.items.length) {
    outputs.push({
      listCard: {
        header: { title: cut(card.title, 30) },
        items: card.items.slice(0, 5).map((i) => ({ title: cut(i.title, 40), description: cut(i.description, 60) })),
        ...(card.button ? { buttons: [{ label: cut(card.button.label, 14), action: 'webLink', webLinkUrl: card.button.url }] } : {}),
      },
    });
  }
  return {
    version: '2.0',
    template: {
      outputs,
      ...(quickReplies.length ? { quickReplies: quickReplies.slice(0, 10).map((q) => ({ label: cut(q, 14), action: 'message' as const, messageText: q })) } : {}),
    },
  };
}

/** 콜백 사용 시 5초 안에 돌려주는 즉시 응답 */
export function callbackAck(text = '확인하고 있어요. 잠시만요… ⏳'): KakaoSkillResponse {
  return { version: '2.0', useCallback: true, data: { text } };
}
