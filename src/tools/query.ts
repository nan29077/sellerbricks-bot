// 2-1차 범용 조회 도구 — 조건을 조합해 무엇이든 조회. 계산(합계·묶음·비교)은 플랫폼/서버가 하고 AI 는 설명만 한다.
import { createArtifact, type Section } from '../lib/artifacts.js';
import { config } from '../lib/config.js';
import { prisma } from '../lib/db.js';
import { addMonths, fmtDate, fmtDateTime, monthKey, type PeriodKey, PERIOD_KEYS, rangeFromArgs, won } from '../lib/time.js';
import { sellerbricksApi } from '../platforms/index.js';
import type { OrderGroupBy, OrderQuery, OrderStatusKey, PayType, ProductKind } from '../platforms/sellerbricks/types.js';
import type { BotTool, ToolContext } from './types.js';

const periodProps = (def: PeriodKey) => ({
  period: { type: 'string', enum: PERIOD_KEYS, default: def, description: '기간 (today, yesterday, this_week, last_week, this_month, last_month, last_7_days, last_30_days). from/to 를 주면 무시' },
  from: { type: 'string', description: '시작일 YYYY-MM-DD (한국 날짜, 포함)' },
  to: { type: 'string', description: '종료일 YYYY-MM-DD (포함)' },
});

function token(ctx: ToolContext): string {
  const l = ctx.links.SELLERBRICKS;
  if (!l) throw new Error('NOT_LINKED:SELLERBRICKS');
  return l.token;
}

