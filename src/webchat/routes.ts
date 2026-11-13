// 자체 웹챗·앱 API — 같은 대화 코어(bot.ts)를 쓰고, 입구만 다르다.
// 로그인: 셀러브릭스(또는 스튜디오) 관리자 화면에서 받은 6자리 코드 → 30일 세션 쿠키
// 보안: 세션 쿠키 HttpOnly·SameSite=Lax, 모든 POST 에 X-Requested-With: sbchat 헤더 필수(다른 사이트에서 위조 요청 차단)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { handleMessage, type BotReply } from '../bot.js';
import { config, ROOT } from '../lib/config.js';
import { prisma } from '../lib/db.js';
import { createArtifact, type ReportPayload } from '../lib/artifacts.js';
import { randomToken } from '../lib/crypto.js';
import { getChannelSettings, getNotifySettings, kakaoLinks } from '../lib/settings.js';
import { ensureBotUser, saveLink, unlinkAccount, verifyCode } from '../link/link.js';
import { isPlatformEnabled, PLATFORM_LABEL, type PlatformKey } from '../platforms/index.js';
import { type ChatSession, createSession, endSession, readSession } from './session.js';

const FEEDBACK_LABELS = new Set(['도움 됨', '아쉬워요', '👍', '👎']);
export const NOTIFY_KINDS = [
  { key: 'MORNING', label: '아침 요약', desc: '어제 주문·미입금·송장·취소를 매일 아침 정리' },
  { key: 'LIVE_REPORT', label: '방송 리포트', desc: '방송이 끝나면 실적 요약' },
  { key: 'UNPAID', label: '미입금 알림', desc: '하루 넘게 입금 안 된 주문서' },
  { key: 'UNSHIPPED', label: '송장 지연 알림', desc: '기준일을 넘긴 미발송 주문' },
  { key: 'CANCEL', label: '취소 요청 알림', desc: '처리 안 된 취소 요청' },
] as const;

