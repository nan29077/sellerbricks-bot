// 가짜 셀러브릭스 — 실제 스키마(Order / SocialOrder / SellerQuickProduct / LiveStream / PayoutRequest)
// 모양을 본떠 최근 70일치 데이터를 셀러별로 만들어 낸다. 같은 날·같은 셀러면 항상 같은 값.
// 운영 DB 에는 전혀 접근하지 않는다.
import { prisma } from '../../lib/db.js';
import { config } from '../../lib/config.js';
import { maskName } from '../../lib/mask.js';
import { fmtDate, kstStartOfDay, monthKey } from '../../lib/time.js';
import {
  type CancelRequests,
  type LinkVerifyResult,
  type LiveOrders,
  type OrderGroupSummary,
  type OrderList,
  type OrderListItem,
  type OrderSummary,
  type PayType,
  PlatformError,
  type ProductList,
  type SellerbricksApi,
  type SettlementSummary,
  type TopProducts,
  type UnshippedList,
} from './types.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const MOCK_SELLERS = [
  {
    id: 'mock-seller-1',
    name: '뷰티룸 언니네',
    theme: '뷰티',
    products: [
      ['수분 앰플 50ml', 32000], ['비타민 세럼', 28000], ['선크림 SPF50+', 19000], ['쿠션 팩트 (리필 포함)', 36000],
      ['클렌징 오일', 22000], ['립 틴트 3종 세트', 25000], ['마스크팩 10매', 15000], ['아이크림', 41000],
    ] as [string, number][],
  },
  {
    id: 'mock-seller-2',
    name: '오늘의 패션',
    theme: '패션',
    products: [
      ['캐시미어 니트', 59000], ['와이드 슬랙스', 39000], ['롱 패딩 코트', 129000], ['기모 맨투맨', 33000],
      ['머플러', 19000], ['니트 원피스', 69000], ['데님 팬츠', 45000], ['양털 후리스', 49000],
    ] as [string, number][],
  },
  {
    id: 'mock-seller-3',
    name: '산지직송 농부네',
    theme: '식품',
    products: [
      ['꿀사과 5kg', 35000], ['제주 감귤 10kg', 29000], ['햇밤 2kg', 22000], ['절임배추 20kg', 45000],
      ['고구마 5kg', 25000], ['한우 국거리 1kg', 52000], ['참기름 350ml', 18000], ['곶감 선물세트', 39000],
    ] as [string, number][],
  },
];

const SURNAMES = '김이박최정강조윤장임한오서신권황안송류홍';
const GIVEN = ['민지', '서연', '지우', '하은', '수빈', '지민', '예린', '도윤', '현우', '은지', '소희', '유나', '미경', '정숙', '영희', '수진', '혜원', '지영'];
const NICKS = ['행복맘', '꽃길만', '쇼핑요정', '라방러버', '알뜰살뜰', '하루하루', '봄날', '달빛', '초코', '해피', '민트', '구름', '보리', '콩이맘'];
const CANCEL_REASONS = ['단순 변심', '주소 오입력', '중복 주문', '배송 지연', '옵션 변경'];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type ShipStatus = 'PENDING' | 'PREPARING' | 'SHIPPING' | 'DELIVERED';

interface RawOrder {
  type: 'GENERAL' | 'ORDER_FORM';
  id: string;
  title: string;
  buyerName: string;
  nickname: string;
  phone: string;
  amount: number;
  payType: PayType;
  createdAt: Date;
  paidAt: Date | null;
  ship: ShipStatus;
  tracking: string | null;
  cancel: { status: 'REQUESTED' | 'APPROVED' | 'COMPLETED'; requestedAt: Date; reason: string; amount: number } | null;
  partial: { status: 'REQUESTED' | 'APPROVED' | 'REJECTED'; requestedAt: Date; reason: string; amount: number } | null;
  liveStreamId: string | null;
  items: { idx: number; qty: number }[];
}

interface RawStream {
  id: string;
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  peak: number;
}

interface Dataset {
  seller: (typeof MOCK_SELLERS)[number];
  orders: RawOrder[];
  streams: RawStream[];
  stock: number[];
  payouts: { amount: number; actual: number; status: 'REQUESTED' | 'APPROVED' | 'PAID'; requestedAt: Date }[];
}

