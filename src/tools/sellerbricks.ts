// 1단계(1-A) 셀러브릭스 읽기 전용 도구
// 셀러 정보(sellerId)는 인자로 받지 않는다 — 서버가 연결 토큰을 넣는다. (PlayMCP 재사용 대비)
import { config } from '../lib/config.js';
import { fmtDate, fmtDateTime, monthKey, type PeriodKey, PERIOD_KEYS, periodOf, won } from '../lib/time.js';
import { sellerbricksApi } from '../platforms/index.js';
import type { OrderListItem } from '../platforms/sellerbricks/types.js';
import type { BotTool, ToolContext } from './types.js';

const periodProp = (def: PeriodKey) => ({
  type: 'string',
  enum: PERIOD_KEYS,
  default: def,
  description: '조회 기간. today=오늘, yesterday=어제, this_week=이번 주(월요일부터), last_week=지난주, this_month=이번 달, last_month=지난달, last_7_days=최근 7일, last_30_days=최근 30일',
});

function token(ctx: ToolContext): string {
  const l = ctx.links.SELLERBRICKS;
  if (!l) throw new Error('NOT_LINKED:SELLERBRICKS');
  return l.token;
}

function period(args: Record<string, unknown>, def: PeriodKey, now: Date) {
  const k = PERIOD_KEYS.includes(args.period as PeriodKey) ? (args.period as PeriodKey) : def;
  return periodOf(k, now);
}

const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
const payLabel = { ACCOUNT: '계좌', CARD: '카드', PG: '일반결제' } as const;

function itemLine(o: OrderListItem) {
  return { title: `${o.title}`, description: `${won(o.amount)} · ${payLabel[o.payType]} · ${o.statusLabel} · ${fmtDateTime(new Date(o.createdAt))}` };
}

const sellerUrl = (path: string) => `${config.sellerbricksWebUrl}${path}`;

