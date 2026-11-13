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

export interface SellerbricksApi extends SellerbricksApiV2 {
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


// ═══════════════ v2 — 범용 조회 ═══════════════

export type OrderStatusKey = 'UNPAID' | 'PAID' | 'PREPARING' | 'SHIPPING' | 'DELIVERED' | 'CANCEL_REQUESTED' | 'CANCELLED';
export type OrderGroupBy = 'none' | 'day' | 'weekday' | 'hour' | 'product' | 'live' | 'payType' | 'status' | 'buyer';

export interface OrderQuery {
  from: Date;
  to: Date;
  orderType?: 'ALL' | OrderType;
  payTypes?: PayType[];
  statuses?: OrderStatusKey[];
  liveStreamId?: string; // 'latest' 허용
  productKeyword?: string;
  buyer?: string; // 이름·닉네임·뒷4자리
  minAmount?: number;
  maxAmount?: number;
  groupBy?: OrderGroupBy;
  compare?: boolean; // 직전 동기간 비교
  limit?: number; // 표본 주문 수 (최대 30)
}

export interface OrderQueryResult {
  from: string;
  to: string;
  totals: { count: number; amount: number; paidCount: number; paidAmount: number; avgAmount: number };
  groups: { key: string; label: string; count: number; amount: number }[];
  previous: { count: number; amount: number } | null;
  items: OrderListItem[];
  truncated: boolean;
}

export type ProductKind = 'QUICK' | 'DIRECT'; // QUICK = 간편 상품(주문서 선택용, 평생번호) / DIRECT = 간편 상품(마이샵 진열용)

export interface ProductQuery {
  scope?: 'ALL' | ProductKind;
  keyword?: string;
  linkNo?: number;
  lowStock?: boolean;
  activeOnly?: boolean;
  salesFrom?: Date;
  salesTo?: Date;
  sortBy?: 'sales' | 'stock' | 'price' | 'recent';
  limit?: number;
}

export interface ProductQueryItem {
  kind: ProductKind;
  id: string;
  linkNo: number | null;
  name: string;
  price: number;
  useStock: boolean;
  stock: number;
  isActive: boolean;
  soldQty: number;
  soldAmount: number;
  imageUrl: string | null;
  adminUrl: string;
}

export interface ProductQueryResult {
  items: ProductQueryItem[];
  totalCount: number;
}

export interface CustomerQuery {
  from: Date;
  to: Date;
  sortBy?: 'amount' | 'count';
  limit?: number;
}

export interface CustomerQueryResult {
  totalBuyers: number;
  repeatBuyers: number; // 기간 내 2회 이상 구매
  repeatRate: number; // %
  newFans: number;
  items: { buyer: string; phoneLast4: string; orderCount: number; amount: number; lastOrderAt: string }[];
}

export interface SettlementHistory {
  months: { month: string; salesAmount: number; commission: number; expectedSettlement: number }[];
  settlementBusinessDays: number; // 결제완료 후 영업일 N일 뒤 정산 가능
}

export interface LiveList {
  upcoming: { id: string; title: string; scheduledAt: string }[];
  recent: { id: string; title: string; startedAt: string; endedAt: string | null; peakViewerCount: number; orderCount: number; amount: number; paidAmount: number }[];
}

export interface ShopActivity {
  liveNow: { id: string; title: string; startedAt: string } | null;
  nextLive: { id: string; title: string; scheduledAt: string } | null;
  moMessages: { today: number; last7Days: number }; // MO 평생번호 문자 주문 접수
  alimtalkCredit: number;
  unansweredReviews: { count: number; items: { product: string; rating: number; text: string; createdAt: string }[] };
  unreadProductChats: { count: number; items: { product: string; text: string; createdAt: string }[] };
  newFans: { last7Days: number; total: number };
  visitors: { today: number; yesterday: number; last7Days: number };
}

export interface SellerDefaults {
  shopName: string;
  shopUrl: string;
  shippingFee: number; // 셀러 기본 배송비
  freeShippingThreshold: number | null;
}

// ═══════════════ v2 — 쓰기 (상품 등록) ═══════════════

export interface NewProductInput {
  name: string;
  price: number;
  description?: string;
  images?: string[]; // uploadImage 로 받은 URL
  stock: number | null; // null = 재고 관리 안 함
  shippingFee: number;
  options?: { name: string; values: { label: string; addPrice: number; soldOut: boolean }[] }[];
  idempotencyKey: string; // 같은 키로 두 번 오면 한 번만 등록
}

export interface CreatedProduct {
  kind: ProductKind;
  id: string;
  linkNo: number | null;
  adminUrl: string;
  shopUrl: string | null;
}

export interface SellerbricksApiV2 {
  queryOrders(t: string, q: OrderQuery): Promise<OrderQueryResult>;
  queryProducts(t: string, q: ProductQuery): Promise<ProductQueryResult>;
  queryCustomers(t: string, q: CustomerQuery): Promise<CustomerQueryResult>;
  getSettlementHistory(t: string, fromMonth: string, toMonth: string): Promise<SettlementHistory>;
  getLives(t: string, limit: number): Promise<LiveList>;
  getShopActivity(t: string): Promise<ShopActivity>;
  getSellerDefaults(t: string): Promise<SellerDefaults>;
  uploadImage(t: string, img: { base64: string; contentType: string }): Promise<{ url: string }>;
  createDirectProduct(t: string, p: NewProductInput): Promise<CreatedProduct>;
  createQuickProduct(t: string, p: NewProductInput): Promise<CreatedProduct>;
  setProductActive(t: string, kind: ProductKind, id: string, active: boolean): Promise<void>;
}

export class PlatformError extends Error {
  constructor(
    public code: 'LINK_INVALID' | 'LINK_EXPIRED' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
  }
}