const cache = new Map<string, Dataset>();

function generate(accountId: string, now: Date): Dataset {
  const seller = MOCK_SELLERS.find((s) => s.id === accountId);
  if (!seller) throw new PlatformError('LINK_INVALID', '연결된 셀러를 찾을 수 없습니다.');
  const hourKey = Math.floor(now.getTime() / HOUR);
  const ck = `${accountId}:${hourKey}`;
  const hit = cache.get(ck);
  if (hit) return hit;

  const today = kstStartOfDay(now);
  const orders: RawOrder[] = [];
  const streams: RawStream[] = [];
  let seq = 0;

  for (let back = 70; back >= 0; back--) {
    const day = new Date(today.getTime() - back * DAY);
    const r = rng(hashSeed(`${accountId}:${day.toISOString()}`));
    const isLiveDay = r() < 0.5;
    let stream: RawStream | null = null;
    if (isLiveDay) {
      const startedAt = new Date(day.getTime() + 20 * HOUR);
      stream = {
        id: `ls_${accountId.slice(-1)}_${fmtDate(day).replace('/', '')}`,
        title: `${fmtDate(day)} ${seller.theme} 라이브 특가`,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 90 * 60_000),
        peak: 40 + Math.floor(r() * 260),
      };
      if (stream.startedAt <= now) {
        if (stream.endedAt && stream.endedAt > now) stream.endedAt = null; // 방송 중
        streams.push(stream);
      } else stream = null;
    }

    const formCount = stream ? 12 + Math.floor(r() * 24) : 1 + Math.floor(r() * 5);
    const generalCount = Math.floor(r() * 4);
    const total = formCount + generalCount;

    for (let i = 0; i < total; i++) {
      const isForm = i < formCount;
      const createdAt = isForm && stream
        ? new Date(stream.startedAt.getTime() + Math.floor(r() * 150) * 60_000)
        : new Date(day.getTime() + (9 + Math.floor(r() * 14)) * HOUR + Math.floor(r() * 60) * 60_000);
      if (createdAt > now) continue;

      const itemCount = 1 + (r() < 0.25 ? 1 : 0);
      const items: { idx: number; qty: number }[] = [];
      for (let k = 0; k < itemCount; k++) items.push({ idx: Math.floor(r() * seller.products.length), qty: r() < 0.8 ? 1 : 2 });
      const goods = items.reduce((s, it) => s + seller.products[it.idx][1] * it.qty, 0);
      const amount = goods + (goods >= 50000 ? 0 : 3000);

      const payType: PayType = isForm ? (r() < 0.6 ? 'ACCOUNT' : 'CARD') : 'PG';
      const ageH = (now.getTime() - createdAt.getTime()) / HOUR;
      const payProb = payType === 'ACCOUNT' ? (ageH > 24 ? 0.93 : ageH > 3 ? 0.7 : 0.45) : 0.9;
      const paid = r() < payProb;
      const paidAt = paid ? new Date(createdAt.getTime() + (payType === 'ACCOUNT' ? Math.floor(r() * 180) : 2) * 60_000) : null;
      const effPaidAt = paidAt && paidAt > now ? null : paidAt;

      let ship: ShipStatus = 'PENDING';
      let tracking: string | null = null;
      if (effPaidAt) {
        const d = (now.getTime() - effPaidAt.getTime()) / DAY;
        const lazy = d < 7 && r() < 0.08; // 최근 주문 중 송장 누락
        if (lazy || d < 0.8) ship = r() < 0.6 ? 'PENDING' : 'PREPARING';
        else if (d < 3) ship = r() < 0.15 ? 'PREPARING' : 'SHIPPING';
        else ship = r() < 0.2 ? 'SHIPPING' : 'DELIVERED';
        if (ship === 'SHIPPING' || ship === 'DELIVERED') tracking = String(5000_0000_0000 + Math.floor(r() * 9_0000_0000));
      }

      const name = SURNAMES[Math.floor(r() * SURNAMES.length)] + GIVEN[Math.floor(r() * GIVEN.length)];
      const nickname = NICKS[Math.floor(r() * NICKS.length)] + Math.floor(r() * 99);
      const phone = `010-${1000 + Math.floor(r() * 9000)}-${1000 + Math.floor(r() * 9000)}`;

      let cancel: RawOrder['cancel'] = null;
      let partial: RawOrder['partial'] = null;
      if (effPaidAt && r() < 0.04) {
        const reqAt = new Date(effPaidAt.getTime() + Math.floor(r() * 30) * HOUR);
        if (reqAt <= now) {
          const age = (now.getTime() - reqAt.getTime()) / DAY;
          cancel = { status: age < 1 ? 'REQUESTED' : age < 2 ? 'APPROVED' : 'COMPLETED', requestedAt: reqAt, reason: CANCEL_REASONS[Math.floor(r() * CANCEL_REASONS.length)], amount };
        }
      } else if (effPaidAt && payType === 'CARD' && items.length > 1 && r() < 0.3) {
        const reqAt = new Date(effPaidAt.getTime() + Math.floor(r() * 20) * HOUR);
        if (reqAt <= now) {
          const age = (now.getTime() - reqAt.getTime()) / DAY;
          partial = { status: age < 1 ? 'REQUESTED' : r() < 0.85 ? 'APPROVED' : 'REJECTED', requestedAt: reqAt, reason: '일부 상품 품절', amount: seller.products[items[1].idx][1] };
        }
      }

      seq++;
      orders.push({
        type: isForm ? 'ORDER_FORM' : 'GENERAL',
        id: `${isForm ? 'so' : 'od'}_${accountId.slice(-1)}_${seq}`,
        title: isForm ? `${fmtDate(createdAt)} ${nickname}(${name}) 주문건` : `SB${createdAt.getTime().toString().slice(-9)}${seq % 10}`,
        buyerName: name,
        nickname,
        phone,
        amount,
        payType,
        createdAt,
        paidAt: effPaidAt,
        ship,
        tracking,
        cancel,
        partial,
        liveStreamId: isForm && stream ? stream.id : null,
        items,
      });
    }
  }

  // 재고 (일부 상품만 재고 관리)
  const sr = rng(hashSeed(`${accountId}:stock:${today.toISOString()}`));
  const stock = seller.products.map((_, i) => (i % 3 === 0 ? Math.floor(sr() * 6) : i % 3 === 1 ? 10 + Math.floor(sr() * 40) : -1));

  // 출금 이력
  const payouts: Dataset['payouts'] = [
    { amount: 820000, actual: 780000, status: 'PAID', requestedAt: new Date(today.getTime() - 38 * DAY) },
    { amount: 1150000, actual: 1093000, status: 'PAID', requestedAt: new Date(today.getTime() - 9 * DAY) },
  ];
  if (accountId === 'mock-seller-1') payouts.push({ amount: 450000, actual: 427000, status: 'REQUESTED', requestedAt: new Date(today.getTime() - 1 * DAY) });

  const ds: Dataset = { seller, orders, streams, stock, payouts };
  cache.clear();
  cache.set(ck, ds);
  return ds;
}

