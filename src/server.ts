import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { config, isDefaultAdminPassword } from './lib/config.js';
import { prisma } from './lib/db.js';
import { getKakaoSkillSecret, getLlmSettings } from './lib/settings.js';
import { adminRoutes } from './admin/routes.js';
import { kakaoRoutes } from './kakao/routes.js';
import { webRoutes } from './web/routes.js';
import { webchatRoutes } from './webchat/routes.js';
import { startRoutes } from './webchat/start.js';
import { mcpRoutes } from './mcp/routes.js';
import { startNotifyScheduler } from './notify/engine.js';
import { startCleanupScheduler } from './ops/maintenance.js';
import { seedFaqIfEmpty } from './lib/faqSeed.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' }, trustProxy: true, bodyLimit: 256 * 1024 });
  await app.register(cookie);
  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: 'sellerbricks-bot', time: new Date().toISOString() };
  });
  await app.register(adminRoutes);
  await app.register(kakaoRoutes);
  await app.register(webRoutes);
  await app.register(webchatRoutes);
  await app.register(startRoutes);
  await app.register(mcpRoutes);
  await seedFaqIfEmpty();
  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  startNotifyScheduler(app.log);
  startCleanupScheduler();
  const llm = await getLlmSettings();
  const line = '─'.repeat(52);
  console.log(`\n${line}`);
  console.log(` sellerbricks-bot 실행 중`);
  console.log(` 시작 페이지 : http://localhost:${config.port}/  (카카오·웹챗·앱 선택)`);
  console.log(` 웹챗        : http://localhost:${config.port}/chat`);
  console.log(` 관리자 화면 : http://localhost:${config.port}/admin`);
  console.log(` 상태 확인   : http://localhost:${config.port}/health`);
  console.log(` 카카오 스킬 : POST /kakao/skill/${await getKakaoSkillSecret()}`);
  console.log(` AI 모드     : ${llm.effective === 'MOCK' ? `가짜 응답 모드 (${llm.reason})` : llm.effective}`);
  if (isDefaultAdminPassword()) console.log(' 관리자 비밀번호가 기본값입니다. .env 의 ADMIN_PASSWORD 를 바꾸세요.');
  console.log(`${line}\n`);
}

const isMain = process.argv[1] && /server\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
