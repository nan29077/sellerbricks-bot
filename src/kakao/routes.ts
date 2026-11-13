// 카카오 오픈빌더 스킬 서버
// 주소: POST /kakao/skill/<비밀경로>  ← 오픈빌더는 요청에 서명을 붙이지 않으므로 추측 불가능한 비밀 경로로 외부 호출을 막는다.
// 흐름: ① 즉시 처리 명령(연결·도움말)은 바로 응답
//       ② AI 챗봇 콜백이 켜져 있으면(callbackUrl 있음) 5초 안에 useCallback 응답 → 처리 후 callbackUrl 로 결과 전송 (URL 5분 유효·1회용)
//       ③ 콜백 미승인 상태면 4초 안에 끝나는 경우만 바로 응답, 넘으면 "다시 물어봐 주세요" 안내 (가짜 응답 모드는 대부분 즉시 끝남)
import type { FastifyInstance } from 'fastify';
import { handleMessage, isInstantCommand, type BotReply } from '../bot.js';
import { config } from '../lib/config.js';
import { safeEqual } from '../lib/crypto.js';
import { getKakaoSkillSecret } from '../lib/settings.js';
import { buildResponse, callbackAck } from './response.js';

interface SkillPayload {
  userRequest?: {
    utterance?: string;
    callbackUrl?: string;
    user?: { id?: string; properties?: { botUserKey?: string; plusfriendUserKey?: string } };
  };
}

const toKakao = (r: BotReply) => buildResponse(r.text, r.card, r.quickReplies);

export async function sendCallback(callbackUrl: string, body: unknown, log: FastifyInstance['log']) {
  // 카카오가 내려준 callbackUrl 만 허용 (임의 주소로 데이터가 나가지 않도록)
  let host = '';
  try {
    host = new URL(callbackUrl).hostname;
  } catch {
    /* 잘못된 URL */
  }
  if (!/(^|\.)kakao\.com$|(^|\.)kakaoenterprise\.com$/.test(host)) {
    log.warn({ host }, 'callbackUrl 호스트가 카카오가 아니라서 전송하지 않음');
    return;
  }
  try {
    const res = await fetch(callbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) log.warn({ status: res.status }, '카카오 콜백 전송 실패');
  } catch (e) {
    log.warn({ err: (e as Error).message }, '카카오 콜백 전송 오류');
  }
}

export async function kakaoRoutes(app: FastifyInstance) {
  app.post<{ Params: { secret: string }; Body: SkillPayload }>('/kakao/skill/:secret', async (req, reply) => {
    const secret = await getKakaoSkillSecret();
    if (!safeEqual(req.params.secret || '', secret)) return reply.code(404).send({ error: 'not found' });

    const ur = req.body?.userRequest ?? {};
    const botUserKey = ur.user?.properties?.botUserKey || ur.user?.id || '';
    const text = (ur.utterance || '').trim();
    if (!botUserKey) return buildResponse('사용자 정보를 확인할 수 없어요.');

    // ① 즉시 명령
    if (isInstantCommand(text)) return toKakao(await handleMessage({ botUserKey, text, channel: 'KAKAO' }));

    // ② 콜백 사용
    if (ur.callbackUrl) {
      const callbackUrl = ur.callbackUrl;
      setImmediate(async () => {
        try {
          const r = await handleMessage({ botUserKey, text, channel: 'KAKAO' });
          await sendCallback(callbackUrl, toKakao(r), app.log);
        } catch (e) {
          app.log.error(e);
          await sendCallback(callbackUrl, buildResponse('처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'), app.log);
        }
      });
      return callbackAck();
    }

    // ③ 콜백 미승인: 제한 시간 안에 끝나면 바로 응답
    const work = handleMessage({ botUserKey, text, channel: 'KAKAO' });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), config.syncReplyBudgetMs));
    const r = await Promise.race([work, timeout]);
    if (r) return toKakao(r);
    work.catch(() => undefined);
    return buildResponse('답변을 준비하는 데 시간이 조금 더 걸려요. 잠시 후 같은 질문을 다시 보내 주세요. 🙏', undefined, [text]);
  });
}
