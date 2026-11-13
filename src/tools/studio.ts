// 스토리지 마켓(옛 셀러브릭스 스튜디오) 도구 (읽기 전용) — 시설 검색·예약 가능 시간·내 예약·스튜디오 주문
// 스토리지 마켓 주문은 셀러브릭스 주문과 독립 — 합산하지 않고 [스토리지 마켓 주문]으로 따로 표시한다.
import { fmtDate, kstDate, kstParts, kstStartOfDay, type PeriodKey, PERIOD_KEYS, periodOf, won } from '../lib/time.js';
import { studioApi } from '../platforms/index.js';
import type { BookingStatus, FacilityType } from '../platforms/studio/types.js';
import type { BotTool, ToolContext } from './types.js';

const DAY = 86400_000;
const WD = '일월화수목금토';

function token(ctx: ToolContext): string {
  const l = ctx.links.STUDIO;
  if (!l) throw new Error('NOT_LINKED:STUDIO');
  return l.token;
}

const ymd = (d: Date) => {
  const p = kstParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};
const dayLabel = (date: string) => {
  const d = kstDate(date);
  return d ? `${fmtDate(d)}(${WD[kstParts(d).wd]})` : date;
};

/** 'YYYY-MM-DD' 또는 오늘/내일/모레/요일 → 'YYYY-MM-DD' */
export function resolveDate(v: unknown, now: Date): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const s = v.trim();
  if (kstDate(s)) return s;
  const today = kstStartOfDay(now);
  if (/오늘/.test(s)) return ymd(today);
  if (/내일/.test(s)) return ymd(new Date(today.getTime() + DAY));
  if (/모레/.test(s)) return ymd(new Date(today.getTime() + 2 * DAY));
  const m = s.match(/(다음\s*주\s*)?([일월화수목금토])요일?/);
  if (m) {
    const target = WD.indexOf(m[2]);
    const cur = kstParts(now).wd;
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7;
    if (m[1]) diff += diff <= 7 - cur ? 7 : 0;
    return ymd(new Date(today.getTime() + diff * DAY));
  }
  return undefined;
}

const typeLabel = (t: FacilityType) => (t === 'WAREHOUSE' ? '창고' : '스튜디오');

