// 실제 스토리지 마켓(옛 셀러브릭스 스튜디오) 내부 봇 API 클라이언트 — 셀러브릭스와 같은 서명 방식 (docs/04 2장·9장)
import { PlatformError, type LinkVerifyResult } from '../sellerbricks/types.js';
import { signRequest } from '../sellerbricks/http.js';
import type { Availability, BookingList, BookingStatus, FacilitySearchQuery, FacilitySearchResult, StudioApi, StudioOrderSummary } from './types.js';

const PREFIX = '/api/bot/v1';

export class HttpStudioApi implements StudioApi {
  constructor(
    private baseUrl: string,
    private signingKey: string,
    private timeoutMs = 8000,
  ) {
    if (!baseUrl || !signingKey) throw new PlatformError('UNAVAILABLE', '스토리지 마켓 API 주소 또는 서명 키가 설정되지 않았습니다.');
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async call<T>(method: 'GET' | 'POST', path: string, opts: { token?: string; query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== '') qs.set(k, String(v));
    const pathWithQuery = PREFIX + path + (qs.toString() ? `?${qs}` : '');
    const body = opts.body === undefined ? '' : JSON.stringify(opts.body);
    const ts = Math.floor(Date.now() / 1000);
    const headers: Record<string, string> = { 'X-Bot-Timestamp': String(ts), 'X-Bot-Signature': signRequest(this.signingKey, method, pathWithQuery, body, ts) };
    if (body) headers['Content-Type'] = 'application/json';
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    let res: Response;
    try {
      res = await fetch(this.baseUrl + pathWithQuery, { method, headers, body: body || undefined, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new PlatformError('UNAVAILABLE', '스토리지 마켓 서버에 연결하지 못했습니다.');
    }
    let json: { ok?: boolean; data?: T; error?: { code?: string; message?: string } } = {};
    try {
      json = await res.json();
    } catch {
      /* 빈 응답 */
    }
    if (res.ok && json.ok) return json.data as T;
    const code = (json.error?.code as PlatformError['code']) || (res.status === 401 ? 'UNAUTHORIZED' : res.status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE');
    throw new PlatformError(code, json.error?.message || `스토리지 마켓 API 오류 (HTTP ${res.status})`);
  }

  verifyLink(code: string, botUserKey: string) {
    return this.call<LinkVerifyResult>('POST', '/link/verify', { body: { code, botUserKey } });
  }
  async revokeLink(token: string) {
    await this.call('POST', '/link/revoke', { token, body: {} });
  }
  searchFacilities(token: string, q: FacilitySearchQuery) {
    return this.call<FacilitySearchResult>('GET', '/facilities/search', { token, query: { ...q } });
  }
  getAvailability(token: string, facilityId: string, date: string) {
    return this.call<Availability>('GET', `/facilities/${encodeURIComponent(facilityId)}/availability`, { token, query: { date } });
  }
  getMyBookings(token: string, q: { from: Date; to: Date; status?: BookingStatus }) {
    return this.call<BookingList>('GET', '/bookings/mine', { token, query: { from: q.from.toISOString(), to: q.to.toISOString(), status: q.status } });
  }
  getOrderSummary(token: string, from: Date, to: Date) {
    return this.call<StudioOrderSummary>('GET', '/orders/summary', { token, query: { from: from.toISOString(), to: to.toISOString() } });
  }
}
