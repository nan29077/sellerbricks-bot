// 메시지 처리 핵심 — 카카오 스킬·웹챗·앱·관리자 테스트 채팅이 같은 경로를 쓴다.
// 채널별 차이(글자 수·긴 답변·속도 제한)는 channels/profile.ts 의 표를 따른다.
// 순서: 속도 제한 → 피드백·결과 보기 → 사진 상품 등록 흐름 → 명령(연결·도움말) → AI 에이전트
import { DEFAULT_QUICK, runAgent } from './agent/agent.js';
import { MOCK_HELP } from './agent/providers/mock.js';
import type { AgentOutput, ChatTurn } from './agent/types.js';
import { type ChannelKey, type ChannelView, profileOf } from './channels/profile.js';
import { createArtifact } from './lib/artifacts.js';
import { prisma } from './lib/db.js';
import { maskForLog } from './lib/mask.js';
import { ensureBotUser, getLinks, linkAccount, linkStatusText, unlinkAccount } from './link/link.js';
import { activeDraft, continueDraft, type IncomingImage, isDraftCommand, isProductTrigger, startDraft, stopLastProduct, storeImages } from './product/draft.js';
import type { ToolContext } from './tools/types.js';

export interface BotReply extends AgentOutput {
  chatLogId?: string;
  latencyMs: number;
}

// ── 대화 기억: DB 의 최근 대화(30분 이내 6턴)를 사용 → 서버를 재시작해도 이어짐 ──
const MEMORY_TTL = 30 * 60_000;

async function history(botUserId: string): Promise<ChatTurn[]> {
  const rows = await prisma.chatLog.findMany({
    where: { botUserId, createdAt: { gt: new Date(Date.now() - MEMORY_TTL) }, provider: { in: ['CLAUDE', 'GPT', 'MOCK'] } },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  return rows.reverse().flatMap((r) => [{ role: 'user' as const, text: r.userText }, { role: 'assistant' as const, text: r.replyText }]);
}

// ── 속도 제한 (채널별: 카카오 1분 10회, 웹·앱 20회 — 관리자 테스트 채팅은 제외) ──
const hits = new Map<string, number[]>();

export function rateLimited(key: string, limit = 10): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 20000) hits.delete(hits.keys().next().value as string);
  return arr.length > limit;
}

function system(text: string, quickReplies: string[] = DEFAULT_QUICK): AgentOutput {
  return { text, quickReplies, provider: 'SYSTEM', model: null, tokensIn: 0, tokensOut: 0, toolLogs: [] };
}

const helpText = (view: ChannelView) =>
  `안녕하세요! 셀러브릭스 AI 셀러 비서예요.\n주문·방송·정산·상품·고객 무엇이든 물어보세요. 리포트·엑셀, 방송 대본·상품 설명, 사진으로 상품 등록도 돼요.\n\n${MOCK_HELP}\n\n` +
  (view === 'WEB' ? '계정 추가·해제: 오른쪽 위 메뉴 → 연결 계정' : '계정 연결: "연결 123456" / 해제: "연결 해제" / 상태: "연결 상태"');

const linkHowto = (view: ChannelView) =>
  view === 'WEB'
    ? '계정 연결 방법\n1. 셀러브릭스(또는 스튜디오) 셀러 관리자 화면 접속\n2. "AI 셀러 비서" 메뉴에서 6자리 코드 받기 (5분 유효)\n3. 오른쪽 위 메뉴 → 연결 계정 → 코드 입력\n\n여기에 "연결 123456" 처럼 보내도 돼요. 스튜디오는 "스튜디오 연결 123456"'
    : '계정 연결 방법\n1. 셀러브릭스 셀러 관리자 화면 접속\n2. "AI 셀러 비서" 메뉴에서 6자리 코드 받기 (5분 유효)\n3. 이 채팅방에 "연결 123456" 처럼 보내기\n\n스튜디오 계정은 "스튜디오 연결 123456" 으로 연결해요.';

const POSITIVE_FEEDBACK = '도움 됨';
const NEGATIVE_FEEDBACK = '아쉬워요';
const FEEDBACK_RE = /^(도움 됨|아쉬워요)$|^(👍|👎)/;
export const RESULT_CHECK = '결과 보기';

