// 관리자 화면 API — 비밀번호 로그인 후 사용
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { testAnthropicKey } from '../agent/providers/anthropic.js';
import { testOpenaiKey } from '../agent/providers/openai.js';
import { handleMessage } from '../bot.js';
import { buildResponse } from '../kakao/response.js';
import { config, isDefaultAdminPassword, ROOT } from '../lib/config.js';
import { prisma } from '../lib/db.js';
import { hmacHex, maskKey, safeEqual } from '../lib/crypto.js';
import {
  deleteSetting,
  getApiKey,
  getKakaoSkillSecret,
  getKeyStatus,
  getLlmSettings,
  getPlatformSettings,
  type KeyName,
  MODEL_PRESETS,
  type PlatformMode,
  type Provider,
  setKeyStatus,
  setSecret,
  setSetting,
} from '../lib/settings.js';
import { periodOf } from '../lib/time.js';
import { issueMockLinkCode, unlinkAccount } from '../link/link.js';
import { MOCK_SELLERS } from '../platforms/sellerbricks/mock.js';
import { ALL_TOOLS, mcpToolList } from '../tools/index.js';
import { searchFaq } from '../tools/content.js';

const COOKIE = 'sb_admin';
const SESSION_HOURS = 12;

function makeSession(): string {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  return `${exp}.${hmacHex(config.appSecret, `admin:${exp}`)}`;
}

function validSession(v?: string): boolean {
  if (!v) return false;
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, hmacHex(config.appSecret, `admin:${exp}`));
}

const loginHits = new Map<string, number[]>();

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!validSession(req.cookies[COOKIE])) return reply.code(401).send({ error: '로그인이 필요합니다.' });
}

async function keyInfo(name: KeyName) {
  const { key, source } = await getApiKey(name);
  const st = await getKeyStatus(name);
  return { masked: maskKey(key), source, ...st };
}

async function testKey(name: KeyName) {
  const { key } = await getApiKey(name);
  if (!key) return { status: 'NONE', message: '키가 없습니다.' };
  const r = name === 'anthropic' ? await testAnthropicKey(key) : await testOpenaiKey(key);
  await setKeyStatus(name, r.ok ? 'OK' : 'FAIL', r.message);
  return { status: r.ok ? 'OK' : 'FAIL', message: r.message };
}

