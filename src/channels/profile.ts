// 채널별 동작 차이 (글자 수·마크다운·긴 답변 처리·속도 제한)
// 대화 처리 코어(bot.ts)와 AI 지시문(agent.ts)이 이 표를 보고 채널에 맞게 답한다.
// 도구(tools)는 채널을 모른다 — 데이터와 요약만 돌려주고, 모양은 각 채널이 만든다. (MCP 재사용 규칙)

export type ChannelKey = 'KAKAO' | 'WEB' | 'APP' | 'TEST' | 'MCP';
/** 답변 모양 기준 — 관리자 테스트 채팅은 카카오/웹 모양을 골라 미리볼 수 있다 */
export type ChannelView = 'KAKAO' | 'WEB';

export interface ChannelProfile {
  view: ChannelView;
  label: string;
  /** AI 에게 주는 답변 길이 기준 */
  replyChars: number;
  /** 마크다운(굵게·목록·표) 허용 */
  markdown: boolean;
  /** 이 글자 수를 넘으면 "전체 보기" 결과 페이지로 넘김 (null = 안 넘김) */
  longTextAt: number | null;
  /** 1분당 최대 질문 수 (null = 제한 없음) */
  ratePerMin: number | null;
}

export const PROFILES: Record<ChannelKey, ChannelProfile> = {
  KAKAO: { view: 'KAKAO', label: '카카오 채널', replyChars: 600, markdown: false, longTextAt: 900, ratePerMin: 10 },
  WEB: { view: 'WEB', label: '웹챗', replyChars: 1500, markdown: true, longTextAt: null, ratePerMin: 20 },
  APP: { view: 'WEB', label: '앱', replyChars: 1500, markdown: true, longTextAt: null, ratePerMin: 20 },
  TEST: { view: 'KAKAO', label: '관리자 테스트', replyChars: 600, markdown: false, longTextAt: 900, ratePerMin: null },
  MCP: { view: 'WEB', label: '외부 AI(MCP)', replyChars: 4000, markdown: true, longTextAt: null, ratePerMin: 60 },
};

/** 채널 + (테스트 채팅의) 보기 모양 → 실제 적용 프로필 */
export function profileOf(channel: ChannelKey, view?: ChannelView): ChannelProfile {
  const base = PROFILES[channel];
  if (channel === 'TEST' && view === 'WEB') return { ...PROFILES.WEB, label: '관리자 테스트(웹 모양)', ratePerMin: null };
  return base;
}

export const CHANNEL_LABEL: Record<string, string> = { KAKAO: '카카오', WEB: '웹챗', APP: '앱', TEST: '테스트', MCP: 'MCP' };
