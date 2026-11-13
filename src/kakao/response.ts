// 카카오 오픈빌더 스킬 응답(JSON 2.0) 만들기
// 참고: simpleText 최대 1000자(500자 넘으면 "전체 보기"), listCard 항목 최대 5개·버튼 최대 2개, quickReplies 최대 10개
import type { AgentOutput } from '../agent/types.js';

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

type ReplyLike = Pick<AgentOutput, 'text' | 'card' | 'basicCard' | 'link' | 'quickReplies'>;

/** 봇 답변 → 카카오 스킬 응답. 말풍선 + (리스트카드 | 사진 카드 | 결과 링크 카드) + 바로가기 버튼 */
export function buildResponse(r: ReplyLike | string): KakaoSkillResponse {
  const reply: ReplyLike = typeof r === 'string' ? { text: r, quickReplies: [] } : r;
  const outputs: Record<string, unknown>[] = [{ simpleText: { text: cut(reply.text || ' ', 1000) } }];
  const card = reply.card;
  if (reply.basicCard) {
    const b = reply.basicCard;
    const buttons = b.buttons.slice(0, 3).map((x) => (x.action === 'webLink' ? { label: cut(x.label, 14), action: 'webLink', webLinkUrl: x.value } : { label: cut(x.label, 14), action: 'message', messageText: x.value }));
    outputs.push(b.imageUrl ? { basicCard: { title: cut(b.title, 50), description: cut(b.description, 230), thumbnail: { imageUrl: b.imageUrl }, buttons } } : { textCard: { title: cut(b.title, 50), description: cut(b.description, 230), buttons } });
  } else if (card && card.items.length) {
    outputs.push({
      listCard: {
        header: { title: cut(card.title, 30) },
        items: card.items.slice(0, 5).map((i) => ({ title: cut(i.title, 40), description: cut(i.description, 60) })),
        ...(card.button ? { buttons: [{ label: cut(card.button.label, 14), action: 'webLink', webLinkUrl: card.button.url }] } : {}),
      },
    });
  } else if (reply.link) {
    outputs.push({ textCard: { title: '결과물이 준비됐어요', description: '버튼을 눌러 열어 보세요.', buttons: [{ label: cut(reply.link.label, 14), action: 'webLink', webLinkUrl: reply.link.url }] } });
  }
  const qrs = reply.quickReplies ?? [];
  return {
    version: '2.0',
    template: {
      outputs,
      ...(qrs.length ? { quickReplies: qrs.slice(0, 10).map((q) => ({ label: cut(q, 14), action: 'message' as const, messageText: q })) } : {}),
    },
  };
}

/** 콜백 사용 시 5초 안에 돌려주는 즉시 응답 */
export function callbackAck(text = '확인하고 있어요. 잠시만요…'): KakaoSkillResponse {
  return { version: '2.0', useCallback: true, data: { text } };
}
