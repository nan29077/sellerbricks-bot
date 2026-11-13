// 메시지 처리 핵심 — 카카오 스킬과 관리자 테스트 채팅이 같은 경로를 쓴다.
import { DEFAULT_QUICK, runAgent } from './agent/agent.js';
import { MOCK_HELP } from './agent/providers/mock.js';
import type { AgentOutput, ChatTurn } from './agent/types.js';
import { prisma } from './lib/db.js';
import { maskForLog } from './lib/mask.js';
import { ensureBotUser, getLinks, linkAccount, linkStatusText, unlinkAccount } from './link/link.js';
import type { ToolContext } from './tools/types.js';

export interface BotReply extends AgentOutput {
  chatLogId?: string;
  latencyMs: number;
}

// ── 대화 기억 (최근 6턴, 30분) ─────────────────────────
const memory = new Map<string, { turns: ChatTurn[]; at: number }>();
const MEMORY_TTL = 30 * 60_000;

function history(key: string): ChatTurn[] {
  const m = memory.get(key);
  if (!m || Date.now() - m.at > MEMORY_TTL) return [];
  return m.turns;
}

function remember(key: string, user: string, reply: string) {
  const turns = [...history(key), { role: 'user' as const, text: user }, { role: 'assistant' as const, text: reply }].slice(-12);
  memory.set(key, { turns, at: Date.now() });
  if (memory.size > 5000) memory.delete(memory.keys().next().value as string);
}

// ── 속도 제한 (카카오 사용자당 1분 10회 — 관리자 테스트 채팅은 제외) ──
const hits = new Map<string, number[]>();
const RATE_LIMIT = 10;

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > RATE_LIMIT;
}

function system(text: string, quickReplies: string[] = DEFAULT_QUICK): AgentOutput {
  return { text, quickReplies, provider: 'SYSTEM', model: null, tokensIn: 0, tokensOut: 0, toolLogs: [] };
}

const HELP_TEXT = `안녕하세요! 셀러브릭스 셀러 비서예요 🤖\n주문·방송·미입금·송장·취소·정산·상품을 카톡으로 바로 확인할 수 있어요.\n\n${MOCK_HELP}\n\n계정 연결: "연결 123456" / 해제: "연결 해제" / 상태: "연결 상태"`;

const LINK_HOWTO = '계정 연결 방법\n1. 셀러브릭스 셀러 관리자 화면 접속\n2. "카카오 챗봇 연결" 메뉴에서 6자리 코드 받기 (5분 유효)\n3. 이 채팅방에 "연결 123456" 처럼 보내기\n\n스튜디오 계정은 "스튜디오 연결 123456" 으로 연결해요. (스튜디오 배포 후 오픈)';

/** 즉시 처리되는 명령(연결·도움말 등)인지 — 카카오 콜백 없이 바로 응답 */
export function isInstantCommand(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  return /^(스튜디오\s*)?연결\s*\d{6}$/.test(t) || /^(셀러브릭스\s*|스튜디오\s*)?연결\s*해제$/.test(t) || /^(연결\s*(상태|확인)|내\s*계정)$/.test(t) || /^(도움말|help|시작|메뉴|\?)$/i.test(t) || /^연결\s*방법$/.test(t);
}

async function runCommand(botUserId: string, botUserKey: string, text: string): Promise<AgentOutput | null> {
  const t = text.replace(/\s+/g, ' ').trim();
  let m = t.match(/^(스튜디오\s*)?연결\s*(\d{6})$/);
  if (m) return system(await linkAccount(botUserId, botUserKey, m[1] ? 'STUDIO' : 'SELLERBRICKS', m[2]));
  m = t.match(/^(셀러브릭스\s*|스튜디오\s*)?연결\s*해제$/);
  if (m) return system(await unlinkAccount(botUserId, m[1]?.startsWith('스튜디오') ? 'STUDIO' : m[1] ? 'SELLERBRICKS' : undefined), ['연결 방법', '도움말']);
  if (/^(연결\s*(상태|확인)|내\s*계정)$/.test(t)) return system(await linkStatusText(botUserId));
  if (/^연결\s*방법$/.test(t)) return system(LINK_HOWTO, ['도움말']);
  if (/^(도움말|help|시작|메뉴|\?)$/i.test(t)) return system(HELP_TEXT);
  return null;
}

export async function handleMessage(params: { botUserKey: string; text: string; channel: 'KAKAO' | 'TEST'; now?: Date }): Promise<BotReply> {
  const started = Date.now();
  const text = (params.text || '').trim().slice(0, 500);
  const user = await ensureBotUser(params.botUserKey);

  let out: AgentOutput;
  if (!text) out = system(HELP_TEXT);
  else if (params.channel === 'KAKAO' && rateLimited(params.botUserKey)) out = system('질문이 너무 빨라요. 1분 뒤에 다시 물어봐 주세요. 🙏', []);
  else {
    out = (await runCommand(user.id, params.botUserKey, text)) ?? (await (async () => {
      const ctx: ToolContext = { now: params.now ?? new Date(), links: await getLinks(user.id) };
      return runAgent({ userText: text, history: history(params.botUserKey), ctx });
    })());
  }
  if (out.provider !== 'SYSTEM') remember(params.botUserKey, text, out.text);

  const latencyMs = Date.now() - started;
  let chatLogId: string | undefined;
  try {
    const log = await prisma.chatLog.create({
      data: {
        botUserId: user.id,
        channel: params.channel,
        userText: maskForLog(text),
        replyText: maskForLog(out.text),
        provider: out.provider,
        model: out.model,
        latencyMs,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        error: out.error?.slice(0, 1000),
        tools: { create: out.toolLogs.map((l) => ({ tool: l.tool, argsJson: maskForLog(JSON.stringify(l.args)), ok: l.ok, ms: l.ms, error: l.error?.slice(0, 500) })) },
      },
    });
    chatLogId = log.id;
  } catch {
    /* 로그 실패는 응답에 영향 주지 않음 */
  }
  return { ...out, chatLogId, latencyMs };
}
