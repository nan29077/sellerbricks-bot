// 스토리지 마켓(옛 셀러브릭스 스튜디오) 내부 봇 API 응답 타입 — docs/04_플랫폼API명세.md 9장. 이 파일이 정답.
// 스토리지 마켓 실제 스키마(Facility·FacilityAvailableSlot·FacilityBlackoutDate·Booking·Order) 모양을 따른다.
import type { LinkVerifyResult } from '../sellerbricks/types.js';

export type FacilityType = 'STUDIO' | 'WAREHOUSE';
export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface FacilityInfo {
  id: string;
  name: string;
  type: FacilityType;
  region: string; // 시·구 (예: 서울 성동구)
  specialty: string[]; // 의류·코스메틱·식품 …
  equipment: string[];
  liveSpaceInfo: string;
  openTime: string; // HH:mm
  closeTime: string;
  capacity: number;
  rating: number | null;
  bookingUnitMinutes: number;
  minHours: number;
  maxHours: number;
  minLeadHours: number;
  maxAdvanceDays: number;
  autoApprove: boolean;
  cancelDeadlineHours: number;
  detailUrl: string;
}

export interface FacilitySearchQuery {
  type?: FacilityType;
  region?: string;
  specialty?: string;
  /** 'YYYY-MM-DD'(KST) — 주면 그날 빈 시간이 있는 곳만 */
  date?: string;
  startTime?: string; // HH:mm
  hours?: number;
  limit?: number;
}

export interface FacilitySearchResult {
  items: (FacilityInfo & { freeSlots: string[] })[]; // freeSlots: date 를 줬을 때 그날 시작 가능한 시각
  totalCount: number;
}

export interface Availability {
  facility: { id: string; name: string; type: FacilityType };
  date: string;
  closed: boolean; // 휴무일
  slots: { start: string; end: string; available: boolean }[];
  rules: { bookingUnitMinutes: number; minHours: number; maxHours: number; minLeadHours: number; maxAdvanceDays: number; autoApprove: boolean; cancelDeadlineHours: number };
}

export interface BookingItem {
  id: string;
  facilityName: string;
  facilityType: FacilityType;
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
  statusLabel: string;
  adminUrl: string;
}

export interface BookingList {
  items: BookingItem[];
  totalCount: number;
}

export interface StudioOrderSummary {
  orderCount: number;
  amount: number;
  paidCount: number;
  paidAmount: number;
  topProducts: { name: string; qty: number; amount: number }[];
}

export interface StudioApi {
  verifyLink(code: string, botUserKey: string): Promise<LinkVerifyResult>;
  revokeLink(linkToken: string): Promise<void>;
  searchFacilities(t: string, q: FacilitySearchQuery): Promise<FacilitySearchResult>;
  getAvailability(t: string, facilityId: string, date: string): Promise<Availability>;
  getMyBookings(t: string, q: { from: Date; to: Date; status?: BookingStatus }): Promise<BookingList>;
  getOrderSummary(t: string, from: Date, to: Date): Promise<StudioOrderSummary>;
}

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  PENDING: '승인 대기',
  APPROVED: '예약 확정',
  REJECTED: '거절됨',
  CANCELLED: '취소됨',
  COMPLETED: '이용 완료',
  NO_SHOW: '노쇼',
};