/** 즉시 처리되는 명령(연결·도움말·피드백·결과 보기·상품 버튼) — 카카오 콜백 없이 바로 응답 */
export function isInstantCommand(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  return (
    /^(스튜디오\s*)?연결\s*\d{6}$/.test(t) ||
    /^(셀러브릭스\s*|스튜디오\s*)?연결\s*해제$/.test(t) ||
    /^(연결\s*(상태|확인)|내\s*계정)$/.test(t) ||
    /^(도움말|help|시작|메뉴|\?)$/i.test(t) ||
    /^연결\s*방법$/.test(t) ||
    FEEDBACK_RE.test(t) ||
    t === RESULT_CHECK
  );
}

async function runCommand(botUserId: string, botUserKey: string, text: string, view: ChannelView): Promise<AgentOutput | null> {
  const t = text.replace(/\s+/g, ' ').trim();
  let m = t.match(/^(스튜디오\s*)?연결\s*(\d{6})$/);
  if (m) return system(await linkAccount(botUserId, botUserKey, m[1] ? 'STUDIO' : 'SELLERBRICKS', m[2]));
  m = t.match(/^(셀러브릭스\s*|스튜디오\s*)?연결\s*해제$/);
  if (m) return system(await unlinkAccount(botUserId, m[1]?.startsWith('스튜디오') ? 'STUDIO' : m[1] ? 'SELLERBRICKS' : undefined), ['연결 방법', '도움말']);
  if (/^(연결\s*(상태|확인)|내\s*계정)$/.test(t)) return system(await linkStatusText(botUserId));
  if (/^연결\s*방법$/.test(t)) return system(linkHowto(view), ['도움말']);
  if (/^(도움말|help|시작|메뉴|\?)$/i.test(t)) return system(helpText(view));
  if (FEEDBACK_RE.test(t)) {
    const positive = t === POSITIVE_FEEDBACK || t.startsWith('👍');
    const last = await prisma.chatLog.findFirst({ where: { botUserId, provider: { in: ['CLAUDE', 'GPT', 'MOCK'] } }, orderBy: { createdAt: 'desc' } });
    if (last) await prisma.chatLog.update({ where: { id: last.id }, data: { feedback: positive ? 1 : -1 } });
    return system(positive ? '도움이 됐다니 다행이에요!' : '알려주셔서 고마워요. 더 나아지도록 반영할게요. 어떤 점이 아쉬웠는지 적어 주시면 더 좋아요.', []);
  }
  return null;
}

