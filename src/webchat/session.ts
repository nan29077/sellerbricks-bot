// 웹챗·앱 로그인 세션 — 쿠키에는 랜덤 토큰, DB 에는 sha256 만 저장. 30일, 쓸 때마다 연장.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/db.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';

export const CHAT_COOKIE = 'sb_chat';
const DAYS = 30;
const DAY = 86400_000;

/** 앱(안드로이드 Capacitor)은 User-Agent 끝에 SellerbricksBotApp 을 붙인다 */
export function clientOf(req: FastifyRequest): 'WEB' | 'APP' {
  return /SellerbricksBotApp/i.test(String(req.headers['user-agent'] || '')) ? 'APP' : 'WEB';
}

export async function createSession(req: FastifyRequest, reply: FastifyReply, botUserId: string) {
  const token = randomToken(32);
  await prisma.webSession.create({
    data: { tokenHash: sha256Hex(token), botUserId, client: clientOf(req), userAgent: String(req.headers['user-agent'] || '').slice(0, 300), expiresAt: new Date(Date.now() + DAYS * DAY) },
  });
  reply.setCookie(CHAT_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: DAYS * 86400, secure: req.protocol === 'https' });
}

export interface ChatSession {
  id: string;
  client: 'WEB' | 'APP';
  user: { id: string; botUserKey: string; blockedAt: Date | null };
}

export async function readSession(req: FastifyRequest): Promise<ChatSession | null> {
  const token = req.cookies[CHAT_COOKIE];
  if (!token || token.length < 20) return null;
  const s = await prisma.webSession.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { botUser: true } });
  if (!s || s.revokedAt || s.expiresAt < new Date()) return null;
  // 하루에 한 번만 갱신 (매 요청마다 쓰지 않음)
  if (Date.now() - s.lastSeenAt.getTime() > 3600_000) {
    await prisma.webSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + DAYS * DAY) } }).catch(() => {});
  }
  return { id: s.id, client: s.client === 'APP' ? 'APP' : 'WEB', user: { id: s.botUser.id, botUserKey: s.botUser.botUserKey, blockedAt: s.botUser.blockedAt } };
}

export async function endSession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[CHAT_COOKIE];
  if (token) await prisma.webSession.updateMany({ where: { tokenHash: sha256Hex(token) }, data: { revokedAt: new Date() } });
  reply.clearCookie(CHAT_COOKIE, { path: '/' });
}

/** 사용자 차단·연결 해제 시 모든 세션 끊기 */
export async function revokeUserSessions(botUserId: string) {
  await prisma.webSession.updateMany({ where: { botUserId, revokedAt: null }, data: { revokedAt: new Date() } });
}