export const studioTools: BotTool[] = [
  {
    name: 'studio_search_facilities',
    title: '스튜디오·창고 찾기',
    description: '스토리지 마켓에 등록된 라이브 스튜디오·물류 창고를 찾는다. 유형(STUDIO/WAREHOUSE)·지역·품목(의류·코스메틱·식품·생활용품·잡화)·날짜·시작 시각·이용 시간으로 거르고, 날짜를 주면 그날 예약 가능한 시작 시각을 함께 돌려준다. "수요일 화장품 방송 가능한 스튜디오 추천해줘", "성수 스튜디오 내일 오후 비는 곳" 등에 사용. 이용료는 무료.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['STUDIO', 'WAREHOUSE'], description: '스튜디오 또는 창고. 모르면 생략' },
        region: { type: 'string', description: '지역 (예: 성수, 강남, 마포, 성남, 김포)' },
        specialty: { type: 'string', description: '품목 (의류·코스메틱·식품·생활용품·잡화)' },
        date: { type: 'string', description: "날짜 'YYYY-MM-DD'(한국 시간). 요일만 들으면 가장 가까운 그 요일" },
        startTime: { type: 'string', description: "시작 시각 'HH:mm'" },
        hours: { type: 'number', description: '이용 시간(시간)' },
      },
      additionalProperties: false,
    },
    platform: 'STUDIO',
    async run(ctx, args) {
      const date = resolveDate(args.date, ctx.now);
      const region = typeof args.region === 'string' ? args.region.replace(/성수(동)?/, '성동').replace(/(구|시)$/, '') : undefined;
      const r = await (await studioApi()).searchFacilities(token(ctx), {
        type: args.type === 'WAREHOUSE' || args.type === 'STUDIO' ? (args.type as FacilityType) : undefined,
        region,
        specialty: typeof args.specialty === 'string' ? args.specialty.replace(/화장품|뷰티/, '코스메틱').replace(/옷|패션/, '의류') : undefined,
        date,
        startTime: typeof args.startTime === 'string' ? args.startTime : undefined,
        hours: Number(args.hours) || undefined,
        limit: 5,
      });
      if (!r.items.length) return { summary: `조건에 맞는 ${date ? `${dayLabel(date)} 예약 가능한 ` : ''}시설이 없어요. 지역이나 날짜를 바꿔 볼까요?`, data: { date, ...r } };
      const lines = [`${date ? `${dayLabel(date)} 예약 가능한 ` : ''}시설 ${r.totalCount}곳 중 추천`, ''];
      for (const f of r.items) {
        lines.push(`· ${f.name} (${typeLabel(f.type)}, ${f.region}) ${f.rating ? `★${f.rating}` : ''}`.trim());
        lines.push(`  ${f.specialty.join('·')} / ${f.openTime}~${f.closeTime} / 최소 ${f.minHours}시간${f.autoApprove ? ' / 즉시 확정' : ' / 승인 필요'}`);
        if (f.freeSlots.length) lines.push(`  가능 시작: ${f.freeSlots.slice(0, 5).join(', ')}`);
      }
      return {
        summary: lines.join('\n'),
        data: { date, ...r },
        card: {
          title: date ? `${dayLabel(date)} 예약 가능` : '추천 시설',
          items: r.items.slice(0, 5).map((f) => ({ title: f.name, description: `${f.region} · ${f.specialty.join('·')}${f.freeSlots.length ? ` · ${f.freeSlots[0]}~` : ''}` })),
          button: { label: '스토리지 마켓에서 예약', url: r.items[0].detailUrl },
        },
      };
    },
  },
  {
    name: 'studio_availability',
    title: '예약 가능 시간',
    description: '특정 스튜디오·창고의 날짜별 예약 가능 시간과 예약 규칙(예약 단위·최소/최대 이용 시간·최소 몇 시간 전·취소 마감)을 돌려준다. facility 는 시설 id 또는 이름.',
    inputSchema: {
      type: 'object',
      properties: { facility: { type: 'string', description: '시설 id 또는 이름 (예: 성수 라이브룸 A)' }, date: { type: 'string', description: "'YYYY-MM-DD' 또는 내일·수요일" } },
      required: ['facility'],
      additionalProperties: false,
    },
    platform: 'STUDIO',
    async run(ctx, args) {
      const date = resolveDate(args.date, ctx.now) ?? ymd(new Date(kstStartOfDay(ctx.now).getTime() + DAY));
      const a = await (await studioApi()).getAvailability(token(ctx), String(args.facility || ''), date);
      if (a.closed) return { summary: `${a.facility.name}은(는) ${dayLabel(date)} 휴무예요.`, data: a };
      const free = a.slots.filter((s) => s.available);
      const ranges: string[] = [];
      for (const s of free) {
        const last = ranges[ranges.length - 1];
        if (last && last.endsWith(s.start)) ranges[ranges.length - 1] = last.slice(0, 6) + s.end;
        else ranges.push(`${s.start}~${s.end}`);
      }
      return {
        summary: [
          `${a.facility.name} ${dayLabel(date)} 예약 가능 시간`,
          ranges.length ? ranges.join(', ') : '빈 시간이 없어요.',
          `규칙: ${a.rules.bookingUnitMinutes}분 단위, ${a.rules.minHours}~${a.rules.maxHours}시간, ${a.rules.minLeadHours}시간 전까지 예약, 취소는 ${a.rules.cancelDeadlineHours}시간 전까지${a.rules.autoApprove ? ', 즉시 확정' : ', 시설 승인 필요'}`,
        ].join('\n'),
        data: a,
      };
    },
  },
  {
    name: 'studio_my_bookings',
    title: '내 스토리지 마켓 예약',
    description: '셀러의 스토리지 마켓 예약(스튜디오·창고) 목록. scope=upcoming(기본, 오늘부터 30일) / past(지난 30일). status 로 승인 대기(PENDING)·확정(APPROVED) 등만 볼 수 있다.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string', enum: ['upcoming', 'past'], default: 'upcoming' }, status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] } },
      additionalProperties: false,
    },
    platform: 'STUDIO',
    async run(ctx, args) {
      const today = kstStartOfDay(ctx.now);
      const past = args.scope === 'past';
      const from = past ? new Date(today.getTime() - 30 * DAY) : today;
      const to = past ? today : new Date(today.getTime() + 31 * DAY);
      const status = typeof args.status === 'string' ? (args.status as BookingStatus) : undefined;
      const r = await (await studioApi()).getMyBookings(token(ctx), { from, to, status });
      if (!r.items.length) return { summary: past ? '지난 30일 스토리지 마켓 예약이 없어요.' : '다가오는 스토리지 마켓 예약이 없어요.', data: r };
      return {
        summary: [`${past ? '지난' : '다가오는'} 스토리지 마켓 예약 ${r.totalCount}건`, ...r.items.slice(0, 8).map((b) => `· ${dayLabel(b.date)} ${b.start}~${b.end} ${b.facilityName} [${b.statusLabel}]`)].join('\n'),
        data: r,
        card: { title: past ? '지난 예약' : '다가오는 예약', items: r.items.slice(0, 5).map((b) => ({ title: `${dayLabel(b.date)} ${b.start} ${b.facilityName}`, description: b.statusLabel })), button: { label: '예약 관리 열기', url: r.items[0].adminUrl.replace(/\/[^/]+$/, '') } },
      };
    },
  },
  {
    name: 'studio_order_summary',
    title: '스토리지 마켓 주문',
    description: '스토리지 마켓 쪽 주문 집계(건수·금액·결제 완료, 많이 팔린 상품). 셀러브릭스 주문과 별개이므로 합산하지 말고 [스토리지 마켓 주문]으로 따로 말할 것.',
    inputSchema: { type: 'object', properties: { period: { type: 'string', enum: PERIOD_KEYS, default: 'today' } }, additionalProperties: false },
    platform: 'STUDIO',
    async run(ctx, args) {
      const k = PERIOD_KEYS.includes(args.period as PeriodKey) ? (args.period as PeriodKey) : 'today';
      const p = periodOf(k, ctx.now);
      const d = await (await studioApi()).getOrderSummary(token(ctx), p.from, p.to);
      return {
        summary: [`[스토리지 마켓 주문] ${p.label} ${d.orderCount}건 · ${won(d.amount)}`, `  - 결제완료 ${d.paidCount}건 ${won(d.paidAmount)}`, d.topProducts.length ? `  - 많이 팔린 상품: ${d.topProducts.map((x) => `${x.name} ${x.qty}개`).join(', ')}` : ''].filter(Boolean).join('\n'),
        data: { period: p.label, ...d },
      };
    },
  },
];