function pageHeaders(extraImg = '') {
  return {
    'Content-Security-Policy': `default-src 'self'; img-src 'self' data: blob: ${extraImg}; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-cache',
  };
}

export function publicPage(file: string): string {
  const origin = config.publicBaseUrl.replace(/[&"'<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c]!);
  return readFileSync(resolve(ROOT, 'public', file), 'utf8').replaceAll('{{PUBLIC_ORIGIN}}', () => origin);
}

/** 봇 답변 → 웹 화면용 (피드백 버튼은 아이콘으로 따로 그리므로 빠른 답장에서 뺀다) */
export function toWeb(r: BotReply | (Partial<BotReply> & { text: string })) {
  const quick = (r.quickReplies ?? []).filter((q) => !FEEDBACK_LABELS.has(q));
  return {
    id: r.chatLogId ?? null,
    text: r.text,
    card: r.card ?? null,
    basicCard: r.basicCard ?? null,
    link: r.link ?? null,
    quickReplies: quick.slice(0, 8),
    canRate: !!r.chatLogId && r.provider !== 'SYSTEM' && (r.toolLogs?.length ?? 0) > 0,
  };
}

const loginHits = new Map<string, number[]>();
function tooMany(ip: string, limit = 10): boolean {
  const now = Date.now();
  const arr = (loginHits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  loginHits.set(ip, arr);
  if (loginHits.size > 10000) loginHits.delete(loginHits.keys().next().value as string);
  return arr.length > limit;
}

const isPlatform = (p: unknown): p is PlatformKey => p === 'SELLERBRICKS' || p === 'STUDIO';
const codeOk = (c: unknown) => typeof c === 'string' && /^\d{6}$/.test(c.trim());

export async function webchatRoutes(app: FastifyInstance) {
  const imgOrigin = (() => {
    try {
      return new URL(config.publicBaseUrl).origin;
    } catch {
      return '';
    }
  })();

  app.get('/chat', async (_req, reply) => reply.headers(pageHeaders(imgOrigin)).type('text/html; charset=utf-8').send(publicPage('chat.html')));
  app.get('/chat/', async (_req, reply) => reply.redirect('/chat'));
  app.get('/chat/manifest.webmanifest', async (_req, reply) =>
    reply.type('application/manifest+json; charset=utf-8').header('Cache-Control', 'public, max-age=3600').send({
      name: 'AI 셀러 비서 · 셀러브릭스',
      short_name: 'AI 셀러 비서',
      description: '주문·정산·방송·스튜디오를 대화로 확인하는 셀러브릭스 AI 비서',
      start_url: '/chat?source=pwa',
      scope: '/chat',
      display: 'standalone',
      background_color: '#f4f7f6',
      theme_color: '#17634c',
      lang: 'ko',
      icons: [
        { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }),
  );
  app.get('/chat/sw.js', async (_req, reply) =>
    reply.headers({ 'Content-Type': 'text/javascript; charset=utf-8', 'Service-Worker-Allowed': '/chat', 'Cache-Control': 'no-cache' }).send(readFileSync(resolve(ROOT, 'public', 'chat-sw.js'))),
  );

  app.register(async (api) => {
    // 위조 요청 차단 + 웹챗 사용 여부
    api.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'sbchat') return reply.code(403).send({ error: '잘못된 요청입니다.' });
      if (req.url.split('?')[0] === '/chat/api/me') return;
      if (!(await getChannelSettings()).web.enabled) return reply.code(503).send({ error: '지금은 웹챗을 이용할 수 없어요. 잠시 후 다시 시도해 주세요.' });
    });

    const need = async (req: FastifyRequest, reply: FastifyReply): Promise<ChatSession | null> => {
      const s = await readSession(req);
      if (!s) {
        reply.code(401).send({ error: '로그인이 필요해요.' });
        return null;
      }
      if (s.user.blockedAt) {
        reply.code(403).send({ error: '이용이 제한된 계정이에요. 셀러브릭스 고객센터로 문의해 주세요.' });
        return null;
      }
      return s;
    };

    api.get('/chat/api/me', async (req) => {
      const ch = await getChannelSettings();
      const studioOpen = await isPlatformEnabled('STUDIO');
      const base = {
        webEnabled: ch.web.enabled,
        studioOpen,
        kakao: ch.kakao.enabled ? kakaoLinks(ch.kakao.channelUrl) : null,
        app: ch.app.enabled && (ch.app.fileName || ch.app.externalUrl) ? { version: ch.app.version, url: `${config.publicBaseUrl}/download/app.apk` } : null,
        startUrl: `${config.publicBaseUrl}/`,
      };
      const s = await readSession(req);
      if (!s) return { ...base, loggedIn: false };
      const links = await prisma.platformLink.findMany({ where: { botUserId: s.user.id }, select: { platform: true, accountName: true, createdAt: true } });
      const unread = await prisma.notification.count({ where: { botUserId: s.user.id, readAt: null } });
      return { ...base, loggedIn: true, blocked: !!s.user.blockedAt, client: s.client, links: links.map((l) => ({ ...l, label: PLATFORM_LABEL[l.platform as PlatformKey] })), unread };
    });

    api.post<{ Body: { platform?: string; code?: string } }>('/chat/api/login', async (req, reply) => {
      if (tooMany(req.ip)) return reply.code(429).send({ error: '시도가 너무 많아요. 1분 뒤 다시 해 주세요.' });
      const platform = req.body?.platform ?? 'SELLERBRICKS';
      const code = String(req.body?.code ?? '').trim();
      if (!isPlatform(platform) || !codeOk(code)) return reply.code(400).send({ error: '6자리 숫자 코드를 입력해 주세요.' });
      const tmpKey = `web:${randomToken(12)}`;
      const r = await verifyCode(platform, code, tmpKey);
      if (!r.ok) return reply.code(400).send({ error: r.message });
      // 같은 계정으로 전에 로그인한 웹 사용자가 있으면 그 사용자로 (휴대폰·PC·앱 대화 기록 공유)
      const existing = await prisma.platformLink.findFirst({ where: { platform, accountId: r.accountId, botUser: { channel: 'WEB' } }, include: { botUser: true }, orderBy: { createdAt: 'desc' } });
      let userId: string;
      if (existing) {
        if (existing.botUser.blockedAt) return reply.code(403).send({ error: '이용이 제한된 계정이에요. 셀러브릭스 고객센터로 문의해 주세요.' });
        userId = existing.botUserId;
      } else userId = (await ensureBotUser(tmpKey, 'WEB')).id;
      await saveLink(userId, platform, r);
      await createSession(req, reply, userId);
      return { ok: true, accountName: r.accountName, platform };
    });

    api.post('/chat/api/logout', async (req, reply) => {
      await endSession(req, reply);
      return { ok: true };
    });

    api.post<{ Body: { text?: string; image?: { base64?: string; contentType?: string } } }>('/chat/api/message', { bodyLimit: 12 * 1024 * 1024 }, async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      const img = req.body?.image;
      if (img?.base64 && img.base64.length > 11_200_000) return reply.code(413).send({ error: '사진은 8MB 이하로 보내 주세요.' });
      const images = img?.base64 ? [{ base64: img.base64, contentType: img.contentType || 'image/jpeg' }] : [];
      const r = await handleMessage({ botUserKey: s.user.botUserKey, text: String(req.body?.text ?? '').slice(0, 500), images, channel: s.client });
      return toWeb(r);
    });

    api.get<{ Querystring: { before?: string } }>('/chat/api/history', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      const before = req.query.before ? new Date(req.query.before) : null;
      const rows = await prisma.chatLog.findMany({
        where: { botUserId: s.user.id, ...(before && !isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      const items = rows.reverse().map((r) => {
        let extra: Record<string, unknown> = {};
        try {
          extra = r.extraJson ? JSON.parse(r.extraJson) : {};
        } catch {
          /* 무시 */
        }
        return {
          at: r.createdAt,
          user: r.userText,
          bot: { ...toWeb({ text: r.replyText, chatLogId: r.id, provider: r.provider as BotReply['provider'], toolLogs: r.provider === 'SYSTEM' ? [] : [{ tool: '', args: {}, ok: true, ms: 0 }], ...(extra as object) }), rated: r.feedback ?? 0 },
        };
      });
      return { items, more: rows.length === 30 };
    });

    api.post<{ Body: { id?: string; value?: number } }>('/chat/api/feedback', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      const v = req.body?.value === 1 ? 1 : req.body?.value === -1 ? -1 : 0;
      const n = await prisma.chatLog.updateMany({ where: { id: String(req.body?.id ?? ''), botUserId: s.user.id }, data: { feedback: v || null } });
      return { ok: n.count > 0 };
    });

    api.post<{ Body: { platform?: string; code?: string } }>('/chat/api/link', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      if (tooMany(req.ip)) return reply.code(429).send({ error: '시도가 너무 많아요. 1분 뒤 다시 해 주세요.' });
      const platform = req.body?.platform;
      const code = String(req.body?.code ?? '').trim();
      if (!isPlatform(platform) || !codeOk(code)) return reply.code(400).send({ error: '6자리 숫자 코드를 입력해 주세요.' });
      const r = await verifyCode(platform, code, s.user.botUserKey);
      if (!r.ok) return reply.code(400).send({ error: r.message });
      await saveLink(s.user.id, platform, r);
      return { ok: true, accountName: r.accountName };
    });

    api.post<{ Body: { platform?: string } }>('/chat/api/unlink', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      if (!isPlatform(req.body?.platform)) return reply.code(400).send({ error: '알 수 없는 계정' });
      const count = await prisma.platformLink.count({ where: { botUserId: s.user.id } });
      const message = await unlinkAccount(s.user.id, req.body.platform);
      // 마지막 계정을 해제하면 로그아웃
      if (count <= 1) await endSession(req, reply);
      return { ok: true, message, loggedOut: count <= 1 };
    });

    api.get('/chat/api/notifications', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      const rows = await prisma.notification.findMany({ where: { botUserId: s.user.id }, orderBy: { createdAt: 'desc' }, take: 30 });
      return rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, linkUrl: n.linkUrl, read: !!n.readAt, at: n.createdAt }));
    });

    api.post('/chat/api/notifications/read', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      await prisma.notification.updateMany({ where: { botUserId: s.user.id, readAt: null }, data: { readAt: new Date() } });
      return { ok: true };
    });

    api.get('/chat/api/prefs', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      const rows = await prisma.sellerPref.findMany({ where: { botUserId: s.user.id, key: { startsWith: 'notify.' } } });
      const m = new Map(rows.map((r) => [r.key, r.value]));
      const ns = await getNotifySettings();
      return { engine: ns.enabled, kinds: NOTIFY_KINDS.filter((k) => ns.kinds[k.key]).map((k) => ({ ...k, on: m.get(`notify.${k.key}`) !== '0' })) };
    });

    api.post<{ Body: { key?: string; on?: boolean } }>('/chat/api/prefs', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      const k = NOTIFY_KINDS.find((x) => x.key === req.body?.key);
      if (!k) return reply.code(400).send({ error: '알 수 없는 설정' });
      const key = `notify.${k.key}`;
      const value = req.body?.on === false ? '0' : '1';
      await prisma.sellerPref.upsert({ where: { botUserId_key: { botUserId: s.user.id, key } }, create: { botUserId: s.user.id, key, value }, update: { value } });
      return { ok: true };
    });

    /** 대화 기록 속 결과물 다시 열기 — 30분이 지났으면 같은 내용으로 새 링크 발급 (본인 결과물만) */
    api.post<{ Body: { url?: string } }>('/chat/api/artifact/reopen', async (req, reply) => {
      const s = await need(req, reply);
      if (!s) return;
      const token = String(req.body?.url ?? '').match(/\/r\/([\w-]{10,})/)?.[1];
      if (!token) return reply.code(400).send({ error: '잘못된 링크' });
      const a = await prisma.artifact.findUnique({ where: { token } });
      if (!a || a.botUserId !== s.user.id) return reply.code(404).send({ error: '결과물을 찾지 못했어요.' });
      if (a.expiresAt > new Date()) return { url: `${config.publicBaseUrl}/r/${a.token}` };
      const n = await createArtifact(s.user.id, a.kind as 'REPORT' | 'TABLE' | 'TEXT', JSON.parse(a.payloadJson) as ReportPayload);
      return { url: n.url, renewed: true };
    });
  });
}
