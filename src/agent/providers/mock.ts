// 가짜 응답 모드 — AI 키 없이 규칙으로 질문 의도를 알아듣고 도구를 호출해 요약 문장을 그대로 답한다.
// 실제 AI 와 같은 도구·데이터 흐름을 타므로 키 없이도 전체 동작을 시험할 수 있다.
// 2-1차: 여러 질문 한 번에("A랑 B"), 이어 묻기("어제는?", "그중 카드만"), 자유 조회 조건, 리포트·문구·FAQ·설정
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

function lastMonthKey(now: Date): string {
  const d = new Date(now.getTime() + 9 * 3600_000);
  const y = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const m = d.getUTCMonth() === 0 ? 12 : d.getUTCMonth();
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** 주문 자유 조회 조건 (결제수단·금액·묶음·상태) */
function orderFilters(t: string): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  const pays: string[] = [];
  if (/카드/.test(t)) pays.push('CARD');
  if (/계좌|무통장|입금\s*주문/.test(t)) pays.push('ACCOUNT');
  if (pays.length) f.payTypes = pays;
  const min = t.match(/([\d,.]+)\s*(만)?\s*원?\s*(이상|넘는|초과)/);
  if (min) f.minAmount = Number(min[1].replace(/,/g, '')) * (min[2] ? 10000 : 1);
  const max = t.match(/([\d,.]+)\s*(만)?\s*원?\s*(이하|미만|아래)/);
  if (max) f.maxAmount = Number(max[1].replace(/,/g, '')) * (max[2] ? 10000 : 1);
  const gb: [RegExp, string][] = [[/일별|날짜별|하루하루|매일/, 'day'], [/요일/, 'weekday'], [/시간대|몇\s*시/, 'hour'], [/상품별/, 'product'], [/방송별/, 'live'], [/결제\s*수단별|결제별/, 'payType'], [/상태별/, 'status'], [/구매자별|고객별/, 'buyer']];
  for (const [re, v] of gb) if (re.test(t)) f.groupBy = v;
  if (/취소된|취소한|취소\s*완료/.test(t)) f.statuses = ['CANCELLED'];
  if (/일반\s*주문/.test(t)) f.orderType = 'GENERAL';
  else if (/주문서/.test(t)) f.orderType = 'ORDER_FORM';
  if (/비교|대비|늘었|줄었/.test(t)) f.compare = true;
  return f;
}

const CONTENT_KINDS: [RegExp, string][] = [
  [/대본|멘트|스크립트/, 'live_script'],
  [/리뷰\s*답|후기\s*답|답글/, 'review_reply'],
  [/미입금.*(문자|안내)|입금\s*안내\s*문자|입금\s*독촉/, 'sms_unpaid'],
  [/해시\s*태그|태그/, 'hashtags'],
  [/sns|인스타|홍보\s*(글|문구)|홍보문/i, 'sns_post'],
  [/공지/, 'notice'],
  [/상품\s*설명|설명\s*(글|문구)|상세\s*(설명|페이지)/, 'product_description'],
];

const REPORT_KINDS: [RegExp, string][] = [
  [/방송|라이브/, 'live_report'],
  [/정산/, 'settlement_statement'],
  [/주문\s*(목록|리스트|내역)/, 'order_list'],
  [/상품\s*(목록|리스트)|재고\s*(목록|현황표)/, 'product_list'],
  [/단골|고객/, 'customer_list'],
  [/월간|한\s*달\s*정리|월\s*리포트/, 'monthly_report'],
];

const REGIONS = ['성수', '성동', '강남', '마포', '망원', '성남', '분당', '김포', '인천'];
const SPECIALTIES: [RegExp, string][] = [[/화장품|코스메틱|뷰티/, '코스메틱'], [/의류|옷|패션/, '의류'], [/식품|음식|먹거리/, '식품'], [/생활|리빙/, '생활용품'], [/잡화|액세서리/, '잡화']];

