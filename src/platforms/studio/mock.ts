// 가짜 스토리지 마켓 API — 실제 스토리지 마켓 스키마 모양의 데이터 (시설 8곳, 운영 시간·휴무일·예약 규칙, 셀러별 예약·주문)
// 스토리지 마켓 배포 전 봇 쪽 개발·점검용. 관리자 화면에서 스토리지 마켓 "가짜(MOCK)" 모드일 때 사용.
import { prisma } from '../../lib/db.js';
import { kstDate, kstParts, kstStartOfDay } from '../../lib/time.js';
import { PlatformError, type LinkVerifyResult } from '../sellerbricks/types.js';
import { type Availability, BOOKING_LABEL, type BookingItem, type BookingList, type BookingStatus, type FacilityInfo, type FacilitySearchQuery, type FacilitySearchResult, type StudioApi, type StudioOrderSummary } from './types.js';

const STUDIO_WEB = 'https://studio.sellerbricks.co.kr';
const DAY = 86400_000;

export const MOCK_STUDIO_SELLERS = [
  { id: 'mock-studio-1', name: '뷰티룸 언니네' },
  { id: 'mock-studio-2', name: '패션하우스 지니' },
];

type F = Omit<FacilityInfo, 'detailUrl'> & { weekdays: number[]; blackout: number[] /* 오늘부터 n일 뒤 휴무 */ };

const base = { bookingUnitMinutes: 60, minLeadHours: 3, maxAdvanceDays: 30, cancelDeadlineHours: 24 };
const FACILITIES: F[] = [
  { id: 'fac-sd-01', name: '성수 라이브룸 A', type: 'STUDIO', region: '서울 성동구', specialty: ['코스메틱', '의류'], equipment: ['조명 3개', '크로마키', '4K 카메라', '무선 마이크'], liveSpaceInfo: '12평 화이트 스튜디오, 화장대 2개', openTime: '09:00', closeTime: '22:00', capacity: 6, rating: 4.8, minHours: 2, maxHours: 6, autoApprove: true, weekdays: [1, 2, 3, 4, 5, 6], blackout: [9], ...base },
  { id: 'fac-sd-02', name: '성수 라이브룸 B', type: 'STUDIO', region: '서울 성동구', specialty: ['식품', '생활용품'], equipment: ['조리대', '오버헤드 카메라', '조명 2개'], liveSpaceInfo: '키친 스튜디오 (인덕션·싱크대)', openTime: '10:00', closeTime: '21:00', capacity: 5, rating: 4.6, minHours: 2, maxHours: 5, autoApprove: false, weekdays: [1, 2, 3, 4, 5], blackout: [], ...base },
  { id: 'fac-gn-01', name: '강남 뷰티 스튜디오', type: 'STUDIO', region: '서울 강남구', specialty: ['코스메틱'], equipment: ['링라이트', '메이크업 미러', '4K 카메라'], liveSpaceInfo: '뷰티 전용, 클로즈업 촬영 세트', openTime: '09:00', closeTime: '23:00', capacity: 4, rating: 4.9, minHours: 1, maxHours: 4, autoApprove: true, weekdays: [0, 1, 2, 3, 4, 5, 6], blackout: [3], ...base },
  { id: 'fac-mp-01', name: '망원 패션 라이브홀', type: 'STUDIO', region: '서울 마포구', specialty: ['의류', '잡화'], equipment: ['행거 10대', '전신 거울', '조명 4개', '피팅룸'], liveSpaceInfo: '20평, 런웨이형 동선', openTime: '10:00', closeTime: '22:00', capacity: 10, rating: 4.7, minHours: 2, maxHours: 8, autoApprove: false, weekdays: [1, 2, 3, 4, 5, 6], blackout: [], ...base },
  { id: 'fac-bd-01', name: '분당 리빙 스튜디오', type: 'STUDIO', region: '경기 성남시', specialty: ['생활용품', '식품'], equipment: ['거실 세트', '조명 3개', '테이블'], liveSpaceInfo: '거실·주방 연출 세트', openTime: '09:00', closeTime: '20:00', capacity: 6, rating: 4.5, minHours: 2, maxHours: 6, autoApprove: true, weekdays: [1, 2, 3, 4, 5], blackout: [1], ...base },
  { id: 'fac-gp-01', name: '김포 물류창고 1센터', type: 'WAREHOUSE', region: '경기 김포시', specialty: ['의류', '생활용품', '식품'], equipment: ['상온 랙', '포장대', '지게차'], liveSpaceInfo: '창고 내 간이 라이브 공간 있음', openTime: '08:00', closeTime: '18:00', capacity: 20, rating: 4.4, minHours: 4, maxHours: 10, autoApprove: false, weekdays: [1, 2, 3, 4, 5], blackout: [], ...base },
  { id: 'fac-ic-01', name: '인천 냉장 창고', type: 'WAREHOUSE', region: '인천 서구', specialty: ['식품'], equipment: ['냉장실', '냉동실', '포장대'], liveSpaceInfo: '', openTime: '07:00', closeTime: '19:00', capacity: 15, rating: null, minHours: 4, maxHours: 10, autoApprove: false, weekdays: [1, 2, 3, 4, 5, 6], blackout: [], ...base },
  { id: 'fac-sd-03', name: '성수 미니 스튜디오', type: 'STUDIO', region: '서울 성동구', specialty: ['잡화', '코스메틱'], equipment: ['조명 2개', '스마트폰 거치대'], liveSpaceInfo: '1인 방송용 6평', openTime: '11:00', closeTime: '22:00', capacity: 2, rating: 4.3, minHours: 1, maxHours: 3, autoApprove: true, weekdays: [0, 2, 3, 4, 5, 6], blackout: [], ...base },
];