export const sellerbricksTools: BotTool[] = [
  // 1. 주문 정리
  {
    name: 'get_order_summary',
    title: '주문 정리',
    description: '기간별 주문 현황을 정리한다. 일반 쇼핑몰 주문과 셀러샵 주문서(계좌입금/카드결제)를 분리해 건수·금액·결제/미입금·취소·상태별 건수, 직전 동기간 대비, 주문 많은 시간대를 돌려준다. "오늘 주문 정리해줘", "이번 주 매출 어때" 같은 질문에 사용.',
    inputSchema: { type: 'object', properties: { period: periodProp('today') }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const p = period(args, 'today', ctx.now);
      const d = await (await sellerbricksApi()).getOrderSummary(token(ctx), p.from, p.to);
      const f = d.orderForm;
      const g = d.general;
      const total = f.amount + g.amount;
      const prevTotal = d.previous.orderFormAmount + d.previous.generalAmount;
      const diff = pct(total, prevTotal);
      const lines = [
        `📦 ${p.label} 주문 정리`,
        '',
        `[셀러샵 주문서] ${f.count}건 · ${won(f.amount)}`,
        `  - 계좌입금 ${f.account.count}건 ${won(f.account.amount)} / 카드 ${f.card.count}건 ${won(f.card.amount)}`,
        `  - 결제완료 ${f.paidCount}건 · 미입금/미결제 ${f.unpaidCount}건(${won(f.unpaidAmount)})`,
        `[일반 주문] ${g.count}건 · ${won(g.amount)}`,
        (f.cancelledCount + g.cancelledCount) > 0 ? `취소 ${f.cancelledCount + g.cancelledCount}건(${won(f.cancelledAmount + g.cancelledAmount)})` : '',
        diff !== null ? `직전 동기간 대비 ${diff >= 0 ? '▲' : '▼'}${Math.abs(diff)}%` : '',
        d.peakHour !== null && f.count + g.count > 3 ? `주문이 가장 많은 시간: ${d.peakHour}시대` : '',
      ].filter(Boolean);
      return {
        summary: lines.join('\n'),
        data: { period: p.label, ...d },
        card: {
          title: `${p.label} 주문 상태`,
          items: f.statusCounts.slice(0, 5).map((s) => ({ title: s.label, description: `주문서 ${s.count}건` })),
          button: { label: '주문서 관리 열기', url: sellerUrl('/seller/order-forms') },
        },
      };
    },
  },

  // 2. 방송별 주문
  {
    name: 'get_live_orders',
    title: '방송별 주문',
    description: '라이브 방송별 주문서 실적(건수·금액·결제/미입금·취소, 많이 팔린 상품, 최고 시청자 수)을 돌려준다. which=latest 는 가장 최근 방송, previous 는 그 전 방송. "어제 방송 주문 몇 건이야", "지난 방송 매출" 등에 사용.',
    inputSchema: { type: 'object', properties: { which: { type: 'string', enum: ['latest', 'previous'], default: 'latest' } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const which = args.which === 'previous' ? 'previous' : 'latest';
      const d = await (await sellerbricksApi()).getLiveOrders(token(ctx), which);
      if (!d.stream) return { summary: '최근 라이브 방송 기록이 없어요.', data: d };
      const s = d.stream;
      const f = d.orderForm;
      const lines = [
        `🎥 ${s.title}`,
        `${fmtDateTime(new Date(s.startedAt))} 시작${s.endedAt ? '' : ' · 방송 중'} · 최고 시청자 ${s.peakViewerCount}명`,
        '',
        `주문서 ${f.count}건 · ${won(f.amount)}`,
        `결제완료 ${f.paidCount}건 · 미입금/미결제 ${f.unpaidCount}건(${won(f.unpaidAmount)})${f.cancelledCount ? ` · 취소 ${f.cancelledCount}건` : ''}`,
        d.topProducts.length ? `\n많이 팔린 상품: ${d.topProducts.slice(0, 3).map((p) => `${p.name}(${p.qty}개)`).join(', ')}` : '',
      ].filter(Boolean);
      return {
        summary: lines.join('\n'),
        data: d,
        card: {
          title: '이 방송 인기 상품',
          items: d.topProducts.slice(0, 5).map((p) => ({ title: p.name, description: `${p.qty}개 · ${won(p.amount)}` })),
          button: { label: '방송 주문서 보기', url: sellerUrl('/seller/order-forms') },
        },
      };
    },
  },

  // 3. 미입금
  {
    name: 'get_unpaid_orders',
    title: '미입금 주문',
    description: '아직 입금/결제되지 않은 주문을 오래된 순으로 돌려준다(계좌입금 미입금, 카드 결제링크 미결제, 일반 주문 결제대기). 기본 기간은 최근 7일.',
    inputSchema: { type: 'object', properties: { period: periodProp('last_7_days') }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const p = period(args, 'last_7_days', ctx.now);
      const d = await (await sellerbricksApi()).getUnpaidOrders(token(ctx), p.from, p.to);
      if (!d.totalCount) return { summary: `${p.label} 미입금 주문이 없어요. 👍`, data: d };
      const acc = d.items.filter((o) => o.payType === 'ACCOUNT').length;
      return {
        summary: `💸 ${p.label} 미입금·미결제 ${d.totalCount}건 (${won(d.totalAmount)})\n계좌 미입금 ${acc}건 · 카드 미결제 ${d.items.length - acc}건${d.totalCount > d.items.length ? ' (일부만 표시)' : ''}\n가장 오래된 주문: ${fmtDateTime(new Date(d.items[0].createdAt))}`,
        data: d,
        card: { title: '미입금 주문 (오래된 순)', items: d.items.slice(0, 5).map(itemLine), button: { label: '미입금 주문 관리', url: sellerUrl('/seller/order-forms?status=unpaid') } },
      };
    },
  },

  // 4. 송장 미입력
  {
    name: 'get_unshipped_orders',
    title: '송장 미입력 주문',
    description: '결제는 끝났는데 송장(운송장)이 입력되지 않은 주문을 오래된 순으로 돌려준다. delayDays 일 넘게 지난 주문은 발송 지연으로 따로 센다(기본 2일).',
    inputSchema: { type: 'object', properties: { delayDays: { type: 'integer', minimum: 1, maximum: 14, default: 2 } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const delayDays = Math.min(14, Math.max(1, Number(args.delayDays) || 2));
      const d = await (await sellerbricksApi()).getUnshippedOrders(token(ctx), delayDays);
      if (!d.totalCount) return { summary: '송장 입력이 필요한 주문이 없어요. 👍', data: d };
      return {
        summary: `🚚 송장 미입력 ${d.totalCount}건 (${won(d.totalAmount)})${d.delayedCount ? `\n⚠️ 결제 후 ${d.delayDays}일 넘게 지난 주문 ${d.delayedCount}건 — 먼저 처리해 주세요.` : ''}`,
        data: d,
        card: { title: '송장 미입력 (오래된 순)', items: d.items.slice(0, 5).map((o) => ({ title: o.title, description: `${won(o.amount)} · 결제 ${o.paidAt ? fmtDateTime(new Date(o.paidAt)) : '-'}` })), button: { label: '송장 입력하러 가기', url: sellerUrl('/seller/order-forms?status=paid') } },
      };
    },
  },

  // 5. 취소 요청
  {
    name: 'get_cancel_requests',
    title: '취소 요청 현황',
    description: '최근 30일 전액취소·부분취소 요청과 처리 상태(관리자 승인 대기/승인/완료/반려)를 돌려준다. openOnly=true 면 처리 중인 것만. 카드 취소는 셀러 요청 → 관리자 승인 → PG 취소 순서로 진행된다.',
    inputSchema: { type: 'object', properties: { openOnly: { type: 'boolean', default: false } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const d = await (await sellerbricksApi()).getCancelRequests(token(ctx), args.openOnly === true);
      if (!d.items.length) return { summary: '최근 30일 취소 요청이 없어요.', data: d };
      return {
        summary: `↩️ 최근 30일 취소 요청 ${d.items.length}건 · 처리 대기 ${d.openCount}건\n` + d.items.slice(0, 3).map((i) => `- ${i.kind === 'PARTIAL' ? '[부분]' : '[전액]'} ${i.title} ${won(i.amount)} → ${i.statusLabel}`).join('\n'),
        data: d,
        card: { title: '취소 요청', items: d.items.slice(0, 5).map((i) => ({ title: `${i.kind === 'PARTIAL' ? '[부분] ' : ''}${i.title}`, description: `${won(i.amount)} · ${i.statusLabel} · ${fmtDate(new Date(i.requestedAt))}` })), button: { label: '취소 관리 열기', url: sellerUrl('/seller/cancels') } },
      };
    },
  },

  // 6. 정산·출금
  {
    name: 'get_settlement_summary',
    title: '정산·출금',
    description: '월별 결제 매출, 정산 예정액(수수료·취소 차감 후 세전), 수수료율, 지금 출금 신청 가능한 금액, 진행 중인 출금 신청과 최근 출금 내역을 돌려준다. month 생략 시 이번 달. 금액은 플랫폼 정산 로직이 계산한 값이므로 직접 다시 계산하지 말 것.',
    inputSchema: { type: 'object', properties: { month: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'YYYY-MM' } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const month = typeof args.month === 'string' && /^\d{4}-\d{2}$/.test(args.month) ? args.month : monthKey(ctx.now);
      const d = await (await sellerbricksApi()).getSettlementSummary(token(ctx), month);
      const lines = [
        `💰 ${Number(month.slice(5))}월 정산 현황`,
        `결제 매출 ${won(d.salesAmount)}`,
        `정산 예정액 ${won(d.expectedSettlement)} (수수료 ${d.feeRate}% 차감 · 세전)`,
        `지금 출금 가능 ${won(d.withdrawableAmount)}`,
        d.pendingPayout ? `진행 중 출금: ${won(d.pendingPayout.amount)} — ${d.pendingPayout.statusLabel}` : '',
        '',
        d.note,
      ].filter((x) => x !== '');
      return {
        summary: lines.join('\n'),
        data: d,
        card: { title: '최근 출금 내역', items: d.recentPayouts.slice(0, 5).map((p) => ({ title: `${won(p.amount)} 신청`, description: `${p.statusLabel} · 실입금 ${won(p.actualPayoutAmount)} · ${fmtDate(new Date(p.requestedAt))}` })), button: { label: '정산·출금 열기', url: sellerUrl('/seller/settlement') } },
      };
    },
  },

  // 7. 인기 상품
  {
    name: 'get_top_products',
    title: '많이 팔린 상품',
    description: '기간별 결제 완료 기준 많이 팔린 상품 순위(수량·금액, 구매링크 번호)를 돌려준다. 기본 이번 주, 5개.',
    inputSchema: { type: 'object', properties: { period: periodProp('this_week'), limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const p = period(args, 'this_week', ctx.now);
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
      const d = await (await sellerbricksApi()).getTopProducts(token(ctx), p.from, p.to, limit);
      if (!d.items.length) return { summary: `${p.label} 판매된 상품이 없어요.`, data: d };
      return {
        summary: `🏆 ${p.label} 많이 팔린 상품\n` + d.items.map((it, i) => `${i + 1}. ${it.name}${it.linkNo ? ` (${it.linkNo}번)` : ''} — ${it.qty}개 · ${won(it.amount)}`).join('\n'),
        data: { period: p.label, ...d },
        card: { title: `${p.label} TOP ${d.items.length}`, items: d.items.slice(0, 5).map((it, i) => ({ title: `${i + 1}. ${it.name}`, description: `${it.qty}개 · ${won(it.amount)}` })), button: { label: '상품 관리 열기', url: sellerUrl('/seller/products') } },
      };
    },
  },

  // 8. 상품·재고·구매링크 번호
  {
    name: 'get_products',
    title: '상품·재고 조회',
    description: '간편 상품(구매링크 번호 상품) 조회. linkNo 로 "3번 상품" 찾기, keyword 로 이름 검색, lowStock=true 로 재고 5개 이하(품절 임박) 상품만. 셋 다 없으면 전체 목록.',
    inputSchema: { type: 'object', properties: { linkNo: { type: 'integer', minimum: 1 }, keyword: { type: 'string' }, lowStock: { type: 'boolean' } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const q = { linkNo: Number(args.linkNo) || undefined, keyword: typeof args.keyword === 'string' && args.keyword.trim() ? args.keyword.trim() : undefined, lowStock: args.lowStock === true };
      const d = await (await sellerbricksApi()).getProducts(token(ctx), q);
      const stockText = (p: (typeof d.items)[number]) => (p.useStock ? (p.stock === 0 ? '품절' : `재고 ${p.stock}개`) : '재고 관리 안 함');
      if (!d.items.length) return { summary: q.lowStock ? '품절 임박 상품이 없어요. 👍' : '조건에 맞는 상품이 없어요.', data: d };
      const head = q.lowStock ? `⚠️ 품절 임박·품절 상품 ${d.items.length}개` : q.linkNo ? `🔢 ${q.linkNo}번 상품` : `🛍️ 상품 ${d.items.length}개`;
      return {
        summary: head + '\n' + d.items.slice(0, 10).map((p) => `${p.linkNo ? `${p.linkNo}번 ` : ''}${p.name} — ${won(p.price)} · ${stockText(p)}`).join('\n'),
        data: d,
        card: { title: head.replace(/^\S+\s/, ''), items: d.items.slice(0, 5).map((p) => ({ title: `${p.linkNo ? `${p.linkNo}번 ` : ''}${p.name}`, description: `${won(p.price)} · ${stockText(p)}` })), button: { label: '상품 관리 열기', url: sellerUrl('/seller/products') } },
      };
    },
  },

  // 9. 주문 찾기
  {
    name: 'search_orders',
    title: '주문 찾기',
    description: '구매자 이름, 닉네임, 주문서 제목 일부 또는 전화번호 뒷자리 4자리로 주문을 찾는다. 결과의 이름은 가려져 있다(홍*동). 기본 최근 30일.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, description: '이름/닉네임/뒷번호 4자리' }, period: periodProp('last_30_days') }, required: ['query'], additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const query = String(args.query || '').trim();
      if (query.length < 2) return { summary: '찾을 이름이나 전화번호 뒷자리 4자리를 알려주세요.', data: null };
      const p = period(args, 'last_30_days', ctx.now);
      const d = await (await sellerbricksApi()).searchOrders(token(ctx), query, p.from, p.to);
      if (!d.totalCount) return { summary: `${p.label} "${query}" 주문을 찾지 못했어요.`, data: d };
      return {
        summary: `🔍 "${query}" 주문 ${d.totalCount}건 (${p.label})\n` + d.items.slice(0, 3).map((o) => `- ${o.title} ${won(o.amount)} · ${o.statusLabel}${o.tracking ? ` · 송장 ${o.tracking}` : ''}`).join('\n'),
        data: d,
        card: { title: `"${query}" 주문`, items: d.items.slice(0, 5).map(itemLine), button: { label: '주문 상세 보기', url: d.items[0].adminUrl } },
      };
    },
  },
];