// ── 공통 계산 ──────────────────────────────────────────

const isCancelled = (o: RawOrder) => !!o.cancel && o.cancel.status !== 'REQUESTED';

function statusLabel(o: RawOrder): string {
  if (o.cancel?.status === 'COMPLETED') return '취소 완료';
  if (o.cancel) return '취소 요청 중';
  if (!o.paidAt) return o.payType === 'ACCOUNT' ? '미입금' : '결제 대기';
  return { PENDING: '결제 완료', PREPARING: '배송 준비', SHIPPING: '배송 중', DELIVERED: '배송 완료' }[o.ship];
}

function groupSummary(list: RawOrder[]): OrderGroupSummary {
  const live = list.filter((o) => !isCancelled(o));
  const canc = list.filter(isCancelled);
  const paid = live.filter((o) => o.paidAt);
  const unpaid = live.filter((o) => !o.paidAt);
  const counts = new Map<string, number>();
  for (const o of list) counts.set(statusLabel(o), (counts.get(statusLabel(o)) || 0) + 1);
  const sum = (a: RawOrder[]) => a.reduce((s, o) => s + o.amount - (o.partial?.status === 'APPROVED' ? o.partial.amount : 0), 0);
  return {
    count: live.length,
    amount: sum(live),
    paidCount: paid.length,
    paidAmount: sum(paid),
    unpaidCount: unpaid.length,
    unpaidAmount: sum(unpaid),
    cancelledCount: canc.length,
    cancelledAmount: canc.reduce((s, o) => s + o.amount, 0),
    statusCounts: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}

function adminUrl(o: RawOrder): string {
  return o.type === 'ORDER_FORM' ? `${config.sellerbricksWebUrl}/seller/order-forms?id=${o.id}` : `${config.sellerbricksWebUrl}/seller/orders?id=${o.id}`;
}

function toItem(o: RawOrder): OrderListItem {
  return {
    type: o.type,
    id: o.id,
    title: o.type === 'ORDER_FORM' ? `${fmtDate(o.createdAt)} ${o.nickname}(${maskName(o.buyerName)}) 주문건` : `일반주문 ${o.title}`,
    buyer: `${o.nickname}(${maskName(o.buyerName)})`,
    phoneLast4: o.phone.slice(-4),
    amount: o.amount,
    payType: o.payType,
    statusLabel: statusLabel(o),
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
    tracking: o.tracking,
    adminUrl: adminUrl(o),
  };
}

function list(items: RawOrder[]): OrderList {
  return { items: items.slice(0, 30).map(toItem), totalCount: items.length, totalAmount: items.reduce((s, o) => s + o.amount, 0) };
}

const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;

function accountOf(token: string): string {
  if (!token.startsWith('mock:')) throw new PlatformError('UNAUTHORIZED', '연결 토큰이 올바르지 않습니다.');
  return token.slice(5);
}

// ── 가짜 API 구현 ──────────────────────────────────────

export class MockSellerbricksApi implements SellerbricksApi {
  constructor(private now: () => Date = () => new Date()) {}

  private ds(token: string) {
    return generate(accountOf(token), this.now());
  }

  async verifyLink(code: string): Promise<LinkVerifyResult> {
    const row = await prisma.mockLinkCode.findUnique({ where: { code } });
    if (!row || row.platform !== 'SELLERBRICKS') throw new PlatformError('LINK_INVALID', '연결 코드가 올바르지 않습니다.');
    await prisma.mockLinkCode.delete({ where: { code } });
    if (row.expiresAt < new Date()) throw new PlatformError('LINK_EXPIRED', '연결 코드 유효시간(5분)이 지났습니다.');
    return { linkToken: `mock:${row.accountId}`, accountId: row.accountId, accountName: row.accountName };
  }

  async revokeLink(): Promise<void> {}

  async getOrderSummary(t: string, from: Date, to: Date): Promise<OrderSummary> {
    const { orders } = this.ds(t);
    const cur = orders.filter((o) => inRange(o.createdAt, from, to));
    // 진행 중인 기간(오늘·이번 주 등)은 지금까지 경과한 시간만큼만 직전 기간과 비교
    const len = Math.min(to.getTime(), this.now().getTime()) - from.getTime();
    const prev = orders.filter((o) => inRange(o.createdAt, new Date(from.getTime() - (to.getTime() - from.getTime())), new Date(from.getTime() - (to.getTime() - from.getTime()) + len)));
    const forms = cur.filter((o) => o.type === 'ORDER_FORM');
    const liveForms = forms.filter((o) => !isCancelled(o));
    const hours = new Array(24).fill(0);
    for (const o of cur) hours[(o.createdAt.getUTCHours() + 9) % 24]++;
    const max = Math.max(...hours);
    const sumAmt = (a: RawOrder[]) => a.filter((o) => !isCancelled(o)).reduce((s, o) => s + o.amount, 0);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      general: groupSummary(cur.filter((o) => o.type === 'GENERAL')),
      orderForm: {
        ...groupSummary(forms),
        account: { count: liveForms.filter((o) => o.payType === 'ACCOUNT').length, amount: sumAmt(liveForms.filter((o) => o.payType === 'ACCOUNT')) },
        card: { count: liveForms.filter((o) => o.payType === 'CARD').length, amount: sumAmt(liveForms.filter((o) => o.payType === 'CARD')) },
      },
      previous: {
        generalAmount: sumAmt(prev.filter((o) => o.type === 'GENERAL')),
        orderFormAmount: sumAmt(prev.filter((o) => o.type === 'ORDER_FORM')),
      },
      peakHour: max > 0 ? hours.indexOf(max) : null,
    };
  }

  async getLiveOrders(t: string, which: 'latest' | 'previous', streamId?: string): Promise<LiveOrders> {
    const { orders, streams, seller } = this.ds(t);
    const sorted = [...streams].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const s = streamId ? sorted.find((x) => x.id === streamId) : sorted[which === 'latest' ? 0 : 1];
    if (!s) return { stream: null, orderForm: groupSummary([]), topProducts: [], recentStreams: [] };
    const so = orders.filter((o) => o.liveStreamId === s.id);
    const prod = new Map<number, { qty: number; amount: number }>();
    for (const o of so.filter((x) => !isCancelled(x)))
      for (const it of o.items) {
        const p = prod.get(it.idx) || { qty: 0, amount: 0 };
        p.qty += it.qty;
        p.amount += seller.products[it.idx][1] * it.qty;
        prod.set(it.idx, p);
      }
    return {
      stream: { id: s.id, title: s.title, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt ? s.endedAt.toISOString() : null, peakViewerCount: s.peak },
      orderForm: groupSummary(so),
      topProducts: [...prod.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5).map(([idx, v]) => ({ name: seller.products[idx][0], ...v })),
      recentStreams: sorted.slice(0, 5).map((x) => ({ id: x.id, title: x.title, startedAt: x.startedAt.toISOString() })),
    };
  }

  async getUnpaidOrders(t: string, from: Date, to: Date): Promise<OrderList> {
    const { orders } = this.ds(t);
    const items = orders
      .filter((o) => inRange(o.createdAt, from, to) && !o.paidAt && !o.cancel)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return list(items);
  }

  async getUnshippedOrders(t: string, delayDays: number): Promise<UnshippedList> {
    const { orders } = this.ds(t);
    const now = this.now();
    const items = orders
      .filter((o) => o.paidAt && !o.cancel && !o.tracking)
      .sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime());
    const delayed = items.filter((o) => now.getTime() - o.paidAt!.getTime() > delayDays * DAY).length;
    return { ...list(items), delayedCount: delayed, delayDays };
  }

  async getCancelRequests(t: string, openOnly: boolean): Promise<CancelRequests> {
    const { orders } = this.ds(t);
    const now = this.now();
    const items: CancelRequests['items'] = [];
    for (const o of orders) {
      if (o.cancel && (!openOnly || o.cancel.status !== 'COMPLETED')) {
        items.push({
          kind: 'FULL', orderType: o.type, title: toItem(o).title, amount: o.cancel.amount,
          statusLabel: { REQUESTED: '관리자 승인 대기', APPROVED: '승인됨 · 환불 처리 중', COMPLETED: '취소 완료' }[o.cancel.status],
          requestedAt: o.cancel.requestedAt.toISOString(), reason: o.cancel.reason, adminUrl: adminUrl(o),
        });
      }
      if (o.partial && (!openOnly || o.partial.status === 'REQUESTED')) {
        items.push({
          kind: 'PARTIAL', orderType: o.type, title: toItem(o).title, amount: o.partial.amount,
          statusLabel: { REQUESTED: '부분취소 승인 대기', APPROVED: '부분취소 완료', REJECTED: '부분취소 반려' }[o.partial.status],
          requestedAt: o.partial.requestedAt.toISOString(), reason: o.partial.reason, adminUrl: adminUrl(o),
        });
      }
    }
    const recent = items
      .filter((i) => now.getTime() - new Date(i.requestedAt).getTime() < 30 * DAY)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return { items: recent.slice(0, 20), openCount: recent.filter((i) => /대기|처리 중/.test(i.statusLabel)).length };
  }

  async getSettlementSummary(t: string, month: string): Promise<SettlementSummary> {
    const { orders, payouts } = this.ds(t);
    const feeRate = 5;
    const net = (o: RawOrder) => (o.amount - (o.partial?.status === 'APPROVED' ? o.partial.amount : 0)) * (1 - feeRate / 100);
    const paidOk = orders.filter((o) => o.paidAt && !isCancelled(o));
    const monthOrders = paidOk.filter((o) => monthKey(o.paidAt!) === month);
    const sales = monthOrders.reduce((s, o) => s + o.amount, 0);
    const expected = monthOrders.reduce((s, o) => s + net(o), 0);
    const now = this.now();
    // 출금 가능액: 마지막 입금 완료 출금 이후 정산 확정(배송 완료 + 결제 7일 경과)된 금액 − 진행 중 출금
    const lastPaid = [...payouts].reverse().find((p) => p.status === 'PAID');
    const since = lastPaid ? lastPaid.requestedAt.getTime() - 7 * DAY : 0;
    const matured = paidOk.filter((o) => o.ship === 'DELIVERED' && o.paidAt!.getTime() >= since && now.getTime() - o.paidAt!.getTime() > 7 * DAY);
    const maturedSum = matured.reduce((s, o) => s + net(o), 0);
    const paidOut = payouts.filter((p) => p.status !== 'PAID').reduce((s, p) => s + p.amount, 0);
    const label = { REQUESTED: '출금 신청됨 · 관리자 확인 대기', APPROVED: '승인됨 · 입금 예정', PAID: '입금 완료' } as const;
    const pending = payouts.find((p) => p.status !== 'PAID');
    return {
      month,
      salesAmount: Math.round(sales),
      expectedSettlement: Math.round(expected),
      feeRate,
      withdrawableAmount: Math.max(0, Math.round((maturedSum - paidOut) / 10) * 10),
      pendingPayout: pending ? { amount: pending.amount, statusLabel: label[pending.status], requestedAt: pending.requestedAt.toISOString() } : null,
      recentPayouts: [...payouts].reverse().map((p) => ({ amount: p.amount, actualPayoutAmount: p.actual, statusLabel: label[p.status], requestedAt: p.requestedAt.toISOString() })),
      note: '정산 예정액은 플랫폼 수수료 차감 후 세전 금액입니다. 비사업자는 출금 시 원천징수 3.3%가 차감됩니다.',
    };
  }

  async getTopProducts(t: string, from: Date, to: Date, limit: number): Promise<TopProducts> {
    const { orders, seller } = this.ds(t);
    const m = new Map<number, { qty: number; amount: number }>();
    for (const o of orders.filter((x) => inRange(x.createdAt, from, to) && x.paidAt && !isCancelled(x)))
      for (const it of o.items) {
        const p = m.get(it.idx) || { qty: 0, amount: 0 };
        p.qty += it.qty;
        p.amount += seller.products[it.idx][1] * it.qty;
        m.set(it.idx, p);
      }
    return {
      items: [...m.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, limit).map(([idx, v]) => ({ name: seller.products[idx][0], linkNo: idx + 1, ...v })),
    };
  }

  async getProducts(t: string, q: { linkNo?: number; keyword?: string; lowStock?: boolean }): Promise<ProductList> {
    const { seller, stock } = this.ds(t);
    let items = seller.products.map(([name, price], i) => ({ linkNo: i + 1, name, price, useStock: stock[i] >= 0, stock: Math.max(0, stock[i]), isActive: true }));
    if (q.linkNo) items = items.filter((p) => p.linkNo === q.linkNo);
    if (q.keyword) items = items.filter((p) => p.name.includes(q.keyword!));
    if (q.lowStock) items = items.filter((p) => p.useStock && p.stock <= 5).sort((a, b) => a.stock - b.stock);
    return { items };
  }

  async searchOrders(t: string, q: string, from: Date, to: Date): Promise<OrderList> {
    const { orders } = this.ds(t);
    const query = q.replace(/\s/g, '');
    const items = orders
      .filter((o) => inRange(o.createdAt, from, to))
      .filter((o) => (/^\d{4}$/.test(query) ? o.phone.endsWith(query) : o.buyerName.includes(query) || o.nickname.includes(query) || o.title.includes(query)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return list(items);
  }
}
