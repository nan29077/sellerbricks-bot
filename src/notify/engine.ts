// 알림 엔진 (2-2차 ⑥) — 아침 요약 · 방송 리포트 · 미입금 · 송장 지연 · 취소 요청
// 웹챗·앱 사용자: 알림함(웹챗 종 아이콘)에 바로 들어간다. (앱 푸시는 Firebase 설정 후 연결 — docs/08)
// 카카오 사용자: 알림톡으로 보내야 하는데, 템플릿 심사·발송은 셀러브릭스 알림톡 모듈을 쓸 예정이라 지금은 "가짜 발송"(기록만).
// 같은 알림은 하루 1번 (dedupeKey). 서버가 5분마다 확인한다.
import { prisma } from '../lib/db.js';
import { getNotifySettings } from '../lib/settings.js';
import { fmtDateTime, kstParts, periodOf, won } from '../lib/time.js';
import { getLinks } from '../link/link.js';
import { sellerbricksApi, studioApi } from '../platforms/index.js';

export type NotifyKind = 'MORNING' | 'LIVE_REPORT' | 'UNPAID' | 'UNSHIPPED' | 'CANCEL';
export const KIND_LABEL: Record<NotifyKind, string> = { MORNING: '아침 요약', LIVE_REPORT: '방송 리포트', UNPAID: '미입금 알림', UNSHIPPED: '송장 지연 알림', CANCEL: '취소 요청 알림' };

export interface Composed {
  kind: NotifyKind;
  title: string;
  body: string;
  linkUrl?: string;
  dedupeKey: string;
}

const ymd = (d: Date) => {
  const p = kstParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};

/** 셀러 1명의 알림 내용 만들기 (보낼 것이 없으면 null) */
export async function compose(botUserId: string, kind: NotifyKind, now: Date, prefs: Record<string, string> = {}): Promise<Composed | null> {
  const links = await getLinks(botUserId);
  const sb = links.SELLERBRICKS?.token;
  const st = links.STUDIO?.token;
  const day = ymd(now);
  const key = (k: string) => `${kind}:${botUserId}:${k}`;
  if (!sb && !(kind === 'MORNING' && st)) return null;

  if (kind === 'MORNING') {
    const lines: string[] = [];
    if (sb) {
      const api = await sellerbricksApi();
      const y = periodOf('yesterday', now);
      const [sum, unpaid, unshipped, cancels, lives] = await Promise.all([
        api.getOrderSummary(sb, y.from, y.to),
        api.getUnpaidOrders(sb, periodOf('last_7_days', now).from, periodOf('today', now).to),
        api.getUnshippedOrders(sb, Number(prefs.unshipped_delay_days) || 3),
        api.getCancelRequests(sb, true),
        api.getLives(sb, 3),
      ]);
      lines.push(`어제 주문: 주문서 ${sum.orderForm.count}건 ${won(sum.orderForm.amount)} · 일반 ${sum.general.count}건 ${won(sum.general.amount)}`);
      lines.push(`미입금 ${unpaid.totalCount}건 · 송장 미입력 ${unshipped.totalCount}건(지연 ${unshipped.delayedCount}) · 취소 요청 ${cancels.openCount}건`);
      const todayLives = lives.upcoming.filter((l) => ymd(new Date(l.scheduledAt)) === day);
      if (todayLives.length) lines.push(`오늘 방송: ${todayLives.map((l) => `${fmtDateTime(new Date(l.scheduledAt)).split(' ')[1]} ${l.title}`).join(', ')}`);
    }
    if (st) {
      const t = periodOf('today', now);
      const b = await (await studioApi()).getMyBookings(st, { from: t.from, to: t.to });
      if (b.items.length) lines.push(`오늘 스토리지 마켓 예약: ${b.items.map((x) => `${x.start} ${x.facilityName}`).join(', ')}`);
    }
    if (!lines.length) return null;
    return { kind, title: '좋은 아침이에요! 오늘의 요약', body: lines.join('\n'), dedupeKey: key(day) };
  }

  const api = await sellerbricksApi();
  if (kind === 'UNPAID') {
    const r = await api.getUnpaidOrders(sb!, periodOf('last_7_days', now).from, periodOf('today', now).to);
    const old = r.items.filter((o) => now.getTime() - new Date(o.createdAt).getTime() > 24 * 3600_000);
    if (!old.length) return null;
    return { kind, title: `하루 넘게 입금 안 된 주문 ${old.length}건`, body: old.slice(0, 3).map((o) => `· ${o.title} ${won(o.amount)}`).join('\n') + (old.length > 3 ? `\n외 ${old.length - 3}건` : ''), linkUrl: old[0].adminUrl, dedupeKey: key(day) };
  }
  if (kind === 'UNSHIPPED') {
    const r = await api.getUnshippedOrders(sb!, Number(prefs.unshipped_delay_days) || 3);
    if (!r.delayedCount) return null;
    return { kind, title: `송장 지연 ${r.delayedCount}건 (결제 후 ${r.delayDays}일 넘음)`, body: r.items.slice(0, 3).map((o) => `· ${o.title} ${won(o.amount)}`).join('\n'), linkUrl: r.items[0]?.adminUrl, dedupeKey: key(day) };
  }
  if (kind === 'CANCEL') {
    const r = await api.getCancelRequests(sb!, true);
    if (!r.openCount) return null;
    return { kind, title: `처리 안 된 취소 요청 ${r.openCount}건`, body: r.items.slice(0, 3).map((c) => `· ${c.title} ${won(c.amount)} (${c.reason || '사유 없음'})`).join('\n'), linkUrl: r.items[0]?.adminUrl, dedupeKey: key(day) };
  }
  // LIVE_REPORT — 끝난 지 6시간 안 된 최근 방송 1건
  const lives = await api.getLives(sb!, 3);
  const ended = lives.recent.find((l) => l.endedAt && now.getTime() - new Date(l.endedAt).getTime() < 6 * 3600_000 && new Date(l.endedAt) <= now);
  if (!ended) return null;
  return {
    kind,
    title: `방송 리포트: ${ended.title}`,
    body: `주문 ${ended.orderCount}건 · ${won(ended.amount)} (결제 완료 ${won(ended.paidAmount)})\n최고 시청자 ${ended.peakViewerCount}명`,
    dedupeKey: `${kind}:${botUserId}:${ended.id}`,
  };
}

