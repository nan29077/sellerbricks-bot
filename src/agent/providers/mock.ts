// 가짜 응답 모드 — AI 키 없이 규칙으로 질문 의도를 알아듣고 도구를 호출해 요약 문장을 그대로 답한다.
// 실제 AI 와 같은 도구·데이터 흐름을 타므로 키 없이도 전체 동작을 시험할 수 있다.
import type { PeriodKey } from '../../lib/time.js';
import type { LlmProvider, ProviderParams, ProviderResult } from '../types.js';

export function parsePeriod(t: string): PeriodKey | undefined {
  if (/오늘|금일/.test(t)) return 'today';
  if (/어제|전날/.test(t)) return 'yesterday';
  if (/지난\s*주|저번\s*주/.test(t)) return 'last_week';
  if (/이번\s*주|금주/.test(t)) return 'this_week';
  if (/지난\s*달|저번\s*달|전월/.test(t)) return 'last_month';
  if (/이번\s*달|이달|당월/.test(t)) return 'this_month';
  if (/(최근|지난)\s*(7|칠)\s*일|일주일/.test(t)) return 'last_7_days';
  if (/(최근|지난)\s*(30|삼십)\s*일|한\s*달/.test(t)) return 'last_30_days';
  return undefined;
}

export interface Intent {
  tool: string;
  args: Record<string, unknown>;
}

export function detectIntent(raw: string, now: Date): Intent | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  const period = parsePeriod(t);
  const p = period ? { period } : {};

  if (/방송|라이브|라방/.test(t)) return { tool: 'get_live_orders', args: { which: /그\s*전|이전|전전/.test(t) ? 'previous' : 'latest' } };
  if (/미입금|입금\s*(안|않|전)|결제\s*(안|않)|미결제/.test(t)) return { tool: 'get_unpaid_orders', args: p };
  if (/송장|운송장|발송\s*(안|않|전|지연)|배송\s*(안|않|지연)|미발송|출고/.test(t)) return { tool: 'get_unshipped_orders', args: {} };
  if (/취소|환불|반품/.test(t)) return { tool: 'get_cancel_requests', args: { openOnly: /대기|진행|처리\s*중/.test(t) } };
  if (/정산|출금|수수료|입금\s*예정|언제\s*입금/.test(t)) {
    if (period === 'last_month') {
      const d = new Date(now.getTime() + 9 * 3600_000);
      const y = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
      const m = d.getUTCMonth() === 0 ? 12 : d.getUTCMonth();
      return { tool: 'get_settlement_summary', args: { month: `${y}-${String(m).padStart(2, '0')}` } };
    }
    return { tool: 'get_settlement_summary', args: {} };
  }
  if (/많이\s*팔|인기|베스트|best|top|순위|잘\s*팔/i.test(t)) return { tool: 'get_top_products', args: p };
  const linkNo = t.match(/(\d{1,3})\s*번\s*(상품|이|은|뭐|가)?/);
  if (linkNo && !/\d{4}/.test(t)) return { tool: 'get_products', args: { linkNo: Number(linkNo[1]) } };
  if (/재고|품절|상품\s*(목록|리스트)|상품\s*뭐/.test(t)) return { tool: 'get_products', args: { lowStock: /품절|임박|부족|없/.test(t) } };
  const phone4 = t.match(/(?<!\d)(\d{4})(?!\d)/);
  const nameQ = t.match(/([가-힣A-Za-z0-9_]{2,10})\s*(님|씨|고객)?\s*(의\s*)?주문\s*(찾|조회|검색|확인)/);
  if (phone4 && /주문|찾|조회|번호/.test(t)) return { tool: 'search_orders', args: { query: phone4[1], ...p } };
  if (nameQ && !/오늘|어제|이번|지난|전체|모든/.test(nameQ[1])) return { tool: 'search_orders', args: { query: nameQ[1], ...p } };
  if (/주문|매출|판매|팔았|장사|실적/.test(t)) return { tool: 'get_order_summary', args: p };
  return null;
}

export const MOCK_HELP = [
  '이렇게 물어보세요 🙂',
  '· 오늘 주문 정리해줘',
  '· 어제 방송 주문 몇 건이야?',
  '· 입금 안 된 주문 알려줘',
  '· 송장 안 넣은 주문',
  '· 취소 요청 어떻게 됐어?',
  '· 이번 달 정산 얼마야?',
  '· 이번 주 많이 팔린 상품',
  '· 품절 임박 상품 / 3번 상품 뭐였지?',
  '· 1234 주문 찾아줘 (전화번호 뒷자리)',
].join('\n');

export const mockProvider: LlmProvider = {
  name: 'MOCK',
  async run(p: ProviderParams): Promise<ProviderResult> {
    const intent = detectIntent(p.userText, p.ctx.now);
    if (!intent) return { text: MOCK_HELP, tokensIn: 0, tokensOut: 0 };
    const r = await p.exec(intent.tool, intent.args);
    return { text: r.summary, tokensIn: 0, tokensOut: 0 };
  },
};