async function loadPrefs(botUserId: string): Promise<Record<string, string>> {
  const rows = await prisma.sellerPref.findMany({ where: { botUserId } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** 긴 답변(카카오 말풍선 한도 근처)은 전체 보기 페이지로 — 웹·앱은 화면에 그대로 */
async function attachLongText(out: AgentOutput, botUserId: string, limit: number | null): Promise<AgentOutput> {
  if (limit === null || out.text.length <= limit || out.link) return out;
  const a = await createArtifact(botUserId, 'TEXT', { title: '답변 전체 보기', sections: [{ type: 'text', body: out.text }] });
  return { ...out, text: out.text.slice(0, 850) + '…\n\n(전체 내용은 아래 버튼으로 볼 수 있어요)', link: { label: '전체 보기', url: a.url } };
}

export interface HandleParams {
  botUserKey: string;
  text: string;
  channel: Exclude<ChannelKey, 'MCP'>;
  /** 관리자 테스트 채팅에서 카카오/웹 모양 중 무엇으로 볼지 */
  view?: ChannelView;
  images?: IncomingImage[];
  now?: Date;
}

export async function handleMessage(params: HandleParams): Promise<BotReply> {
  const started = Date.now();
  const text = (params.text || '').trim().slice(0, 500);
  const user = await ensureBotUser(params.botUserKey, params.channel === 'APP' ? 'WEB' : params.channel);
  const images = params.images ?? [];
  const prof = profileOf(params.channel, params.view);

  let out: AgentOutput;
  if (user.blockedAt) out = system('이용이 제한된 계정이에요. 셀러브릭스 고객센터로 문의해 주세요.', []);
  else if (!text && !images.length) out = system(helpText(prof.view));
  else if (prof.ratePerMin !== null && rateLimited(params.botUserKey, prof.ratePerMin)) out = system('질문이 너무 빨라요. 1분 뒤에 다시 물어봐 주세요.', []);
  else {
    out =
      (await runCommand(user.id, params.botUserKey, text, prof.view)) ??
      (await (async () => {
        const ctx: ToolContext = { now: params.now ?? new Date(), botUserId: user.id, links: await getLinks(user.id), prefs: await loadPrefs(user.id), view: prof.view, channel: params.channel };
        // 사진 상품 등록 흐름
        let tokens: string[] = [];
        if (images.length) {
          const st = await storeImages(user.id, images);
          tokens = st.tokens;
          if (!tokens.length) return system(`사진을 받지 못했어요. (${st.errors[0] ?? '알 수 없는 오류'}) 다시 보내 주세요.`, ['도움말']);
        }
        if (/^판매\s*중지$/.test(text)) return stopLastProduct(user.id, ctx);
        const draft = await activeDraft(user.id);
        if (draft) {
          if (isProductTrigger(text) && tokens.length) return startDraft(user.id, ctx, text, tokens);
          const r = await continueDraft(draft, user.id, ctx, text, tokens);
          if (r) return r;
        } else if (tokens.length || isProductTrigger(text)) return startDraft(user.id, ctx, text, tokens);
        else if (isDraftCommand(text)) return system('등록 중인 상품이 없어요. 사진과 함께 "간편 상품 등록해줘"라고 보내 주세요.', ['도움말']);
        return runAgent({ userText: text, history: await history(user.id), ctx });
      })());
  }
  if (out.provider !== 'SYSTEM' && out.toolLogs.length) out = { ...out, quickReplies: [...out.quickReplies.slice(0, 8), POSITIVE_FEEDBACK, NEGATIVE_FEEDBACK] };
  out = await attachLongText(out, user.id, prof.longTextAt);

  const latencyMs = Date.now() - started;
  let chatLogId: string | undefined;
  try {
    const log = await prisma.chatLog.create({
      data: {
        botUserId: user.id,
        channel: params.channel,
        userText: maskForLog((images.length ? `[사진 ${images.length}장] ` : '') + text),
        replyText: maskForLog(out.text),
        provider: out.provider,
        model: out.model,
        latencyMs,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        error: out.error?.slice(0, 1000),
        checkWarn: out.checkWarn?.slice(0, 500),
        extraJson: extraOf(out),
        tools: { create: out.toolLogs.map((l) => ({ tool: l.tool, argsJson: maskForLog(JSON.stringify(l.args)), ok: l.ok, ms: l.ms, error: l.error?.slice(0, 500) })) },
      },
    });
    chatLogId = log.id;
  } catch {
    /* 로그 실패는 응답에 영향 주지 않음 */
  }
  return { ...out, chatLogId, latencyMs };
}

/** 카드·버튼·링크를 저장해 두면 웹챗 대화 기록에서 그대로 다시 그릴 수 있다 */
function extraOf(out: AgentOutput): string | null {
  if (!out.card && !out.basicCard && !out.link && !out.quickReplies.length) return null;
  return JSON.stringify({ card: out.card, basicCard: out.basicCard, link: out.link, quickReplies: out.quickReplies }).slice(0, 20000);
}

// ── [결과 보기] — 콜백 미승인 상태에서 4초를 넘긴 답을 저장했다가 전달 ──

export async function savePending(botUserKey: string, question: string, work: Promise<BotReply>) {
  await prisma.pendingReply.upsert({ where: { botUserKey }, create: { botUserKey, status: 'WORKING', question }, update: { status: 'WORKING', question, replyJson: null } });
  work
    .then((r) => prisma.pendingReply.update({ where: { botUserKey }, data: { status: 'READY', replyJson: JSON.stringify(r) } }))
    .catch(() => prisma.pendingReply.update({ where: { botUserKey }, data: { status: 'READY', replyJson: JSON.stringify(system('처리 중 문제가 생겼어요. 다시 질문해 주세요.')) } }));
}

export async function takePending(botUserKey: string): Promise<BotReply | { waiting: true } | null> {
  const p = await prisma.pendingReply.findUnique({ where: { botUserKey } });
  if (!p || Date.now() - p.updatedAt.getTime() > 10 * 60_000) return null;
  if (p.status !== 'READY' || !p.replyJson) return { waiting: true };
  await prisma.pendingReply.delete({ where: { botUserKey } });
  return JSON.parse(p.replyJson) as BotReply;
}