function studioIntent(t: string): Intent | null {
  if (!/스토리지\s*마켓|스튜디오|창고|대관|촬영\s*공간/.test(t)) return null;
  if (/(스토리지\s*마켓|스튜디오)\s*(쪽\s*)?(주문|매출)/.test(t)) {
    const period = parsePeriod(t);
    return { tool: 'studio_order_summary', args: period ? { period } : {} };
  }
  if (/예약\s*(현황|목록|내역|확인|보여)|내\s*(스토리지\s*마켓\s*|스튜디오\s*)?예약|예약한|예약\s*된/.test(t)) return { tool: 'studio_my_bookings', args: { scope: /지난|했던|이전/.test(t) ? 'past' : 'upcoming', ...(/대기|승인\s*안/.test(t) ? { status: 'PENDING' } : {}) } };
  const args: Record<string, unknown> = {};
  if (/창고|물류/.test(t)) args.type = 'WAREHOUSE';
  else if (/스튜디오/.test(t)) args.type = 'STUDIO';
  const region = REGIONS.find((r) => t.includes(r));
  if (region) args.region = region;
  for (const [re, v] of SPECIALTIES) if (re.test(t)) { args.specialty = v; break; }
  const day = t.match(/(오늘|내일|모레|(다음\s*주\s*)?[월화수목금토일]요일)/);
  if (day) args.date = day[1];
  const hours = t.match(/(\d{1,2})\s*시간/);
  if (hours) args.hours = Number(hours[1]);
  return { tool: 'studio_search_facilities', args };
}

