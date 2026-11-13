// 관리자 화면 추가 API — 채널(카카오·웹챗·앱) · APK · 웹 세션 · 셀러 차단 · 운영 대시보드 · 비용 · 알림 · MCP 토큰 · 비밀번호
// (routes.ts 의 로그인 확인 안에서 등록된다)
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { CHANNEL_LABEL } from '../channels/profile.js';
import { config } from '../lib/config.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { prisma } from '../lib/db.js';
import { getChannelSettings, getCostSettings, getNotifySettings, isMcpEnabled, kakaoLinks, setSetting } from '../lib/settings.js';
import { periodOf } from '../lib/time.js';
import { compose, KIND_LABEL, type NotifyKind, notifyStatus, runNotifications } from '../notify/engine.js';
import { changeAdminPassword, cleanup, hasCustomPassword, lastCleanup, LOG_RETENTION_DAYS } from '../ops/maintenance.js';
import { APK_DIR, startConfig } from '../webchat/start.js';
import { revokeUserSessions } from '../webchat/session.js';

const KINDS: NotifyKind[] = ['MORNING', 'LIVE_REPORT', 'UNPAID', 'UNSHIPPED', 'CANCEL'];
const b01 = (v: unknown) => (v ? '1' : '0');

export async function adminExtRoutes(api: FastifyInstance) {
  // ── 채널 ──────────────────────────────────────────
  api.get('/admin/api/channels', async () => {
    const ch = await getChannelSettings();
    const apkPath = ch.app.fileName ? resolve(APK_DIR, ch.app.fileName) : '';
    return {
      ...ch,
      kakaoLinks: kakaoLinks(ch.kakao.channelUrl),
      apkExists: !!apkPath && existsSync(apkPath),
      startUrl: `${config.publicBaseUrl}/`,
      webUrl: `${config.publicBaseUrl}/chat`,
      apkUrl: `${config.publicBaseUrl}/download/app.apk`,
      start: await startConfig(),
      sessions: await prisma.webSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    };
  });

  api.post<{ Body: { kakaoEnabled?: boolean; kakaoUrl?: string; webEnabled?: boolean; appEnabled?: boolean; appVersion?: string; appExternalUrl?: string; appNote?: string; notice?: string } }>('/admin/api/channels', async (req, reply) => {
    const b = req.body || {};
    if (b.kakaoUrl !== undefined) {
      const u = b.kakaoUrl.trim();
      if (u && !kakaoLinks(u)) return reply.code(400).send({ error: '카카오 채널 주소는 http://pf.kakao.com/_xxxx 형태로 입력하세요. (카카오톡 채널 관리자센터 → 채널 URL)' });
      await setSetting('channel.kakao.url', u);
    }
    if (b.appExternalUrl !== undefined) {
      const u = b.appExternalUrl.trim();
      if (u && !/^https:\/\/\S+$/.test(u)) return reply.code(400).send({ error: '외부 APK 주소는 https:// 로 시작해야 합니다.' });
      await setSetting('channel.app.externalUrl', u);
    }
    if (b.kakaoEnabled !== undefined) await setSetting('channel.kakao.enabled', b01(b.kakaoEnabled));
    if (b.webEnabled !== undefined) await setSetting('channel.web.enabled', b01(b.webEnabled));
    if (b.appEnabled !== undefined) await setSetting('channel.app.enabled', b01(b.appEnabled));
    if (b.appVersion !== undefined) await setSetting('channel.app.version', b.appVersion.trim().slice(0, 20));
    if (b.appNote !== undefined) await setSetting('channel.app.note', b.appNote.trim().slice(0, 200));
    if (b.notice !== undefined) await setSetting('channel.notice', b.notice.trim().slice(0, 200));
    return { ok: true };
  });

  // APK 올리기 — 본문에 파일 그대로 (Content-Type: application/vnd.android.package-archive), 최대 200MB
  api.addContentTypeParser(['application/vnd.android.package-archive', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: 200 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  api.post<{ Querystring: { version?: string; note?: string }; Body: Buffer }>('/admin/api/channels/apk', { bodyLimit: 200 * 1024 * 1024 }, async (req, reply) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 1024) return reply.code(400).send({ error: 'APK 파일을 선택하세요.' });
    if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) return reply.code(400).send({ error: 'APK(ZIP) 파일이 아닙니다.' });
    const version = String(req.query.version || '').trim().slice(0, 20) || new Date().toISOString().slice(0, 10);
    if (!existsSync(APK_DIR)) mkdirSync(APK_DIR, { recursive: true });
    const fileName = `app-${version.replace(/[^\w.-]/g, '')}-${randomToken(4).replace(/[^\w]/g, '')}.apk`;
    writeFileSync(resolve(APK_DIR, fileName), buf);
    const prev = (await getChannelSettings()).app.fileName;
    await setSetting('channel.app.fileName', fileName);
    await setSetting('channel.app.fileSize', String(buf.length));
    await setSetting('channel.app.version', version);
    await setSetting('channel.app.updatedAt', new Date().toISOString());
    if (req.query.note !== undefined) await setSetting('channel.app.note', String(req.query.note).slice(0, 200));
    // 바로 전 버전 1개만 남기고 정리
    for (const f of readdirSync(APK_DIR)) if (f.endsWith('.apk') && f !== fileName && f !== prev) unlinkSync(resolve(APK_DIR, f));
    return { ok: true, fileName, size: buf.length, version };
  });

  // ── 웹챗·앱 세션 ────────────────────────────────────
  api.get('/admin/api/sessions', async () => {
    const rows = await prisma.webSession.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' }, take: 100, include: { botUser: { include: { links: { select: { platform: true, accountName: true } } } } } });
    return rows.map((r) => ({ id: r.id, client: r.client, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, expiresAt: r.expiresAt, accounts: r.botUser.links.map((l) => l.accountName).join(', ') || '(연결 없음)', device: deviceOf(r.userAgent || '') }));
  });
  api.post<{ Params: { id: string } }>('/admin/api/sessions/:id/revoke', async (req) => {
    await prisma.webSession.updateMany({ where: { id: req.params.id }, data: { revokedAt: new Date() } });
    return { ok: true };
  });

  // ── 셀러 차단 ──────────────────────────────────────
  api.post<{ Params: { id: string }; Body: { reason?: string } }>('/admin/api/users/:id/block', async (req) => {
    await prisma.botUser.update({ where: { id: req.params.id }, data: { blockedAt: new Date(), blockReason: String(req.body?.reason || '').slice(0, 200) || null } });
    await revokeUserSessions(req.params.id);
    await prisma.mcpToken.updateMany({ where: { botUserId: req.params.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  });
  api.post<{ Params: { id: string } }>('/admin/api/users/:id/unblock', async (req) => {
    await prisma.botUser.update({ where: { id: req.params.id }, data: { blockedAt: null, blockReason: null } });
    return { ok: true };
  });

  // ── 운영 대시보드 ──────────────────────────────────
  api.get('/admin/api/ops', async () => {
    const month = periodOf('this_month').from;
    const today = periodOf('today').from;
    const byChannel = await prisma.chatLog.groupBy({ by: ['channel'], where: { createdAt: { gte: month } }, _count: { _all: true }, _avg: { latencyMs: true } });
    const todayBy = await prisma.chatLog.groupBy({ by: ['channel'], where: { createdAt: { gte: today } }, _count: { _all: true } });
    const activeToday = (await prisma.chatLog.groupBy({ by: ['botUserId'], where: { createdAt: { gte: today } } })).length;
    const errors = await prisma.chatLog.count({ where: { createdAt: { gte: month }, error: { not: null } } });
    const tokens = await prisma.chatLog.aggregate({ where: { createdAt: { gte: month } }, _sum: { tokensIn: true, tokensOut: true } });
    const audits = await prisma.adminAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
    const blocked = await prisma.botUser.count({ where: { blockedAt: { not: null } } });
    return {
      channels: ['KAKAO', 'WEB', 'APP', 'TEST', 'MCP'].map((c) => {
        const m = byChannel.find((x) => x.channel === c);
        return { channel: c, label: CHANNEL_LABEL[c], month: m?._count._all ?? 0, today: todayBy.find((x) => x.channel === c)?._count._all ?? 0, avgMs: Math.round(m?._avg.latencyMs ?? 0) };
      }),
      activeToday,
      errors,
      blocked,
      tokensIn: tokens._sum.tokensIn ?? 0,
      tokensOut: tokens._sum.tokensOut ?? 0,
      cost: await getCostSettings(),
      notify: notifyStatus(),
      cleanup: await lastCleanup(),
      retentionDays: LOG_RETENTION_DAYS,
      customPassword: await hasCustomPassword(),
      audits,
    };
  });
  api.post('/admin/api/ops/cleanup', async () => cleanup());

  api.get<{ Querystring: { type?: string } }>('/admin/api/quality', async (req) => {
    const t = req.query.type;
    const where = t === 'warn' ? { checkWarn: { not: null } } : t === 'error' ? { error: { not: null } } : { feedback: -1 };
    const rows = await prisma.chatLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, include: { tools: { select: { tool: true, ok: true } } } });
    return rows.map((r) => ({ id: r.id, at: r.createdAt, channel: r.channel, userText: r.userText, replyText: r.replyText.slice(0, 300), provider: r.provider, model: r.model, checkWarn: r.checkWarn, error: r.error, tools: r.tools.map((x) => x.tool).join(', ') }));
  });

  api.post<{ Body: { dailyPerUser?: number; autoModel?: boolean; claudeLight?: string; gptLight?: string; maxConcurrent?: number } }>('/admin/api/cost', async (req) => {
    const b = req.body || {};
    if (b.dailyPerUser !== undefined) await setSetting('cost.dailyPerUser', String(Math.max(0, Math.floor(Number(b.dailyPerUser) || 0))));
    if (b.autoModel !== undefined) await setSetting('cost.autoModel', b01(b.autoModel));
    if (b.claudeLight?.trim()) await setSetting('cost.claudeLight', b.claudeLight.trim());
    if (b.gptLight?.trim()) await setSetting('cost.gptLight', b.gptLight.trim());
    if (b.maxConcurrent !== undefined) await setSetting('cost.maxConcurrent', String(Math.min(50, Math.max(1, Math.floor(Number(b.maxConcurrent) || 5)))));
    return { ok: true, cost: await getCostSettings() };
  });

  api.post<{ Body: { current?: string; next?: string } }>('/admin/api/password', async (req, reply) => {
    const err = await changeAdminPassword(String(req.body?.current || ''), String(req.body?.next || ''));
    if (err) return reply.code(400).send({ error: err });
    reply.clearCookie('sb_admin', { path: '/' });
    return { ok: true };
  });

  // ── 알림 ──────────────────────────────────────────
  api.get('/admin/api/notify', async () => {
    const rows = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 40, include: { botUser: { include: { links: { select: { accountName: true } } } } } });
    return {
      settings: await getNotifySettings(),
      labels: KIND_LABEL,
      lastRun: notifyStatus(),
      recent: rows.map((n) => ({ id: n.id, at: n.createdAt, kind: n.kind, title: n.title, channel: n.channel, status: n.status, read: !!n.readAt, account: n.botUser.links.map((l) => l.accountName).join(', ') })),
    };
  });
  api.post<{ Body: { enabled?: boolean; morningHour?: number; kinds?: Record<string, boolean>; kakaoMode?: string } }>('/admin/api/notify', async (req) => {
    const b = req.body || {};
    if (b.enabled !== undefined) await setSetting('notify.enabled', b01(b.enabled));
    if (b.morningHour !== undefined) await setSetting('notify.morningHour', String(Math.min(23, Math.max(0, Math.floor(Number(b.morningHour) || 8)))));
    for (const k of KINDS) if (b.kinds && b.kinds[k] !== undefined) await setSetting(`notify.kind.${k}`, b01(b.kinds[k]));
    if (b.kakaoMode === 'MOCK' || b.kakaoMode === 'OFF') await setSetting('notify.kakaoMode', b.kakaoMode);
    return { ok: true, settings: await getNotifySettings() };
  });
  // 미리보기 — 저장하지 않고 내용만 (테스트 채팅 사용자 기준)
  api.post<{ Body: { botUserKey?: string; kind?: string } }>('/admin/api/notify/preview', async (req, reply) => {
    const kind = req.body?.kind as NotifyKind;
    if (!KINDS.includes(kind)) return reply.code(400).send({ error: '알 수 없는 알림' });
    const u = await prisma.botUser.findUnique({ where: { botUserKey: String(req.body?.botUserKey || 'admin-test-user') }, include: { prefs: true } });
    if (!u) return reply.code(404).send({ error: '테스트 사용자가 없습니다. 테스트 채팅에서 먼저 계정을 연결하세요.' });
    const c = await compose(u.id, kind, new Date(), Object.fromEntries(u.prefs.map((p) => [p.key, p.value])));
    return c ?? { empty: true, message: '지금 보낼 내용이 없습니다. (조건에 맞는 주문·방송이 없음)' };
  });
  api.post<{ Body: { kinds?: string[] } }>('/admin/api/notify/run', async (req) => {
    const kinds = (req.body?.kinds ?? KINDS).filter((k): k is NotifyKind => KINDS.includes(k as NotifyKind));
    return runNotifications(new Date(), { force: kinds });
  });

  // ── 외부 AI(MCP) ───────────────────────────────────
  api.get('/admin/api/mcp', async () => {
    const tokens = await prisma.mcpToken.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { botUser: { include: { links: { select: { accountName: true, platform: true } } } } } });
    const users = await prisma.botUser.findMany({ where: { links: { some: {} }, blockedAt: null }, orderBy: { lastSeenAt: 'desc' }, take: 200, include: { links: { select: { accountName: true, platform: true } } } });
    return {
      enabled: await isMcpEnabled(),
      endpoint: `${config.publicBaseUrl}/mcp`,
      tokens: tokens.map((t) => ({ id: t.id, prefix: t.prefix, label: t.label, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, revokedAt: t.revokedAt, accounts: t.botUser.links.map((l) => l.accountName).join(', ') })),
      users: users.map((u) => ({ id: u.id, channel: u.channel, accounts: u.links.map((l) => `${l.accountName}(${l.platform === 'STUDIO' ? '스토리지 마켓' : '셀러브릭스'})`).join(', ') })),
    };
  });
  api.post<{ Body: { enabled?: boolean } }>('/admin/api/mcp', async (req) => {
    await setSetting('mcp.enabled', b01(req.body?.enabled));
    return { ok: true };
  });
  api.post<{ Body: { userId?: string; label?: string } }>('/admin/api/mcp/tokens', async (req, reply) => {
    const u = await prisma.botUser.findUnique({ where: { id: String(req.body?.userId || '') }, include: { links: true } });
    if (!u || !u.links.length) return reply.code(400).send({ error: '계정이 연결된 사용자를 고르세요.' });
    const token = `sbmcp_${randomToken(30)}`;
    await prisma.mcpToken.create({ data: { tokenHash: sha256Hex(token), prefix: token.slice(0, 12), label: String(req.body?.label || '').slice(0, 60) || u.links.map((l) => l.accountName).join(', '), botUserId: u.id } });
    return { ok: true, token, note: '이 토큰은 지금 한 번만 보여요. 안전한 곳에 복사해 두세요.' };
  });
  api.post<{ Params: { id: string } }>('/admin/api/mcp/tokens/:id/revoke', async (req) => {
    await prisma.mcpToken.updateMany({ where: { id: req.params.id }, data: { revokedAt: new Date() } });
    return { ok: true };
  });
}

function deviceOf(ua: string): string {
  if (/SellerbricksBotApp/i.test(ua)) return '안드로이드 앱';
  if (/iPhone|iPad/i.test(ua)) return '아이폰 웹';
  if (/Android/i.test(ua)) return '안드로이드 웹';
  if (/Windows/i.test(ua)) return 'Windows 웹';
  if (/Mac OS/i.test(ua)) return 'Mac 웹';
  return '웹';
}
