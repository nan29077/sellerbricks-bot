// 실제 셀러브릭스 내부 봇 API 클라이언트 — docs/04_플랫폼API명세.md 규격
// 셀러브릭스 쪽 API 가 준비되면 관리자 화면에서 "실제(LIVE)" 로 바꾸고 주소·서명 키만 넣으면 된다.
import { hmacHex, sha256Hex } from '../../lib/crypto.js';
import {
  type CancelRequests,
  type CreatedProduct,
  type CustomerQuery,
  type CustomerQueryResult,
  type LiveList,
  type NewProductInput,
  type OrderQuery,
  type OrderQueryResult,
  type ProductKind,
  type ProductQuery,
  type ProductQueryResult,
  type SellerDefaults,
  type SettlementHistory,
  type ShopActivity,
  type LinkVerifyResult,
  type LiveOrders,
  type OrderList,
  type OrderSummary,
  PlatformError,
  type ProductList,
  type SellerbricksApi,
  type SettlementSummary,
  type TopProducts,
  type UnshippedList,
} from './types.js';

const PREFIX = '/api/bot/v1';

export function signRequest(signingKey: string, method: string, pathWithQuery: string, body: string, ts: number) {
  return hmacHex(signingKey, `${ts}\n${method.toUpperCase()}\n${pathWithQuery}\n${sha256Hex(body)}`);
}

export class HttpSellerbricksApi implements SellerbricksApi {
  constructor(
    private baseUrl: string,
    private signingKey: string,
    private timeoutMs = 8000,
  ) {
    if (!baseUrl || !signingKey) throw new PlatformError('UNAVAILABLE', '셀러브릭스 API 주소 또는 서명 키가 설정되지 않았습니다.');
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async call<T>(method: 'GET' | 'POST', path: string, opts: { token?: string; query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== '') qs.set(k, String(v));
    const pathWithQuery = PREFIX + path + (qs.toString() ? `?${qs}` : '');
    const body = opts.body === undefined ? '' : JSON.stringify(opts.body);
    const ts = Math.floor(Date.now() / 1000);
    const headers: Record<string, string> = {
      'X-Bot-Timestamp': String(ts),
      'X-Bot-Signature': signRequest(this.signingKey, method, pathWithQuery, body, ts),
    };
    if (body) headers['Content-Type'] = 'application/json';
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

    let res: Response;
    try {
      res = await fetch(this.baseUrl + pathWithQuery, { method, headers, body: body || undefined, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new PlatformError('UNAVAILABLE', '셀러브릭스 서버에 연결하지 못했습니다.');
    }
    let json: { ok?: boolean; data?: T; error?: { code?: string; message?: string } } = {};
    try {
      json = await res.json();
    } catch {
      /* 빈 응답 */
    }
    if (res.ok && json.ok) return json.data as T;
    const code = (json.error?.code as PlatformError['code']) || (res.status === 401 ? 'UNAUTHORIZED' : res.status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE');
    throw new PlatformError(code, json.error?.message || `셀러브릭스 API 오류 (HTTP ${res.status})`);
  }

  verifyLink(code: string, botUserKey: string) {
    return this.call<LinkVerifyResult>('POST', '/link/verify', { body: { code, botUserKey } });
  }
  async revokeLink(token: string) {
    await this.call('POST', '/link/revoke', { token, body: {} });
  }
  getOrderSummary(token: string, from: Date, to: Date) {
    return this.call<OrderSummary>('GET', '/orders/summary', { token, query: { from: from.toISOString(), to: to.toISOString() } });
  }
  getLiveOrders(token: string, which: 'latest' | 'previous', streamId?: string) {
    return this.call<LiveOrders>('GET', '/orders/live', { token, query: { which, streamId } });
  }
  getUnpaidOrders(token: string, from: Date, to: Date) {
    return this.call<OrderList>('GET', '/orders/unpaid', { token, query: { from: from.toISOString(), to: to.toISOString() } });
  }
  getUnshippedOrders(token: string, delayDays: number) {
    return this.call<UnshippedList>('GET', '/orders/unshipped', { token, query: { delayDays } });
  }
  getCancelRequests(token: string, openOnly: boolean) {
    return this.call<CancelRequests>('GET', '/orders/cancels', { token, query: { openOnly } });
  }
  getSettlementSummary(token: string, month: string) {
    return this.call<SettlementSummary>('GET', '/settlement/summary', { token, query: { month } });
  }
  getTopProducts(token: string, from: Date, to: Date, limit: number) {
    return this.call<TopProducts>('GET', '/products/top', { token, query: { from: from.toISOString(), to: to.toISOString(), limit } });
  }
  getProducts(token: string, q: { linkNo?: number; keyword?: string; lowStock?: boolean }) {
    return this.call<ProductList>('GET', '/products', { token, query: { linkNo: q.linkNo, keyword: q.keyword, lowStock: q.lowStock } });
  }
  searchOrders(token: string, q: string, from: Date, to: Date) {
    return this.call<OrderList>('GET', '/orders/search', { token, query: { q, from: from.toISOString(), to: to.toISOString() } });
  }

  // ── v2 범용 조회 (POST + JSON 본문, 날짜는 ISO) ──
  queryOrders(token: string, q: OrderQuery) {
    return this.call<OrderQueryResult>('POST', '/query/orders', { token, body: { ...q, from: q.from.toISOString(), to: q.to.toISOString() } });
  }
  queryProducts(token: string, q: ProductQuery) {
    return this.call<ProductQueryResult>('POST', '/query/products', { token, body: { ...q, salesFrom: q.salesFrom?.toISOString(), salesTo: q.salesTo?.toISOString() } });
  }
  queryCustomers(token: string, q: CustomerQuery) {
    return this.call<CustomerQueryResult>('POST', '/query/customers', { token, body: { ...q, from: q.from.toISOString(), to: q.to.toISOString() } });
  }
  getSettlementHistory(token: string, fromMonth: string, toMonth: string) {
    return this.call<SettlementHistory>('GET', '/settlement/history', { token, query: { fromMonth, toMonth } });
  }
  getLives(token: string, limit: number) {
    return this.call<LiveList>('GET', '/lives', { token, query: { limit } });
  }
  getShopActivity(token: string) {
    return this.call<ShopActivity>('GET', '/shop/activity', { token });
  }
  getSellerDefaults(token: string) {
    return this.call<SellerDefaults>('GET', '/seller/defaults', { token });
  }
  // ── v2 쓰기 ──
  uploadImage(token: string, img: { base64: string; contentType: string }) {
    return this.call<{ url: string }>('POST', '/images', { token, body: img });
  }
  createDirectProduct(token: string, p: NewProductInput) {
    return this.call<CreatedProduct>('POST', '/products/direct', { token, body: p });
  }
  createQuickProduct(token: string, p: NewProductInput) {
    return this.call<CreatedProduct>('POST', '/products/quick', { token, body: p });
  }
  async setProductActive(token: string, kind: ProductKind, id: string, active: boolean) {
    await this.call('POST', `/products/${kind.toLowerCase()}/${encodeURIComponent(id)}/active`, { token, body: { active } });
  }
}
