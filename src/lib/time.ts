// 모든 날짜 계산은 한국 시간(KST, UTC+9) 기준. 서버가 UTC(EC2)여도 동일하게 동작.
const KST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export interface Period {
  from: Date; // 포함
  to: Date; // 미포함
  label: string;
}

export type PeriodKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days';

/** KST 기준 해당 날짜 0시의 UTC Date */
export function kstStartOfDay(d: Date = new Date()): Date {
  const k = new Date(d.getTime() + KST);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST);
}

export function kstParts(d: Date) {
  const k = new Date(d.getTime() + KST);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), wd: k.getUTCDay(), h: k.getUTCHours(), min: k.getUTCMinutes() };
}

export function fmtDate(d: Date): string {
  const p = kstParts(d);
  return `${p.m}/${p.d}`;
}

export function fmtDateTime(d: Date): string {
  const p = kstParts(d);
  return `${p.m}/${p.d} ${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
}

export function periodOf(key: PeriodKey, now: Date = new Date()): Period {
  const today = kstStartOfDay(now);
  const p = kstParts(now);
  const mondayOffset = (p.wd + 6) % 7; // 월요일 시작
  const thisWeek = new Date(today.getTime() - mondayOffset * DAY);
  const thisMonth = new Date(Date.UTC(p.y, p.m - 1, 1) - KST);
  const lastMonth = new Date(Date.UTC(p.y, p.m - 2, 1) - KST);
  switch (key) {
    case 'today':
      return { from: today, to: new Date(today.getTime() + DAY), label: `오늘(${fmtDate(today)})` };
    case 'yesterday': {
      const y = new Date(today.getTime() - DAY);
      return { from: y, to: today, label: `어제(${fmtDate(y)})` };
    }
    case 'this_week':
      return { from: thisWeek, to: new Date(today.getTime() + DAY), label: `이번 주(${fmtDate(thisWeek)}~)` };
    case 'last_week': {
      const lw = new Date(thisWeek.getTime() - 7 * DAY);
      return { from: lw, to: thisWeek, label: `지난주(${fmtDate(lw)}~${fmtDate(new Date(thisWeek.getTime() - DAY))})` };
    }
    case 'this_month':
      return { from: thisMonth, to: new Date(today.getTime() + DAY), label: `이번 달(${p.m}월)` };
    case 'last_month':
      return { from: lastMonth, to: thisMonth, label: `지난달(${kstParts(lastMonth).m}월)` };
    case 'last_7_days':
      return { from: new Date(today.getTime() - 6 * DAY), to: new Date(today.getTime() + DAY), label: '최근 7일' };
    case 'last_30_days':
      return { from: new Date(today.getTime() - 29 * DAY), to: new Date(today.getTime() + DAY), label: '최근 30일' };
  }
}

export const PERIOD_KEYS: PeriodKey[] = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_7_days', 'last_30_days'];

/** 같은 길이의 직전 기간 (비교용) */
export function previousPeriod(p: Period): Period {
  const len = p.to.getTime() - p.from.getTime();
  return { from: new Date(p.from.getTime() - len), to: p.from, label: '직전 동기간' };
}

export function monthKey(d: Date = new Date()): string {
  const p = kstParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

export const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