const STATUS_LABEL: Record<OrderStatusKey, string> = { UNPAID: '미입금·미결제', PAID: '결제 완료', PREPARING: '배송 준비', SHIPPING: '배송 중', DELIVERED: '배송 완료', CANCEL_REQUESTED: '취소 요청 중', CANCELLED: '취소 완료' };
const PAY_LABEL: Record<PayType, string> = { ACCOUNT: '계좌입금', CARD: '카드', PG: '일반결제' };
const GROUP_LABEL: Record<OrderGroupBy, string> = { none: '', day: '날짜별', weekday: '요일별', hour: '시간대별', product: '상품별', live: '방송별', payType: '결제수단별', status: '상태별', buyer: '구매자별' };
const arr = <T extends string>(v: unknown, allowed: readonly T[]): T[] | undefined => {
  const a = (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((x): x is T => allowed.includes(x as T));
  return a.length ? a : undefined;
};
const numOrU = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
const sellerUrl = (p: string) => `${config.sellerbricksWebUrl}${p}`;

export const queryTools: BotTool[] = [
  {
    name: 'query_orders',
    title: '주문 자유 조회',
    description:
      '주문을 조건으로 자유롭게 조회·집계한다. 정해진 질문 도구로 안 되는 모든 주문 질문에 사용. ' +
      '조건: 기간, orderType(ALL/GENERAL=일반주문/ORDER_FORM=주문서), payTypes(ACCOUNT 계좌·CARD 카드·PG 일반결제), statuses(UNPAID·PAID·PREPARING·SHIPPING·DELIVERED·CANCEL_REQUESTED·CANCELLED, 생략 시 취소완료 제외 전체), live(latest=최근 방송), productKeyword, buyer(이름·닉네임·전화 뒷4자리), minAmount/maxAmount. ' +
      'groupBy 로 day·weekday·hour·product·live·payType·status·buyer 별 묶음 합계, compare=true 면 직전 동기간 비교. 합계·평균은 결과값을 그대로 쓸 것.',
    inputSchema: {
      type: 'object',
      properties: {
        ...periodProps('this_month'),
        orderType: { type: 'string', enum: ['ALL', 'GENERAL', 'ORDER_FORM'], default: 'ALL' },
        payTypes: { type: 'array', items: { type: 'string', enum: ['ACCOUNT', 'CARD', 'PG'] } },
        statuses: { type: 'array', items: { type: 'string', enum: Object.keys(STATUS_LABEL) } },
        live: { type: 'string', description: "'latest' = 가장 최근 방송 주문만" },
        productKeyword: { type: 'string' },
        buyer: { type: 'string' },
        minAmount: { type: 'number' },
        maxAmount: { type: 'number' },
        groupBy: { type: 'string', enum: Object.keys(GROUP_LABEL), default: 'none' },
        compare: { type: 'boolean', default: false },
      },
      additionalProperties: false,
    },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const p = rangeFromArgs(args, 'this_month', ctx.now);
      const q: OrderQuery = {
        from: p.from,
        to: p.to,
        orderType: ['ALL', 'GENERAL', 'ORDER_FORM'].includes(String(args.orderType)) ? (args.orderType as OrderQuery['orderType']) : 'ALL',
        payTypes: arr(args.payTypes, ['ACCOUNT', 'CARD', 'PG'] as const),
        statuses: arr(args.statuses, Object.keys(STATUS_LABEL) as OrderStatusKey[]),
        liveStreamId: typeof args.live === 'string' && args.live ? args.live : undefined,
        productKeyword: typeof args.productKeyword === 'string' && args.productKeyword.trim() ? args.productKeyword.trim() : undefined,
        buyer: typeof args.buyer === 'string' && args.buyer.trim() ? args.buyer.trim() : undefined,
        minAmount: numOrU(args.minAmount),
        maxAmount: numOrU(args.maxAmount),
        groupBy: (Object.keys(GROUP_LABEL).includes(String(args.groupBy)) ? args.groupBy : 'none') as OrderGroupBy,
        compare: args.compare === true,
        limit: 10,
      };
      const d = await (await sellerbricksApi()).queryOrders(token(ctx), q);
      const cond = [
        p.label,
        q.orderType === 'GENERAL' ? '일반 주문' : q.orderType === 'ORDER_FORM' ? '주문서' : '',
        q.payTypes?.map((x) => PAY_LABEL[x]).join('·') ?? '',
        q.statuses?.map((x) => STATUS_LABEL[x]).join('·') ?? '',
        q.liveStreamId ? '최근 방송' : '',
        q.productKeyword ? `상품 "${q.productKeyword}"` : '',
        q.buyer ? `구매자 "${q.buyer}"` : '',
        q.minAmount !== undefined ? `${won(q.minAmount)} 이상` : '',
        q.maxAmount !== undefined ? `${won(q.maxAmount)} 이하` : '',
      ].filter(Boolean).join(' · ');
      const lines = [`${cond}`, `${d.totals.count}건 · ${won(d.totals.amount)} (결제완료 ${d.totals.paidCount}건 ${won(d.totals.paidAmount)}, 평균 ${won(d.totals.avgAmount)})`];
      if (d.previous) {
        const diff = d.previous.amount ? Math.round(((d.totals.amount - d.previous.amount) / d.previous.amount) * 100) : null;
        lines.push(`직전 동기간 ${d.previous.count}건 · ${won(d.previous.amount)}${diff !== null ? ` → ${diff >= 0 ? '▲' : '▼'}${Math.abs(diff)}%` : ''}`);
      }
      if (q.groupBy !== 'none' && d.groups.length) {
        lines.push('', `[${GROUP_LABEL[q.groupBy!]}]`);
        for (const g of d.groups.slice(0, 7)) lines.push(`${g.label}: ${g.count}${q.groupBy === 'product' ? '개' : '건'} · ${won(g.amount)}`);
        if (d.groups.length > 7) lines.push(`…외 ${d.groups.length - 7}개`);
      }
      let link: { label: string; url: string } | undefined;
      if (d.groups.length > 7 || d.totals.count > 5) {
        const sections: Section[] = [{ type: 'kpis', items: [{ label: '주문', value: `${d.totals.count}건` }, { label: '금액', value: won(d.totals.amount) }, { label: '결제완료', value: won(d.totals.paidAmount) }, { label: '평균', value: won(d.totals.avgAmount) }] }];
        if (d.groups.length) {
          sections.push({ type: 'bars', title: GROUP_LABEL[q.groupBy!] + ' 금액', unit: '원', data: d.groups.map((g) => ({ label: g.label, value: g.amount })) });
          sections.push({ type: 'table', title: GROUP_LABEL[q.groupBy!] + ' 합계', columns: ['구분', '건수', '금액'], rows: d.groups.map((g) => [g.label, g.count, g.amount]) });
        }
        if (d.items.length) sections.push({ type: 'table', title: '최근 주문 (표본)', columns: ['주문', '구매자', '금액', '결제', '상태', '주문시각'], rows: d.items.map((o) => [o.title, o.buyer, o.amount, PAY_LABEL[o.payType], o.statusLabel, fmtDateTime(new Date(o.createdAt))]), note: d.truncated ? `전체 ${d.totals.count}건 중 최근 ${d.items.length}건만 표시. 전체 목록(개인정보 포함)은 셀러 관리자 화면에서 받으세요.` : undefined });
        const a = await createArtifact(ctx.botUserId, 'REPORT', { title: '주문 조회 결과', subtitle: cond, sections });
        link = { label: '결과 페이지 열기', url: a.url };
      }
      return {
        summary: lines.join('\n'),
        data: { condition: cond, ...d },
        link,
        card: {
          title: q.groupBy !== 'none' ? GROUP_LABEL[q.groupBy!] : '최근 주문',
          items: (q.groupBy !== 'none' ? d.groups.slice(0, 5).map((g) => ({ title: g.label, description: `${g.count}건 · ${won(g.amount)}` })) : d.items.slice(0, 5).map((o) => ({ title: o.title, description: `${won(o.amount)} · ${o.statusLabel}` }))),
          button: link ?? { label: '주문 관리 열기', url: sellerUrl('/seller/orders') },
        },
      };
    },
  },

  {
    name: 'query_products',
    title: '상품 자유 조회',
    description:
      '셀러 상품을 조회한다. scope: QUICK=간편 상품(주문서 선택용, 평생번호 구매링크) / DIRECT=간편 상품(마이샵 진열용) / ALL. keyword·linkNo·lowStock(재고 5개 이하)·activeOnly, ' +
      'sortBy(sales 판매순·stock 재고 적은순·price·recent), 판매 실적 기간(period/from/to, 기본 최근 30일). 판매 안 된 상품 찾기는 sortBy=sales 후 soldQty=0 확인.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['ALL', 'QUICK', 'DIRECT'], default: 'ALL' },
        keyword: { type: 'string' },
        linkNo: { type: 'integer', minimum: 1 },
        lowStock: { type: 'boolean' },
        activeOnly: { type: 'boolean' },
        sortBy: { type: 'string', enum: ['sales', 'stock', 'price', 'recent'] },
        ...periodProps('last_30_days'),
      },
      additionalProperties: false,
    },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const p = rangeFromArgs(args, 'last_30_days', ctx.now);
      const scope = ['QUICK', 'DIRECT'].includes(String(args.scope)) ? (args.scope as ProductKind) : 'ALL';
      const d = await (await sellerbricksApi()).queryProducts(token(ctx), {
        scope,
        keyword: typeof args.keyword === 'string' && args.keyword.trim() ? args.keyword.trim() : undefined,
        linkNo: numOrU(args.linkNo),
        lowStock: args.lowStock === true,
        activeOnly: args.activeOnly === true,
        sortBy: ['sales', 'stock', 'price', 'recent'].includes(String(args.sortBy)) ? (args.sortBy as 'sales') : undefined,
        salesFrom: p.from,
        salesTo: p.to,
        limit: 20,
      });
      const kindLabel = (k: ProductKind) => (k === 'QUICK' ? '주문서' : '마이샵');
      const stockText = (x: (typeof d.items)[number]) => (!x.isActive ? '판매중지' : x.useStock ? (x.stock === 0 ? '품절' : `재고 ${x.stock}`) : '재고 무제한');
      if (!d.items.length) return { summary: '조건에 맞는 상품이 없어요.', data: d };
      return {
        summary: `상품 ${d.totalCount}개 (판매 실적: ${p.label})\n` + d.items.slice(0, 8).map((x) => `${x.linkNo ? `${x.linkNo}번 ` : ''}${x.name} [${kindLabel(x.kind)}] ${won(x.price)} · ${stockText(x)} · ${x.soldQty}개 판매`).join('\n'),
        data: { salesPeriod: p.label, ...d },
        card: { title: '상품 조회', items: d.items.slice(0, 5).map((x) => ({ title: `${x.linkNo ? `${x.linkNo}번 ` : ''}${x.name}`, description: `${won(x.price)} · ${stockText(x)} · ${x.soldQty}개 판매` })), button: { label: '상품 관리 열기', url: sellerUrl('/seller/products') } },
      };
    },
  },

  {
    name: 'query_customers',
    title: '고객 분석',
    description: '기간 내 구매 고객 분석: 구매자 수, 재구매(2회 이상) 고객 수·비율, 신규 팬 수, 단골 TOP(금액순 또는 횟수순). 이름은 가려서 나온다.',
    inputSchema: { type: 'object', properties: { ...periodProps('last_30_days'), sortBy: { type: 'string', enum: ['amount', 'count'], default: 'amount' }, limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const p = rangeFromArgs(args, 'last_30_days', ctx.now);
      const d = await (await sellerbricksApi()).queryCustomers(token(ctx), { from: p.from, to: p.to, sortBy: args.sortBy === 'count' ? 'count' : 'amount', limit: Number(args.limit) || 10 });
      return {
        summary: `${p.label} 구매 고객 ${d.totalBuyers}명 · 재구매 ${d.repeatBuyers}명(${d.repeatRate}%) · 신규 팬 ${d.newFans}명\n단골 TOP: ` + d.items.slice(0, 3).map((c) => `${c.buyer} ${c.orderCount}회 ${won(c.amount)}`).join(', '),
        data: { period: p.label, ...d },
        card: { title: `단골 TOP (${p.label})`, items: d.items.slice(0, 5).map((c) => ({ title: c.buyer, description: `${c.orderCount}회 · ${won(c.amount)} · 최근 ${fmtDate(new Date(c.lastOrderAt))}` })), button: { label: '팬 관리 열기', url: sellerUrl('/seller/fans') } },
      };
    },
  },

  {
    name: 'get_settlement_history',
    title: '월별 정산 추이',
    description: '월별 결제 매출·수수료·정산 예정액 추이(기본 최근 6개월)와 정산 규칙(결제 완료 후 영업일 N일 뒤 출금 가능). 이번 달 출금 가능액은 get_settlement_summary 사용.',
    inputSchema: { type: 'object', properties: { fromMonth: { type: 'string', pattern: '^\\d{4}-\\d{2}$' }, toMonth: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const toMonth = typeof args.toMonth === 'string' && /^\d{4}-\d{2}$/.test(args.toMonth) ? args.toMonth : monthKey(ctx.now);
      const fromMonth = typeof args.fromMonth === 'string' && /^\d{4}-\d{2}$/.test(args.fromMonth) ? args.fromMonth : addMonths(toMonth, -5);
      const d = await (await sellerbricksApi()).getSettlementHistory(token(ctx), fromMonth, toMonth);
      if (!d.months.length) return { summary: '해당 기간 정산 내역이 없어요.', data: d };
      return {
        summary: `월별 정산 추이 (${fromMonth} ~ ${toMonth})\n` + d.months.map((m) => `${Number(m.month.slice(5))}월: 매출 ${won(m.salesAmount)} → 정산 예정 ${won(m.expectedSettlement)}`).join('\n') + `\n정산 규칙: 결제 완료 후 영업일 ${d.settlementBusinessDays}일 뒤 출금 가능`,
        data: d,
        card: { title: '월별 정산 예정액', items: d.months.slice(-5).map((m) => ({ title: `${m.month}`, description: `매출 ${won(m.salesAmount)} · 정산 ${won(m.expectedSettlement)}` })), button: { label: '정산·출금 열기', url: sellerUrl('/seller/settlements') } },
      };
    },
  },

  {
    name: 'get_lives',
    title: '방송 일정·실적',
    description: '예정된 방송 일정과 최근 방송별 실적(최고 시청자, 주문 건수·금액·결제금액)을 돌려준다. 방송끼리 비교, 다음 방송 언제 질문에 사용.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 } }, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const d = await (await sellerbricksApi()).getLives(token(ctx), Number(args.limit) || 5);
      const lines = ['방송 일정·실적'];
      lines.push(d.upcoming.length ? `다음 방송: ${d.upcoming[0].title} · ${fmtDateTime(new Date(d.upcoming[0].scheduledAt))}` : '예정된 방송이 없어요.');
      if (d.recent.length) {
        lines.push('', '[최근 방송]');
        for (const r of d.recent.slice(0, 5)) lines.push(`${fmtDate(new Date(r.startedAt))} ${r.title.replace(/^\d+\/\d+\s*/, '')}: ${r.orderCount}건 ${won(r.amount)} · 시청 ${r.peakViewerCount}명`);
      }
      return {
        summary: lines.join('\n'),
        data: d,
        card: { title: '최근 방송 실적', items: d.recent.slice(0, 5).map((r) => ({ title: r.title, description: `${r.orderCount}건 · ${won(r.amount)} · 시청 ${r.peakViewerCount}명` })), button: { label: '라이브 관리 열기', url: sellerUrl('/seller/live') } },
      };
    },
  },

  {
    name: 'get_shop_activity',
    title: '오늘 샵 현황',
    description: '샵 전체 현황 한눈에: 방송 중 여부·다음 방송, 오늘/7일 문자(MO 평생번호) 주문 접수, 알림톡 잔여 크레딧, 답변 안 한 리뷰, 안 읽은 상품 문의, 신규 팬, 방문자 수. "오늘 뭐 해야 돼?", "리뷰 답 안 한 거", "알림톡 크레딧" 등에 사용.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx) {
      const d = await (await sellerbricksApi()).getShopActivity(token(ctx));
      const lines = [
        '샵 현황',
        d.liveNow ? `방송 중: ${d.liveNow.title}` : d.nextLive ? `다음 방송: ${fmtDateTime(new Date(d.nextLive.scheduledAt))}` : '예정 방송 없음',
        `문자 주문 접수: 오늘 ${d.moMessages.today}건 · 7일 ${d.moMessages.last7Days}건`,
        `알림톡 크레딧: ${d.alimtalkCredit.toLocaleString('ko-KR')}${d.alimtalkCredit < 1000 ? ' 충전 필요' : ''}`,
        `답변 안 한 리뷰 ${d.unansweredReviews.count}개 · 안 읽은 상품 문의 ${d.unreadProductChats.count}개`,
        `신규 팬(7일) ${d.newFans.last7Days}명 · 방문자 오늘 ${d.visitors.today}명 / 어제 ${d.visitors.yesterday}명`,
      ];
      const todo = [...d.unreadProductChats.items.map((c) => ({ title: c.product, description: c.text })), ...d.unansweredReviews.items.map((r) => ({ title: `별점 ${r.rating} · ${r.product}`, description: r.text }))];
      return { summary: lines.join('\n'), data: d, card: todo.length ? { title: '답변이 필요한 항목', items: todo.slice(0, 5), button: { label: '셀러 관리자 열기', url: sellerUrl('/seller') } } : undefined };
    },
  },

  {
    name: 'create_report',
    title: '리포트·파일 만들기',
    description:
      '결과물(표·차트가 있는 결과 페이지 + 엑셀용 CSV 다운로드 + PDF 인쇄)을 만들어 링크를 돌려준다. type: sales_analysis(기간 매출 분석: 일별·결제수단·상품·시간대), live_report(최근 방송 리포트), monthly_report(월간 리포트), ' +
      'order_list(주문 목록 — 이름 가림, 전화 뒷4자리), settlement_statement(월별 정산 내역), product_list(상품·재고·판매 목록), customer_list(단골 고객). "엑셀로 줘", "리포트 만들어줘", "정리해서 보내줘" 요청에 사용.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['sales_analysis', 'live_report', 'monthly_report', 'order_list', 'settlement_statement', 'product_list', 'customer_list'] },
        ...periodProps('this_month'),
        statuses: { type: 'array', items: { type: 'string', enum: Object.keys(STATUS_LABEL) } },
        payTypes: { type: 'array', items: { type: 'string', enum: ['ACCOUNT', 'CARD', 'PG'] } },
      },
      required: ['type'],
      additionalProperties: false,
    },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const api = await sellerbricksApi();
      const t = token(ctx);
      const type = String(args.type);
      const p = rangeFromArgs(args, type === 'monthly_report' ? 'this_month' : 'this_month', ctx.now);
      const sections: Section[] = [];
      let title = '';
      const base = { from: p.from, to: p.to, statuses: arr(args.statuses, Object.keys(STATUS_LABEL) as OrderStatusKey[]), payTypes: arr(args.payTypes, ['ACCOUNT', 'CARD', 'PG'] as const) };

      if (type === 'sales_analysis' || type === 'monthly_report') {
        title = type === 'monthly_report' ? `월간 리포트 (${p.label})` : `매출 분석 (${p.label})`;
        const [day, pay, prod, hour, wk] = await Promise.all(
          (['day', 'payType', 'product', 'hour', 'weekday'] as OrderGroupBy[]).map((g) => api.queryOrders(t, { ...base, groupBy: g, compare: g === 'day', limit: 0 })),
        );
        const diff = day.previous?.amount ? Math.round(((day.totals.amount - day.previous.amount) / day.previous.amount) * 100) : null;
        sections.push({ type: 'kpis', items: [{ label: '주문', value: `${day.totals.count}건` }, { label: '주문 금액', value: won(day.totals.amount), sub: diff !== null ? `직전 동기간 ${diff >= 0 ? '▲' : '▼'}${Math.abs(diff)}%` : undefined }, { label: '결제 완료', value: won(day.totals.paidAmount) }, { label: '객단가', value: won(day.totals.avgAmount) }] });
        sections.push({ type: 'bars', title: '일별 매출', unit: '원', data: day.groups.map((g) => ({ label: g.label, value: g.amount })) });
        sections.push({ type: 'bars', title: '결제수단별', unit: '원', data: pay.groups.map((g) => ({ label: g.label, value: g.amount })) });
        sections.push({ type: 'bars', title: '요일별', unit: '원', data: wk.groups.map((g) => ({ label: g.label, value: g.amount })) });
        sections.push({ type: 'bars', title: '시간대별 주문 수', unit: '건', data: hour.groups.map((g) => ({ label: g.label, value: g.count })) });
        sections.push({ type: 'table', title: '상품별 판매', columns: ['상품', '수량', '금액'], rows: prod.groups.map((g) => [g.label, g.count, g.amount]) });
        if (type === 'monthly_report') {
          const [cust, s] = await Promise.all([api.queryCustomers(t, { from: p.from, to: p.to, limit: 10 }), api.getSettlementSummary(t, monthKey(p.from))]);
          sections.push({ type: 'kpis', items: [{ label: '구매 고객', value: `${cust.totalBuyers}명` }, { label: '재구매율', value: `${cust.repeatRate}%` }, { label: '정산 예정', value: won(s.expectedSettlement) }, { label: '출금 가능', value: won(s.withdrawableAmount) }] });
          sections.push({ type: 'table', title: '단골 고객 TOP 10', columns: ['고객', '횟수', '금액'], rows: cust.items.map((c) => [c.buyer, c.orderCount, c.amount]) });
        }
      } else if (type === 'live_report') {
        const lv = await api.getLiveOrders(t, 'latest');
        const lives = await api.getLives(t, 5);
        if (!lv.stream) return { summary: '최근 방송 기록이 없어요.', data: null };
        title = `방송 리포트 · ${lv.stream.title}`;
        const byHour = await api.queryOrders(t, { from: new Date(lv.stream.startedAt), to: new Date(new Date(lv.stream.startedAt).getTime() + 6 * 3600_000), liveStreamId: lv.stream.id, groupBy: 'payType', limit: 0 });
        sections.push({ type: 'kpis', items: [{ label: '주문서', value: `${lv.orderForm.count}건` }, { label: '주문 금액', value: won(lv.orderForm.amount) }, { label: '미입금', value: `${lv.orderForm.unpaidCount}건`, sub: won(lv.orderForm.unpaidAmount) }, { label: '최고 시청자', value: `${lv.stream.peakViewerCount}명` }] });
        sections.push({ type: 'bars', title: '인기 상품', unit: '원', data: lv.topProducts.map((x) => ({ label: x.name, value: x.amount })) });
        sections.push({ type: 'bars', title: '결제수단', unit: '원', data: byHour.groups.map((g) => ({ label: g.label, value: g.amount })) });
        sections.push({ type: 'table', title: '최근 방송 비교', columns: ['방송', '주문', '금액', '시청자'], rows: lives.recent.map((r) => [r.title, r.orderCount, r.amount, r.peakViewerCount]) });
      } else if (type === 'order_list') {
        title = `주문 목록 (${p.label})`;
        const d = await api.queryOrders(t, { ...base, limit: 30 });
        sections.push({ type: 'kpis', items: [{ label: '주문', value: `${d.totals.count}건` }, { label: '금액', value: won(d.totals.amount) }] });
        sections.push({ type: 'table', title: '주문 목록', columns: ['주문', '구매자', '전화 뒷자리', '금액', '결제', '상태', '송장', '주문시각'], rows: d.items.map((o) => [o.title, o.buyer, o.phoneLast4, o.amount, PAY_LABEL[o.payType], o.statusLabel, o.tracking ?? '', fmtDateTime(new Date(o.createdAt))]), note: `${d.truncated ? `최근 30건만 표시(전체 ${d.totals.count}건). ` : ''}송장 출력용 전체 목록(이름·주소 포함)은 셀러 관리자 화면 > 주문 관리에서 엑셀로 받으세요.` });
      } else if (type === 'settlement_statement') {
        title = '정산 내역서';
        const toMonth = monthKey(ctx.now);
        const [h, s] = await Promise.all([api.getSettlementHistory(t, addMonths(toMonth, -5), toMonth), api.getSettlementSummary(t, toMonth)]);
        sections.push({ type: 'kpis', items: [{ label: '이번 달 정산 예정', value: won(s.expectedSettlement) }, { label: '출금 가능', value: won(s.withdrawableAmount) }, { label: '수수료율', value: `${s.feeRate}%` }] });
        sections.push({ type: 'table', title: '월별 정산', columns: ['월', '매출', '수수료', '정산 예정(세전)'], rows: h.months.map((m) => [m.month, m.salesAmount, m.commission, m.expectedSettlement]) });
        sections.push({ type: 'table', title: '출금 내역', columns: ['신청일', '신청 금액', '실입금', '상태'], rows: s.recentPayouts.map((x) => [fmtDate(new Date(x.requestedAt)), x.amount, x.actualPayoutAmount, x.statusLabel]) });
        sections.push({ type: 'text', title: '안내', body: s.note + `\n정산 규칙: 결제 완료 후 영업일 ${h.settlementBusinessDays}일 뒤 출금 가능 금액으로 전환.` });
      } else if (type === 'product_list') {
        title = '상품·재고 목록';
        const d = await api.queryProducts(t, { scope: 'ALL', sortBy: 'sales', salesFrom: p.from, salesTo: p.to, limit: 50 });
        sections.push({ type: 'table', title: `상품 (판매: ${p.label})`, columns: ['번호', '상품', '구분', '가격', '재고', '상태', '판매수량', '판매금액'], rows: d.items.map((x) => [x.linkNo ?? '', x.name, x.kind === 'QUICK' ? '주문서용' : '마이샵', x.price, x.useStock ? x.stock : '무제한', x.isActive ? '판매중' : '판매중지', x.soldQty, x.soldAmount]) });
      } else if (type === 'customer_list') {
        title = `단골 고객 (${p.label})`;
        const d = await api.queryCustomers(t, { from: p.from, to: p.to, limit: 20 });
        sections.push({ type: 'kpis', items: [{ label: '구매 고객', value: `${d.totalBuyers}명` }, { label: '재구매', value: `${d.repeatBuyers}명 (${d.repeatRate}%)` }, { label: '신규 팬', value: `${d.newFans}명` }] });
        sections.push({ type: 'table', title: '고객 TOP 20', columns: ['고객', '전화 뒷자리', '구매 횟수', '금액', '최근 구매'], rows: d.items.map((c) => [c.buyer, c.phoneLast4, c.orderCount, c.amount, fmtDate(new Date(c.lastOrderAt))]) });
      } else return { summary: '만들 수 있는 리포트: 매출 분석, 방송 리포트, 월간 리포트, 주문 목록, 정산 내역서, 상품 목록, 단골 고객', data: null };

      const a = await createArtifact(ctx.botUserId, 'REPORT', { title, subtitle: `${ctx.links.SELLERBRICKS?.accountName ?? ''} · ${fmtDateTime(ctx.now)} 기준`, sections, footer: '셀러브릭스 셀러 비서가 만든 결과물입니다.' });
      return {
        summary: `"${title}" 을(를) 만들었어요.\n아래 [결과 열기]에서 표·차트를 보고, 엑셀(CSV) 받기나 PDF 저장을 할 수 있어요. (링크 ${config.resultLinkMinutes}분 유효)`,
        data: { title, url: a.url, expiresAt: a.expiresAt.toISOString(), sectionCount: sections.length },
        link: { label: '결과 열기', url: a.url },
        card: { title, items: [{ title: '표·차트 결과 페이지', description: `엑셀(CSV)·PDF 저장 가능 · ${config.resultLinkMinutes}분 유효` }], button: { label: '결과 열기', url: a.url } },
      };
    },
  },

  {
    name: 'set_preference',
    title: '내 설정 저장',
    description: '셀러 기본 설정을 저장한다. key: unshipped_delay_days(송장 지연 기준일 1~14), product_default_target(DIRECT=마이샵만 / BOTH=마이샵+방송 번호), answer_style(short=짧게 / detailed=자세히). "송장 지연 기준 3일로 해줘" 같은 요청.',
    inputSchema: { type: 'object', properties: { key: { type: 'string', enum: ['unshipped_delay_days', 'product_default_target', 'answer_style'] }, value: { type: 'string' } }, required: ['key', 'value'], additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const key = String(args.key);
      let value = String(args.value ?? '').trim();
      if (key === 'unshipped_delay_days') {
        const n = Math.round(Number(value.replace(/[^\d]/g, '')));
        if (!(n >= 1 && n <= 14)) return { summary: '송장 지연 기준일은 1~14일 사이로 정해 주세요.', data: null };
        value = String(n);
      } else if (key === 'product_default_target') {
        value = /BOTH|둘|방송|번호/.test(value) ? 'BOTH' : 'DIRECT';
      } else if (key === 'answer_style') {
        value = /detail|자세/.test(value) ? 'detailed' : 'short';
      } else return { summary: '저장할 수 없는 설정이에요.', data: null };
      await prisma.sellerPref.upsert({ where: { botUserId_key: { botUserId: ctx.botUserId, key } }, create: { botUserId: ctx.botUserId, key, value }, update: { value } });
      ctx.prefs[key] = value;
      const label: Record<string, string> = {
        unshipped_delay_days: `송장 지연 기준을 ${value}일로`,
        product_default_target: value === 'BOTH' ? '상품 등록 기본 위치를 "마이샵 + 방송 번호"로' : '상품 등록 기본 위치를 "마이샵"으로',
        answer_style: value === 'detailed' ? '답변을 자세하게' : '답변을 짧게',
      };
      return { summary: `${label[key]} 저장했어요.`, data: { key, value } };
    },
  },
];
