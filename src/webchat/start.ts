// 시작 페이지 — 셀러가 카카오 채널 / 웹챗(열기·링크 복사) / 안드로이드 앱(APK) 중 고른다. QR 코드 포함.
// 주소: GET /  (배포 후 예: https://bot.sellerbricks.co.kr/)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { config, DATA_DIR } from '../lib/config.js';
import { getChannelSettings, kakaoLinks } from '../lib/settings.js';
import { publicPage } from './routes.js';

export const APK_DIR = resolve(DATA_DIR, 'apk');

export interface StartConfig {
  kakao: { chat: string; add: string } | null;
  web: string | null;
  app: { url: string; version: string; size: number; updatedAt: string; note: string } | null;
  notice: string;
}

export async function startConfig(): Promise<StartConfig> {
  const ch = await getChannelSettings();
  const apkReady = !!ch.app.externalUrl || (!!ch.app.fileName && existsSync(resolve(APK_DIR, ch.app.fileName)));
  return {
    kakao: ch.kakao.enabled ? kakaoLinks(ch.kakao.channelUrl) : null,
    web: ch.web.enabled ? `${config.publicBaseUrl}/chat` : null,
    app: ch.app.enabled && apkReady ? { url: `${config.publicBaseUrl}/download/app.apk`, version: ch.app.version, size: ch.app.fileSize, updatedAt: ch.app.updatedAt, note: ch.app.note } : null,
    notice: ch.notice,
  };
}

const escJson = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export async function startRoutes(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    const cfg = await startConfig();
    const html = publicPage('start.html').replace('{{START_CONFIG}}', () => escJson(cfg).replace(/"/g, '&quot;'));
    return reply
      .headers({
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'Cache-Control': 'no-cache',
      })
      .type('text/html; charset=utf-8')
      .send(html);
  });

  app.get('/start/config', async () => startConfig());

  // QR 코드 (SVG) — for=web | app | kakao
  app.get<{ Querystring: { for?: string } }>('/start/qr.svg', async (req, reply) => {
    const cfg = await startConfig();
    const target = req.query.for === 'app' ? cfg.app?.url : req.query.for === 'kakao' ? cfg.kakao?.chat : cfg.web;
    if (!target) return reply.code(404).send('not found');
    const svg = await QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#10392d', light: '#ffffff' } });
    return reply.header('Cache-Control', 'public, max-age=300').type('image/svg+xml').send(svg);
  });

  // 안드로이드 앱 다운로드 — 관리자 화면에서 올린 최신 APK (또는 외부 주소로 이동)
  const download = async (_req: unknown, reply: import('fastify').FastifyReply) => {
    const ch = await getChannelSettings();
    if (!ch.app.enabled) return reply.code(404).type('text/plain; charset=utf-8').send('지금은 앱을 내려받을 수 없어요.');
    if (ch.app.externalUrl) return reply.redirect(ch.app.externalUrl);
    const file = ch.app.fileName ? resolve(APK_DIR, ch.app.fileName) : '';
    if (!file || !/^[\w.-]+\.apk$/.test(ch.app.fileName) || !existsSync(file)) return reply.code(404).type('text/plain; charset=utf-8').send('앱 파일이 아직 없어요.');
    const name = `sellerbricks-ai-${(ch.app.version || 'latest').replace(/[^\w.-]/g, '')}.apk`;
    return reply
      .headers({ 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': String(statSync(file).size), 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' })
      .send(createReadStream(file));
  };
  app.get('/download/app.apk', download);
  app.get('/app', async (_req, reply) => reply.redirect('/#app'));
}