/** 지금 보낼 차례인 알림 종류 (한국 시간 기준) */
export function dueKinds(now: Date, morningHour: number): NotifyKind[] {
  const h = kstParts(now).h;
  const kinds: NotifyKind[] = ['LIVE_REPORT'];
  if (h === morningHour) kinds.push('MORNING');
  if (h >= 10 && h <= 20) kinds.push('UNPAID', 'UNSHIPPED', 'CANCEL');
  return kinds;
}

export interface RunResult {
  users: number;
  created: number;
  byKind: Record<string, number>;
  errors: number;
}

/** 한 번 실행 — 연결된 모든 셀러를 확인해 보낼 알림을 만든다 */
export async function runNotifications(now = new Date(), opts: { force?: NotifyKind[]; onlyUserId?: string } = {}): Promise<RunResult> {
  const ns = await getNotifySettings();
  const res: RunResult = { users: 0, created: 0, byKind: {}, errors: 0 };
  if (!ns.enabled && !opts.force) return res;
  const kinds = (opts.force ?? dueKinds(now, ns.morningHour)).filter((k) => ns.kinds[k] || opts.force);
  if (!kinds.length) return res;
  const users = await prisma.botUser.findMany({ where: { blockedAt: null, channel: { in: ['KAKAO', 'WEB'] }, links: { some: {} }, ...(opts.onlyUserId ? { id: opts.onlyUserId } : {}) }, include: { prefs: true } });
  for (const u of users) {
    res.users++;
    const prefs = Object.fromEntries(u.prefs.map((p) => [p.key, p.value]));
    for (const kind of kinds) {
      if (prefs[`notify.${kind}`] === '0') continue;
      try {
        const c = await compose(u.id, kind, now, prefs);
        if (!c) continue;
        if (await prisma.notification.findUnique({ where: { dedupeKey: c.dedupeKey } })) continue;
        const channel = u.channel === 'WEB' ? 'WEB' : 'KAKAO';
        const status = channel === 'WEB' ? 'SENT' : ns.kakaoMode === 'MOCK' ? 'MOCK_SENT' : 'FAILED';
        await prisma.notification.create({ data: { botUserId: u.id, kind, title: c.title, body: c.body, linkUrl: c.linkUrl, channel, status, dedupeKey: c.dedupeKey } });
        res.created++;
        res.byKind[kind] = (res.byKind[kind] ?? 0) + 1;
      } catch {
        res.errors++;
      }
    }
  }
  return res;
}

let timer: NodeJS.Timeout | null = null;
let lastRun: { at: string; result: RunResult } | null = null;
export const notifyStatus = () => lastRun;

export function startNotifyScheduler(log: { warn: (o: unknown, m: string) => void }) {
  if (timer) return;
  const tick = async () => {
    try {
      const r = await runNotifications();
      lastRun = { at: new Date().toISOString(), result: r };
    } catch (e) {
      log.warn({ err: (e as Error).message }, '알림 엔진 실행 오류');
    }
  };
  timer = setInterval(tick, 5 * 60_000);
  timer.unref();
}
