// 셀러브릭스 내부 봇 API 계약 (docs/04_플랫폼API명세.md 와 1:1 대응)
// 가짜(mock) 클라이언트와 실제(http) 클라이언트가 같은 인터페이스를 구현한다.
// 셀러 범위는 linkToken 으로 플랫폼이 강제한다 — 봇은 sellerId 를 직접 보내지 않는다.

export interface LinkVerifyResult {
  linkToken: string;
  accountId: string;
  accountName: string; // 샵 이름
}

export interface StatusCount {
  label: string;
  count: number;
}

/** 주문 묶음 집계 (일반 주문 / 주문서 각각) */
export interface OrderGroupSummary {
  count: number;
  amount: number; // 주문 금액 합계 (취소 제외)
  paidCount: number;
  paidAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
  cancelledCount: number;
  cancelledAmount: number;
  statusCounts: StatusCount[];
}

export interface OrderSummary {
  from: string;
  to: string;
  general: OrderGroupSummary; // 일반 쇼핑몰 주문 (Order)
  orderForm: OrderGroupSummary & {
    // 셀러샵 주문서 (SocialOrder)
    account: { count: number; amount: number }; // 계좌입금
    card: { count: number; amount: number }; // 카드결제
  };
  previous: { generalAmount: number; orderFormAmount: number }; // 직전 동기간
  peakHour: number | null; // 주문이 가장 많은 시간대 (0~23, KST)
}

export type OrderType = 'GENERAL' | 'ORDER_FORM';
export type PayType = 'ACCOUNT' | 'CARD' | 'PG';

export interface OrderListItem {
  type: OrderType;
  id: string;
  title: string; // 주문서 제목 또는 주문번호
  buyer: string; // 가린 이름/닉네임 (홍*동)
  phoneLast4: string;
  amount: number;
  payType: PayType;
  statusLabel: string;
  createdAt: string; // ISO
  paidAt: string | null;
  tracking: string | null;
  adminUrl: string;
}

export interface OrderList {
  items: OrderListItem[];
  totalCount: number;
  totalAmount: number;
}

export interface UnshippedList extends OrderList {
  delayedCount: number; // 결제 후 기준일 넘게 송장 없음
  delayDays: number;
}

export interface LiveStreamInfo {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  peakViewerCount: number;
}

export interface LiveOrders {
  stream: LiveStreamInfo | null;
  orderForm: OrderGroupSummary;
  topProducts: { name: string; qty: number; amount: number }[];
  recentStreams: { id: string; title: string; startedAt: string }[];
}

export interface CancelRequestItem {
  kind: 'FULL' | 'PARTIAL';
  orderType: OrderType;
  title: string;
  amount: number;
  statusLabel: string;
  requestedAt: string;
  reason: string;
  adminUrl: string;
}

export interface CancelRequests {
  items: CancelRequestItem[];
  openCount: number; // 처리 대기 중
}

export interface SettlementSummary {
  month: string; // YYYY-MM
  salesAmount: number; // 이번 달 결제 완료 매출
  expectedSettlement: number; // 정산 예정액 (수수료·취소 차감 후, 세전)
  feeRate: number; // 셀러 플랫폼 수수료율(%)
  withdrawableAmount: number; // 지금 출금 신청 가능한 금액
  pendingPayout: { amount: number; statusLabel: string; requestedAt: string } | null;
  recentPayouts: { amount: number; actualPayoutAmount: number; statusLabel: string; requestedAt: string }[];
  note: string; // 원천징수 등 안내
}

export interface TopProducts {
  items: { name: string; linkNo: number | null; qty: number; amount: number }[];
}

export interface ProductItem {
  linkNo: number | null;
  name: string;
  price: number;
  useStock: boolean;
  stock: number;
  isActive: boolean;
}

export interface ProductList {
  items: ProductItem[];
}

export interface SellerbricksApi {
  verifyLink(code: string, botUserKey: string): Promise<LinkVerifyResult>;
  revokeLink(linkToken: string): Promise<void>;
  getOrderSummary(t: string, from: Date, to: Date): Promise<OrderSummary>;
  getLiveOrders(t: string, which: 'latest' | 'previous', streamId?: string): Promise<LiveOrders>;
  getUnpaidOrders(t: string, from: Date, to: Date): Promise<OrderList>;
  getUnshippedOrders(t: string, delayDays: number): Promise<UnshippedList>;
  getCancelRequests(t: string, openOnly: boolean): Promise<CancelRequests>;
  getSettlementSummary(t: string, month: string): Promise<SettlementSummary>;
  getTopProducts(t: string, from: Date, to: Date, limit: number): Promise<TopProducts>;
  getProducts(t: string, query: { linkNo?: number; keyword?: string; lowStock?: boolean }): Promise<ProductList>;
  searchOrders(t: string, q: string, from: Date, to: Date): Promise<OrderList>;
}

export class PlatformError extends Error {
  constructor(
    public code: 'LINK_INVALID' | 'LINK_EXPIRED' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
  }
}