export function detectIntent(raw: string, now: Date): Intent | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  const period = parsePeriod(t);
  const p = period ? { period } : {};

  // 설정 저장
  const delay = t.match(/(송장|발송)\s*지연\s*기준.*?(\d{1,2})\s*일/);
  if (delay) return { tool: 'set_preference', args: { key: 'unshipped_delay_days', value: delay[2] } };
  if (/(기본\s*등록\s*위치|등록\s*기본)/.test(t)) return { tool: 'set_preference', args: { key: 'product_default_target', value: /방송|둘|번호/.test(t) ? 'BOTH' : 'DIRECT' } };
  if (/답변.*(짧게|간단히|자세히|길게)/.test(t)) return { tool: 'set_preference', args: { key: 'answer_style', value: /자세|길게/.test(t) ? 'detailed' : 'short' } };

  // 스토리지 마켓 (스튜디오·창고 찾기·예약·주문)
  const studio = studioIntent(t);
  if (studio) return studio;

  // 문구 작성
  if (/써\s*줘|작성|만들어\s*줘|짜\s*줘|추천해\s*줘/.test(t)) {
    for (const [re, kind] of CONTENT_KINDS)
      if (re.test(t)) {
        const no = t.match(/(\d{1,3})\s*번/);
        const kw = t.match(/["“']([^"”']+)["”']/);
        const details = t
          .replace(/["“'][^"”']+["”']/g, ' ')
          .replace(/\d{1,3}\s*번\s*(상품)?(으로|의|에\s*대한)?/g, ' ')
          .replace(/(방송\s*)?(대본|멘트|스크립트)|리뷰\s*답(변|글)?|후기\s*답(변|글)?|답글|미입금\s*(안내\s*)?문자|입금\s*안내\s*문자|해시\s*태그|태그|sns|인스타|홍보\s*(글|문구)|홍보문|공지(문|사항)?|상품\s*설명|설명\s*(글|문구)|상세\s*(설명|페이지)/gi, ' ')
          .replace(/써\s*줘|작성(해\s*줘)?|만들어\s*줘|짜\s*줘|추천해\s*줘|좀|해\s*줘|[:：]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return { tool: 'write_content', args: { kind, ...(no ? { linkNo: Number(no[1]) } : {}), ...(kw ? { productKeyword: kw[1] } : {}), ...(details.length >= 4 ? { details } : {}) } };
      }
  }
  // 리포트·파일
  if (/리포트|보고서|엑셀|excel|csv|pdf|파일|표로|정리해서\s*(줘|보내)|내역서|다운/i.test(t)) {
    let type = 'sales_analysis';
    for (const [re, k] of REPORT_KINDS) if (re.test(t)) { type = k; break; }
    return { tool: 'create_report', args: { type, ...p } };
  }
  // FAQ·사용법
  if (/어떻게\s*(해|하나|하면|하는|되나|되는|돼\?|받|신청|등록|연결|계산|바꿔|출금)|방법|규칙|기준이|뭐예요|뭔가요|무엇인가요|되나요|할\s*수\s*있|가능한가|왜\s|차이/.test(t) || (/언제/.test(t) && !period && !/방송/.test(t))) return { tool: 'search_help', args: { query: t } };

  if (/다음\s*방송|방송\s*(일정|언제|예정)|방송\s*비교|방송들/.test(t)) return { tool: 'get_lives', args: {} };
  if (/방송|라이브|라방/.test(t)) return { tool: 'get_live_orders', args: { which: /그\s*전|이전|전전/.test(t) ? 'previous' : 'latest' } };
  if (/미입금|입금\s*(안|않|전)|결제\s*(안|않)|미결제/.test(t)) return { tool: 'get_unpaid_orders', args: p };
  if (/송장|운송장|발송\s*(안|않|전|지연)|배송\s*(안|않|지연)|미발송|출고/.test(t)) return { tool: 'get_unshipped_orders', args: {} };
  if (/취소\s*(요청|현황|어떻게)|환불|반품/.test(t)) return { tool: 'get_cancel_requests', args: { openOnly: /대기|진행|처리\s*중/.test(t) } };
  if (/(월별|달별|추이|흐름).*(정산|매출)|(정산|매출).*(월별|추이)/.test(t)) return { tool: 'get_settlement_history', args: {} };
  if (/정산|출금|수수료|입금\s*예정/.test(t)) return { tool: 'get_settlement_summary', args: period === 'last_month' ? { month: lastMonthKey(now) } : {} };
  if (/단골|재구매|vip|충성/i.test(t) || (/고객|구매자/.test(t) && /분석|많이|누가|top/i.test(t))) return { tool: 'query_customers', args: p };
  if (/리뷰|후기|상품\s*문의|알림톡|크레딧|방문자|방문|팬|현황|오늘\s*뭐|할\s*일|체크/.test(t)) return { tool: 'get_shop_activity', args: {} };
  if (/안\s*팔린|판매\s*없는|판매\s*0/.test(t)) return { tool: 'query_products', args: { sortBy: 'sales', ...p } };
  if (/많이\s*팔|인기|베스트|best|top|순위|잘\s*팔/i.test(t)) return { tool: 'get_top_products', args: p };
  const linkNo = t.match(/(\d{1,3})\s*번\s*(상품|이|은|뭐|가)?/);
  if (linkNo && !/\d{4}/.test(t)) return { tool: 'get_products', args: { linkNo: Number(linkNo[1]) } };
  if (/재고|품절|상품\s*(목록|리스트)|상품\s*뭐/.test(t)) return { tool: 'get_products', args: { lowStock: /품절|임박|부족|없/.test(t) } };
  const phone4 = t.match(/(?<!\d)(\d{4})(?!\d)/);
  const nameQ = t.match(/([가-힣A-Za-z0-9_]{2,10})\s*(님|씨|고객)?\s*(의\s*)?주문\s*(찾|조회|검색|확인)/);
  if (phone4 && /주문|찾|조회|번호/.test(t)) return { tool: 'search_orders', args: { query: phone4[1], ...p } };
  if (nameQ && !/오늘|어제|이번|지난|전체|모든|카드|계좌/.test(nameQ[1])) return { tool: 'search_orders', args: { query: nameQ[1], ...p } };
  if (/주문|매출|판매|팔았|장사|실적/.test(t)) {
    const f = orderFilters(t);
    if (Object.keys(f).length) return { tool: 'query_orders', args: { ...f, ...(period ? { period } : { period: 'this_month' }) } };
    return { tool: 'get_order_summary', args: p };
  }
  return null;
}

/** 이어 묻기: "어제는?", "그중 카드만", "지난주는?" — 직전 의도에 조건만 바꿔 다시 조회 */
const PERIOD_TOOLS = new Set(['get_order_summary', 'get_unpaid_orders', 'get_top_products', 'query_orders', 'query_customers', 'query_products', 'search_orders', 'get_settlement_summary']);

