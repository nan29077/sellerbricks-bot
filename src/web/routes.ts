// 셀러에게 공개되는 결과 페이지 · CSV · 사진 (추측 불가능한 토큰 링크)
import type { FastifyInstance } from 'fastify';
import { expiredPage, renderArtifactPage, type ReportPayload, tableToCsv } from '../lib/artifacts.js';
import { prisma } from '../lib/db.js';

const SECURITY_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:",
};

export async function webRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>('/r/:token', async (req, reply) => {
    reply.headers(SECURITY_HEADERS);
    const a = await prisma.artifact.findUnique({ where: { token: req.params.token } });
    if (!a) return reply.code(404).type('text/html; charset=utf-8').send(expiredPage());
    if (a.expiresAt < new Date()) return reply.code(410).type('text/html; charset=utf-8').send(expiredPage());
    await prisma.artifact.update({ where: { id: a.id }, data: { views: { increment: 1 }, lastViewAt: new Date() } });
    return reply.type('text/html; charset=utf-8').send(renderArtifactPage(a.token, JSON.parse(a.payloadJson) as ReportPayload, a.expiresAt));
  });

  app.get<{ Params: { token: string; i: string } }>('/r/:token/csv/:i', async (req, reply) => {
    reply.headers(SECURITY_HEADERS);
    const a = await prisma.artifact.findUnique({ where: { token: req.params.token } });
    if (!a || a.expiresAt < new Date()) return reply.code(410).type('text/html; charset=utf-8').send(expiredPage());
    const p = JSON.parse(a.payloadJson) as ReportPayload;
    const s = p.sections[Number(req.params.i)];
    if (!s || s.type !== 'table') return reply.code(404).send('not found');
    const name = encodeURIComponent(`${p.title}_${s.title}.csv`.replace(/[\\/:*?"<>|]/g, '_'));
    return reply.header('Content-Disposition', `attachment; filename*=UTF-8''${name}`).type('text/csv; charset=utf-8').send(tableToCsv(s));
  });

  // 사진 — 카카오 카드 썸네일·상품 등록 미리보기용
  app.get<{ Params: { token: string } }>('/img/:token', async (req, reply) => {
    const img = await prisma.storedImage.findUnique({ where: { token: req.params.token } });
    if (!img) return reply.code(404).send('not found');
    return reply.headers({ 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).type(img.contentType).send(Buffer.from(img.bytes));
  });
}