const info = (f: F): FacilityInfo => {
  const { weekdays: _w, blackout: _b, ...rest } = f;
  return { ...rest, detailUrl: `${STUDIO_WEB}/facilities/${f.id}` };
};

const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ymd = (d: Date) => {
  const p = kstParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function accountOf(token: string): string {
  if (!token.startsWith('mock-studio:')) throw new PlatformError('UNAUTHORIZED', '연결 토큰이 올바르지 않습니다.');
  return token.slice('mock-studio:'.length);
}

export class MockStudioApi implements StudioApi {
  constructor(private now: () => Date = () => new Date()) {}

  /** 다른 셀러들의 예약으로 막힌 시간 (시설·날짜마다 고정된 가짜 값) */
  private taken(f: F, date: string): Set<number> {
    const set = new Set<number>();
    const h = hash(f.id + date);
    const open = hm(f.openTime);
    const close = hm(f.closeTime);
    const hours = (close - open) / 60;
    const count = h % 3; // 0~2건
    for (let i = 0; i < count; i++) {
      const start = open + (((h >> (i * 5)) % Math.max(1, hours - 2)) | 0) * 60;
      for (let m = start; m < Math.min(close, start + 120); m += 60) set.add(m);
    }
    return set;
  }

  private dayOff(f: F, date: string): boolean {
    const d = kstDate(date);
    if (!d) return true;
    const wd = kstParts(d).wd;
    if (!f.weekdays.includes(wd)) return true;
    const offset = Math.round((d.getTime() - kstStartOfDay(this.now()).getTime()) / DAY);
    return f.blackout.includes(offset);
  }

  private slots(f: F, date: string) {
    const open = hm(f.openTime);
    const close = hm(f.closeTime);
    const taken = this.taken(f, date);
    const d = kstDate(date)!;
    const earliest = this.now().getTime() + f.minLeadHours * 3600_000;
    const out: { start: string; end: string; available: boolean }[] = [];
    for (let m = open; m + 60 <= close; m += f.bookingUnitMinutes) {
      const startAt = d.getTime() + m * 60_000;
      out.push({ start: fmt(m), end: fmt(m + f.bookingUnitMinutes), available: !taken.has(m) && startAt >= earliest });
    }
    return out;
  }

  async verifyLink(code: string): Promise<LinkVerifyResult> {
    const row = await prisma.mockLinkCode.findUnique({ where: { code } });
    if (!row || row.platform !== 'STUDIO') throw new PlatformError('LINK_INVALID', '연결 코드가 올바르지 않습니다.');
    await prisma.mockLinkCode.delete({ where: { code } });
    if (row.expiresAt < new Date()) throw new PlatformError('LINK_EXPIRED', '연결 코드 유효시간(5분)이 지났습니다.');
    return { linkToken: `mock-studio:${row.accountId}`, accountId: row.accountId, accountName: row.accountName };
  }

  async revokeLink(): Promise<void> {}

  async searchFacilities(t: string, q: FacilitySearchQuery): Promise<FacilitySearchResult> {
    accountOf(t);
    const region = (q.region || '').replace(/\s+/g, '');
    let list = FACILITIES.filter(
      (f) =>
        (!q.type || f.type === q.type) &&
        (!region || f.region.replace(/\s+/g, '').includes(region) || region.includes(f.region.split(' ')[1] ?? '@')) &&
        (!q.specialty || f.specialty.some((s) => s.includes(q.specialty!) || q.specialty!.includes(s))),
    );
    const hours = Math.max(1, Math.min(10, Number(q.hours) || 0));
    const items = list
      .map((f) => {
        let freeSlots: string[] = [];
        if (q.date) {
          if (this.dayOff(f, q.date)) return null;
          const s = this.slots(f, q.date);
          const need = Math.max(hours || f.minHours, f.minHours);
          freeSlots = s.filter((x, i) => s.slice(i, i + need).length === need && s.slice(i, i + need).every((y) => y.available)).map((x) => x.start);
          if (q.startTime) freeSlots = freeSlots.filter((x) => x === q.startTime);
          if (!freeSlots.length) return null;
        }
        return { ...info(f), freeSlots: freeSlots.slice(0, 8) };
      })
      .filter((x): x is FacilitySearchResult['items'][number] => !!x)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    list = [];
    return { items: items.slice(0, Math.min(10, q.limit || 5)), totalCount: items.length };
  }

  async getAvailability(t: string, facilityId: string, date: string): Promise<Availability> {
    accountOf(t);
    const f = FACILITIES.find((x) => x.id === facilityId || x.name.replace(/\s+/g, '') === facilityId.replace(/\s+/g, ''));
    if (!f) throw new PlatformError('NOT_FOUND', '시설을 찾지 못했습니다.');
    if (!kstDate(date)) throw new PlatformError('BAD_REQUEST', '날짜 형식이 올바르지 않습니다.');
    const closed = this.dayOff(f, date);
    return {
      facility: { id: f.id, name: f.name, type: f.type },
      date,
      closed,
      slots: closed ? [] : this.slots(f, date),
      rules: { bookingUnitMinutes: f.bookingUnitMinutes, minHours: f.minHours, maxHours: f.maxHours, minLeadHours: f.minLeadHours, maxAdvanceDays: f.maxAdvanceDays, autoApprove: f.autoApprove, cancelDeadlineHours: f.cancelDeadlineHours },
    };
  }

  private bookings(account: string): BookingItem[] {
    const today = kstStartOfDay(this.now()).getTime();
    const h = hash(account);
    const plan: [number, number, string, number, BookingStatus][] = [
      [-20, 0, '13:00', 3, 'COMPLETED'],
      [-12, 2, '19:00', 2, 'COMPLETED'],
      [-5, 3, '14:00', 4, 'COMPLETED'],
      [-2, 5, '10:00', 2, 'CANCELLED'],
      [1, 0, '19:00', 3, 'APPROVED'],
      [3, 3, '15:00', 2, 'PENDING'],
      [6, 2, '20:00', 2, 'APPROVED'],
      [10, 5, '09:00', 6, 'PENDING'],
    ];
    return plan.map(([off, fi, start, hours, status], i) => {
      const f = FACILITIES[(fi + h) % FACILITIES.length];
      const date = ymd(new Date(today + off * DAY));
      return { id: `bk-${account}-${i}`, facilityName: f.name, facilityType: f.type, date, start, end: fmt(hm(start) + hours * 60), status, statusLabel: BOOKING_LABEL[status], adminUrl: `${STUDIO_WEB}/seller/bookings/bk-${account}-${i}` };
    });
  }

  async getMyBookings(t: string, q: { from: Date; to: Date; status?: BookingStatus }): Promise<BookingList> {
    const acc = accountOf(t);
    const items = this.bookings(acc)
      .filter((b) => {
        const d = kstDate(b.date)!;
        return d >= kstStartOfDay(q.from) && d < q.to && (!q.status || b.status === q.status);
      })
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return { items: items.slice(0, 30), totalCount: items.length };
  }

  async getOrderSummary(t: string, from: Date, to: Date): Promise<StudioOrderSummary> {
    const acc = accountOf(t);
    const days = Math.max(1, Math.round((Math.min(to.getTime(), this.now().getTime()) - from.getTime()) / DAY));
    const h = hash(acc);
    const orderCount = Math.round(days * (1 + (h % 3)) * 0.7);
    const paidCount = Math.round(orderCount * 0.85);
    const avg = 23000 + (h % 5) * 4000;
    const names = acc.endsWith('2') ? ['니트 가디건', '와이드 슬랙스', '캐시미어 머플러'] : ['수분 앰플 50ml', '선크림 SPF50+', '립 틴트 3종 세트'];
    const topProducts = names.map((name, i) => {
      const qty = Math.max(0, Math.round(paidCount * [0.4, 0.25, 0.15][i]));
      return { name, qty, amount: qty * (avg - i * 3000) };
    });
    return { orderCount, amount: orderCount * avg, paidCount, paidAmount: paidCount * avg, topProducts };
  }
}