export function followUp(raw: string, lastList: Intent[] | undefined, now: Date): Intent | null {
  if (!lastList?.length) return null;
  const period0 = parsePeriod(raw);
  const last = (period0 ? [...lastList].reverse().find((x) => PERIOD_TOOLS.has(x.tool)) : undefined) ?? lastList[lastList.length - 1];
  const t = raw.trim();
  if (t.length > 25) return null;
  const period = parsePeriod(t);
  const f = orderFilters(t);
  const looksFollow = /^(그럼|그러면|그중|그\s*중에|그건|이건)?\s*.{0,12}(은|는|만|도)\s*\??$|^그중|^그럼/.test(t) || (period && t.length <= 8);
  if (!looksFollow || (!period && !Object.keys(f).length)) return null;
  const args = { ...last.args };
  if (period) args.period = period;
  if (Object.keys(f).length) {
    if (['get_order_summary', 'get_unpaid_orders', 'get_top_products'].includes(last.tool)) return { tool: 'query_orders', args: { ...f, period: (period ?? last.args.period ?? 'today') as string } };
    Object.assign(args, f);
  }
  if (last.tool === 'get_settlement_summary' && period === 'last_month') return { tool: last.tool, args: { month: lastMonthKey(now) } };
  return { tool: last.tool, args };
}

/** "A랑 B 알려줘" → 여러 의도 */
export function detectIntents(raw: string, now: Date): Intent[] {
  const parts = raw.split(/\s*(?:이랑|랑|하고|그리고|및|,|\+|&)\s*/).filter((s) => s.trim().length >= 2);
  if (parts.length >= 2 && parts.length <= 4) {
    const period = parsePeriod(raw);
    const intents = parts.map((s) => detectIntent(period && !parsePeriod(s) ? `${s} ${period === 'today' ? '오늘' : ''}` : s, now)).filter((x): x is Intent => !!x);
    const uniq = intents.filter((x, i) => intents.findIndex((y) => y.tool === x.tool) === i);
    if (uniq.length >= 2) return uniq;
  }
  const one = detectIntent(raw, now);
  return one ? [one] : [];
}

export const MOCK_HELP = [
  '이렇게 물어보세요',
  '· 오늘 주문 정리해줘 / 이번 달 카드 주문 일별로',
  '· 어제 방송 주문 몇 건이야? / 다음 방송 언제야?',
  '· 입금 안 된 주문이랑 송장 안 넣은 주문',
  '· 이번 달 정산 얼마야? / 정산 언제 들어와?',
  '· 단골 고객 누구야? / 리뷰 답 안 한 거',
  '· 이번 달 매출 리포트 만들어줘 / 주문 목록 엑셀로',
  '· 3번 상품 방송 대본 써줘 / 리뷰 답변 써줘',
  '· 사진 + "간편 상품 등록해줘 32000원 20개"',
  '· (스토리지 마켓) 수요일 화장품 방송 가능한 스튜디오 / 내 스토리지 마켓 예약',
].join('\n');

const lastIntent = new Map<string, Intent[]>();

export const mockProvider: LlmProvider = {
  name: 'MOCK',
  async run(p: ProviderParams): Promise<ProviderResult> {
    const key = p.ctx.botUserId;
    let intents = detectIntents(p.userText, p.ctx.now);
    if (!intents.length) {
      const fu = followUp(p.userText, lastIntent.get(key), p.ctx.now);
      if (fu) intents = [fu];
    }
    if (!intents.length) return { text: MOCK_HELP, tokensIn: 0, tokensOut: 0 };
    const texts: string[] = [];
    for (const it of intents) texts.push((await p.exec(it.tool, it.args)).summary);
    lastIntent.set(key, intents);
    if (lastIntent.size > 5000) lastIntent.delete(lastIntent.keys().next().value as string);
    return { text: texts.join('\n\n'), tokensIn: 0, tokensOut: 0 };
  },
};
