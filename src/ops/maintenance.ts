// 운영 (2-2차 ⑧) — 오래된 기록 정리 · 관리자 비밀번호 변경 · 설정 변경 이력
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '../lib/config.js';
import { prisma } from '../lib/db.js';
import { deleteSetting, getSetting, setSetting } from '../lib/settings.js';

const DAY = 86400_000;
export const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || 90);

export interface CleanupResult {
  chatLogs: number;
  artifacts: number;
  images: number;
  sessions: number;
  notifications: number;
  pending: number;
  drafts: number;
  audits: number;
}

/** 대화 로그 90일, 만료 결과물 7일, 사진 30일, 만료 세션, 알림 90일, 오래된 대기 답변·작성 중 상품 정리 */
export async function cleanup(now = new Date()): Promise<CleanupResult> {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  const activeDraftImages = new Set<string>();
  for (const d of await prisma.productDraft.findMany({ where: { status: { in: ['COLLECTING', 'CONFIRM'] }, expiresAt: { gt: now } }, select: { imagesJson: true } })) {
    try {
      for (const t of JSON.parse(d.imagesJson) as string[]) activeDraftImages.add(t);
    } catch {
      /* 무시 */
    }
  }
  const oldImages = await prisma.storedImage.findMany({ where: { createdAt: { lt: before(30) } }, select: { id: true, token: true } });
  const r: CleanupResult = {
    chatLogs: (await prisma.chatLog.deleteMany({ where: { createdAt: { lt: before(LOG_RETENTION_DAYS) } } })).count,
    artifacts: (await prisma.artifact.deleteMany({ where: { expiresAt: { lt: before(7) } } })).count,
    images: (await prisma.storedImage.deleteMany({ where: { id: { in: oldImages.filter((i) => !activeDraftImages.has(i.token)).map((i) => i.id) } } })).count,
    sessions: (await prisma.webSession.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: before(1) } }] } })).count,
    notifications: (await prisma.notification.deleteMany({ where: { createdAt: { lt: before(LOG_RETENTION_DAYS) } } })).count,
    pending: (await prisma.pendingReply.deleteMany({ where: { updatedAt: { lt: before(1) } } })).count,
    drafts: (await prisma.productDraft.deleteMany({ where: { expiresAt: { lt: before(7) } } })).count,
    audits: (await prisma.adminAudit.deleteMany({ where: { createdAt: { lt: before(365) } } })).count,
  };
  await setSetting('ops.lastCleanup', JSON.stringify({ at: now.toISOString(), ...r }));
  return r;
}

export async function lastCleanup(): Promise<(CleanupResult & { at: string }) | null> {
  const v = await getSetting('ops.lastCleanup');
  try {
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

let timer: NodeJS.Timeout | null = null;
export function startCleanupScheduler() {
  if (timer) return;
  const tick = () => cleanup().catch(() => {});
  setTimeout(tick, 60_000).unref();
  timer = setInterval(tick, DAY);
  timer.unref();
}

// ── 관리자 비밀번호 — 관리자 화면에서 바꾸면 .env 값 대신 이 값(scrypt 해시)을 쓴다 ──

function hash(pw: string, salt = randomBytes(16).toString('hex')): string {
  return `scrypt:${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

export async function verifyAdminPassword(pw: string): Promise<boolean> {
  const stored = await getSetting('admin.passwordHash');
  if (!stored) {
    const a = Buffer.from(pw);
    const b = Buffer.from(config.adminPassword);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [, salt, h] = stored.split(':');
  if (!salt || !h) return false;
  const calc = scryptSync(pw, salt, 32);
  const want = Buffer.from(h, 'hex');
  return calc.length === want.length && timingSafeEqual(calc, want);
}

export async function changeAdminPassword(current: string, next: string): Promise<string | null> {
  if (!(await verifyAdminPassword(current))) return '현재 비밀번호가 틀렸습니다.';
  if (next.length < 10 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) return '새 비밀번호는 영문과 숫자를 섞어 10자 이상으로 정해 주세요.';
  if (next === 'admin1234') return '기본 비밀번호는 쓸 수 없습니다.';
  await setSetting('admin.passwordHash', hash(next));
  return null;
}

export async function hasCustomPassword(): Promise<boolean> {
  return !!(await getSetting('admin.passwordHash'));
}

export async function resetAdminPasswordToEnv() {
  await deleteSetting('admin.passwordHash');
}

/** 관리자 세션 서명값에 섞어서, 비밀번호를 바꾸면 기존 로그인은 모두 풀리게 */
export async function sessionSalt(): Promise<string> {
  return (await getSetting('admin.passwordHash')).slice(-16);
}

// ── 설정 변경 이력 ──
export async function audit(action: string, detail = '', ip?: string) {
  await prisma.adminAudit.create({ data: { action: action.slice(0, 100), detail: detail.slice(0, 500), ip } }).catch(() => {});
}