export async function adminRoutes(app: FastifyInstance) {
  const page = (file: string) => {
    const origin = config.publicBaseUrl.replace(/[&"'<>]/g, (char) => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[char]!));
    return readFileSync(resolve(ROOT, 'public', file), 'utf8').replaceAll('{{PUBLIC_ORIGIN}}', () => origin);
  };

  app.get('/', async (_req, reply) => reply.redirect('/admin'));
  app.get('/admin', async (_req, reply) => reply.type('text/html; charset=utf-8').send(page('admin.html')));
  app.get('/admin/classic', async (_req, reply) => reply.type('text/html; charset=utf-8').send(page('admin-classic.html')));
  const ASSET_TYPES: Record<string, string> = { css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon' };
  app.get<{ Params: { file: string } }>('/assets/:file', async (req, reply) => {
    const file = req.params.file;
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    if (!/^[\w.-]+$/.test(file) || file.startsWith('.') || !ASSET_TYPES[ext]) return reply.code(404).send('not found');
    try {
      return reply.header('Cache-Control', 'public, max-age=300').type(ASSET_TYPES[ext]).send(readFileSync(resolve(ROOT, 'public', file)));
    } catch {
      return reply.code(404).send('not found');
    }
  });

  app.post<{ Body: { password?: string } }>('/admin/api/login', async (req, reply) => {
    const now = Date.now();
    const arr = (loginHits.get(req.ip) || []).filter((t) => now - t < 60_000);
    arr.push(now);
    loginHits.set(req.ip, arr);
    if (arr.length > 10) return reply.code(429).send({ error: '로그인 시도가 너무 많습니다. 1분 뒤 다시 시도하세요.' });
    if (!safeEqual(String(req.body?.password || ''), config.adminPassword)) return reply.code(401).send({ error: '비밀번호가 틀렸습니다.' });
    reply.setCookie(COOKIE, makeSession(), { httpOnly: true, sameSite: 'strict', path: '/', maxAge: SESSION_HOURS * 3600, secure: req.protocol === 'https' });
    return { ok: true };
  });

  app.post('/admin/api/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.register(async (api) => {
    api.addHook('preHandler', requireAdmin);

    // 전체 상태 (화면 첫 로딩)
    api.get('/admin/api/state', async () => {
      const llm = await getLlmSettings();
      const sb = await getPlatformSettings('sellerbricks');
      const st = await getPlatformSettings('studio');
      const monthFrom = periodOf('this_month').from;
      const [up, down, warns] = await Promise.all([
        prisma.chatLog.count({ where: { createdAt: { gte: monthFrom }, feedback: 1 } }),
        prisma.chatLog.count({ where: { createdAt: { gte: monthFrom }, feedback: -1 } }),
        prisma.chatLog.count({ where: { createdAt: { gte: monthFrom }, checkWarn: { not: null } } }),
      ]);
      const [aiCount, totalCount, userCount, linkCount] = await Promise.all([
        prisma.chatLog.count({ where: { createdAt: { gte: monthFrom }, provider: { in: ['CLAUDE', 'GPT'] } } }),
        prisma.chatLog.count({ where: { createdAt: { gte: monthFrom } } }),
        prisma.botUser.count(),
        prisma.platformLink.count(),
      ]);
      const skillPath = `/kakao/skill/${await getKakaoSkillSecret()}`;
      return {
        warnings: [
          ...(isDefaultAdminPassword() ? ['관리자 비밀번호가 기본값입니다. .env에서 ADMIN_PASSWORD를 변경한 뒤 서버를 다시 시작하세요.'] : []),
        ],
        keys: { anthropic: await keyInfo('anthropic'), openai: await keyInfo('openai') },
        llm: { ...llm, presets: MODEL_PRESETS },
        usage: { aiCount, totalCount, userCount, linkCount, feedbackUp: up, feedbackDown: down, numberWarnings: warns },
        publicBaseUrl: config.publicBaseUrl,
        platforms: {
          sellerbricks: { mode: sb.mode, baseUrl: sb.baseUrl, signingKey: maskKey(sb.signingKey) },
          studio: { mode: st.mode, baseUrl: st.baseUrl, signingKey: maskKey(st.signingKey) },
        },
        kakao: { skillPath, exampleUrl: config.publicBaseUrl + skillPath },
        mockSellers: MOCK_SELLERS.map((s) => ({ id: s.id, name: s.name })),
        tools: mcpToolList(ALL_TOOLS),
      };
    });

    // API 키
    api.post<{ Params: { name: string }; Body: { key?: string } }>('/admin/api/keys/:name', async (req, reply) => {
      const name = req.params.name as KeyName;
      if (name !== 'anthropic' && name !== 'openai') return reply.code(400).send({ error: '알 수 없는 키' });
      const key = String(req.body?.key || '').trim();
      if (key.length < 20) return reply.code(400).send({ error: '키가 너무 짧습니다. 전체 키를 붙여넣어 주세요.' });
      await setSecret(`key.${name}`, key);
      await setKeyStatus(name, 'UNTESTED');
      const test = await testKey(name); // 저장 직후 자동 연결 테스트
      return { ok: true, test, info: await keyInfo(name) };
    });

    api.post<{ Params: { name: string } }>('/admin/api/keys/:name/test', async (req, reply) => {
      const name = req.params.name as KeyName;
      if (name !== 'anthropic' && name !== 'openai') return reply.code(400).send({ error: '알 수 없는 키' });
      return { test: await testKey(name), info: await keyInfo(name) };
    });

    api.delete<{ Params: { name: string } }>('/admin/api/keys/:name', async (req, reply) => {
      const name = req.params.name as KeyName;
      if (name !== 'anthropic' && name !== 'openai') return reply.code(400).send({ error: '알 수 없는 키' });
      for (const k of [`key.${name}`, `key.${name}.status`, `key.${name}.message`, `key.${name}.testedAt`]) await deleteSetting(k);
      return { ok: true, info: await keyInfo(name) };
    });

    // AI 선택
    api.post<{ Body: { provider?: string; claudeModel?: string; gptModel?: string; monthlyLimit?: number } }>('/admin/api/llm', async (req, reply) => {
      const b = req.body || {};
      if (b.provider) {
        if (!['CLAUDE', 'GPT', 'MOCK'].includes(b.provider)) return reply.code(400).send({ error: '잘못된 AI 선택' });
        await setSetting('llm.provider', b.provider as Provider);
      }
      if (b.claudeModel?.trim()) await setSetting('llm.claudeModel', b.claudeModel.trim());
      if (b.gptModel?.trim()) await setSetting('llm.gptModel', b.gptModel.trim());
      if (b.monthlyLimit !== undefined) await setSetting('llm.monthlyLimit', String(Math.max(0, Math.floor(Number(b.monthlyLimit) || 0))));
      return { ok: true, llm: await getLlmSettings() };
    });

    // 플랫폼 연결 설정
    api.post<{ Params: { p: string }; Body: { mode?: string; baseUrl?: string; signingKey?: string } }>('/admin/api/platform/:p', async (req, reply) => {
      const p = req.params.p;
      if (p !== 'sellerbricks' && p !== 'studio') return reply.code(400).send({ error: '알 수 없는 플랫폼' });
      const b = req.body || {};
      if (b.mode) {
        if (!['OFF', 'MOCK', 'LIVE'].includes(b.mode)) return reply.code(400).send({ error: '잘못된 모드' });
        if (p === 'studio' && b.mode !== 'OFF') return reply.code(400).send({ error: '스튜디오 연동은 스튜디오 배포 후 열립니다.' });
        if (b.mode === 'LIVE') {
          const cur = await getPlatformSettings(p);
          if (!(b.baseUrl || cur.baseUrl) || !(b.signingKey || cur.signingKey)) return reply.code(400).send({ error: '실제 모드는 API 주소와 서명 키가 필요합니다.' });
        }
        await setSetting(`platform.${p}.mode`, b.mode as PlatformMode);
      }
      if (b.baseUrl !== undefined) await setSetting(`platform.${p}.baseUrl`, b.baseUrl.trim().replace(/\/$/, ''));
      if (b.signingKey?.trim()) await setSecret(`platform.${p}.signingKey`, b.signingKey.trim());
      return { ok: true };
    });

    // 가짜 연결 코드
    api.post<{ Body: { accountId?: string } }>('/admin/api/mock/link-code', async (req) => {
      const r = await issueMockLinkCode(String(req.body?.accountId || ''));
      return { ...r, expiresAt: r.expiresAt.toISOString() };
    });

    // 테스트 채팅
    api.post<{ Body: { botUserKey?: string; text?: string; image?: { base64: string; contentType: string } } }>('/admin/api/chat', { bodyLimit: 12 * 1024 * 1024 }, async (req) => {
      const botUserKey = String(req.body?.botUserKey || 'admin-test-user').slice(0, 64);
      const img = req.body?.image;
      const images = img?.base64 ? [{ base64: img.base64, contentType: img.contentType || 'image/jpeg' }] : [];
      const r = await handleMessage({ botUserKey, text: String(req.body?.text || ''), images, channel: 'TEST' });
      return { reply: r, kakao: buildResponse(r) };
    });

    // 로그
    api.get<{ Querystring: { limit?: string } }>('/admin/api/logs', async (req) => {
      const limit = Math.min(200, Number(req.query.limit) || 50);
      const rows = await prisma.chatLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { tools: true, botUser: true } });
      return rows.map((r) => ({ ...r, botUserKey: r.botUser?.botUserKey ? r.botUser.botUserKey.slice(0, 10) + '…' : '' }));
    });

    // 연결된 사용자
    api.get('/admin/api/users', async () => {
      const users = await prisma.botUser.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 200, include: { links: { select: { platform: true, accountName: true, createdAt: true } } } });
      return users.map((u) => ({ id: u.id, botUserKey: u.botUserKey.length > 16 ? u.botUserKey.slice(0, 12) + '…' : u.botUserKey, lastSeenAt: u.lastSeenAt, links: u.links }));
    });

    api.post<{ Params: { id: string } }>('/admin/api/users/:id/unlink', async (req) => ({ message: await unlinkAccount(req.params.id) }));

    // FAQ 관리
    api.get('/admin/api/faq', async () => prisma.faqDoc.findMany({ orderBy: [{ category: 'asc' }, { createdAt: 'asc' }] }));
    api.post<{ Body: { id?: string; category?: string; question?: string; answer?: string; keywords?: string; isActive?: boolean } }>('/admin/api/faq', async (req, reply) => {
      const b = req.body || {};
      const data = { category: String(b.category || '기타').trim().slice(0, 30), question: String(b.question || '').trim().slice(0, 200), answer: String(b.answer || '').trim().slice(0, 3000), keywords: String(b.keywords || '').trim().slice(0, 300), isActive: b.isActive !== false };
      if (!data.question || !data.answer) return reply.code(400).send({ error: '질문과 답변을 입력하세요.' });
      return b.id ? prisma.faqDoc.update({ where: { id: b.id }, data }) : prisma.faqDoc.create({ data: { ...data, source: '관리자 입력' } });
    });
    api.delete<{ Params: { id: string } }>('/admin/api/faq/:id', async (req) => {
      await prisma.faqDoc.update({ where: { id: req.params.id }, data: { isActive: false } });
      return { ok: true };
    });
    api.post<{ Body: { query?: string } }>('/admin/api/faq/search', async (req) => searchFaq(String(req.body?.query || ''), 5));

    // 결과물 열람 기록
    api.get('/admin/api/artifacts', async () => {
      const rows = await prisma.artifact.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { botUser: { select: { botUserKey: true } } } });
      return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, views: r.views, lastViewAt: r.lastViewAt, expiresAt: r.expiresAt, createdAt: r.createdAt, url: `${config.publicBaseUrl}/r/${r.token}`, botUserKey: r.botUser.botUserKey.slice(0, 12) }));
    });
  });
}
