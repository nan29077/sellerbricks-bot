import { config } from '../lib/config.js';
import { prisma } from '../lib/db.js';
import { getApiKey, getLlmSettings } from '../lib/settings.js';
import { fmtDateTime, kstParts, periodOf } from '../lib/time.js';
import { PLATFORM_LABEL } from '../platforms/index.js';
import { execTool, toolsFor, type ToolExecLog } from '../tools/index.js';
import type { ToolContext, ToolResult } from '../tools/types.js';
import { anthropicProvider } from './providers/anthropic.js';
import { mockProvider } from './providers/mock.js';
import { openaiProvider } from './providers/openai.js';
import type { AgentOutput, ChatTurn, LlmProvider } from './types.js';

const NEXT_SUGGESTIONS: Record<string, string[]> = {
  get_order_summary: ['입금 안 된 주문', '송장 안 넣은 주문', '어제 방송 주문', '많이 팔린 상품'],
  get_live_orders: ['입금 안 된 주문', '그 전 방송은?', '품절 임박 상품'],
  get_unpaid_orders: ['오늘 주문 정리', '송장 안 넣은 주문'],
  get_unshipped_orders: ['입금 안 된 주문', '취소 요청 현황'],
  get_cancel_requests: ['이번 달 정산', '오늘 주문 정리'],
  get_settlement_summary: ['지난달 정산', '이번 달 주문 정리'],
  get_top_products: ['품절 임박 상품', '지난주 많이 팔린 상품'],
  get_products: ['많이 팔린 상품', '오늘 주문 정리'],
  search_orders: ['송장 안 넣은 주문', '오늘 주문 정리'],
};
export const DEFAULT_QUICK = ['오늘 주문 정리', '입금 안 된 주문', '송장 안 넣은 주문', '이번 달 정산', '도움말'];

function systemPrompt(ctx: ToolContext): string {
  const now = ctx.now;
  const p = kstParts(now);
  const wd = '일월화수목금토'[p.wd];
  const linked = Object.entries(ctx.links).map(([k, v]) => `${PLATFORM_LABEL[k as keyof typeof PLATFORM_LABEL]}(${v!.accountName})`).join(', ');
  return [
    '너는 라이브커머스 플랫폼 "셀러브릭스"의 셀러 전용 카카오톡 비서야.',
    `지금은 한국 시간 ${p.y}년 ${fmtDateTime(now)} (${wd}요일)이고, 이번 주는 ${periodOf('this_week', now).label} 이야.`,
    `이 셀러가 연결한 계정: ${linked || '없음'}.`,
    '',
    '규칙:',
    '1. 숫자·주문·금액은 반드시 도구를 호출해서 얻은 값만 말해. 추측하거나 지어내지 마.',
    '2. 정산·수수료·출금 금액은 도구가 준 값을 그대로 써. 직접 다시 계산하지 마.',
    '3. 셀러브릭스 주문서(계좌/카드)와 일반 주문은 합치지 말고 나눠서 말해. 스튜디오 주문도 별도야.',
    '4. 카카오톡 말풍선이라 마크다운(**, #, 표)을 쓰지 마. 짧은 줄바꿈과 이모지 1~2개만. 600자 이내로 핵심부터.',
    '5. 구매자 이름·전화번호는 도구가 가려 준 그대로만 써.',
    '6. 지금은 조회만 가능해. 송장 입력·취소·예약 같은 실행 요청은 "관리자 화면에서 처리해 주세요"라고 안내하고 해당 버튼을 쓰게 해.',
    '7. 기간이 애매하면 오늘(주문), 최근 7일(미입금), 이번 주(인기 상품), 이번 달(정산)을 기본으로 쓰고 어떤 기간인지 밝혀.',
    '8. 셀러 업무와 상관없는 질문에는 짧게 답하고, 할 수 있는 일(주문·방송·미입금·송장·취소·정산·상품·주문 찾기)을 안내해.',
    '9. 존댓말(해요체)로 친근하게.',
  ].join('\n');
}

async function monthlyAiCount(): Promise<number> {
  const from = periodOf('this_month').from;
  return prisma.chatLog.count({ where: { createdAt: { gte: from }, provider: { in: ['CLAUDE', 'GPT'] } } });
}

export interface AgentInput {
  userText: string;
  history: ChatTurn[];
  ctx: ToolContext;
}

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const { ctx } = input;
  const toolLogs: ToolExecLog[] = [];
  const tools = toolsFor(ctx);

  if (!tools.length) {
    return {
      text: '아직 연결된 계정이 없어요.\n셀러브릭스 셀러 관리자 화면 → "카카오 챗봇 연결"에서 6자리 코드를 받은 뒤, 여기에 "연결 123456" 처럼 보내 주세요.',
      quickReplies: ['연결 방법', '도움말'],
      provider: 'SYSTEM',
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      toolLogs,
    };
  }

  const llm = await getLlmSettings();
  let provider: LlmProvider = mockProvider;
  let model: string | null = null;
  let apiKey = '';
  let note = '';
  if (llm.effective === 'CLAUDE' || llm.effective === 'GPT') {
    const limitHit = llm.monthlyLimit > 0 && (await monthlyAiCount()) >= llm.monthlyLimit;
    if (limitHit) note = '(이번 달 AI 사용 한도에 도달해 기본 응답으로 안내해요)\n';
    else {
      provider = llm.effective === 'CLAUDE' ? anthropicProvider : openaiProvider;
      model = llm.effective === 'CLAUDE' ? llm.claudeModel : llm.gptModel;
      apiKey = (await getApiKey(llm.effective === 'CLAUDE' ? 'anthropic' : 'openai')).key;
    }
  }

  let lastResult: ToolResult | undefined;
  let lastTool = '';
  const exec = async (name: string, args: Record<string, unknown>) => {
    const r = await execTool(name, args, ctx, toolLogs);
    if (r.card) {
      lastResult = r;
      lastTool = name;
    } else if (!lastResult) lastTool = name;
    return r;
  };

  const params = {
    system: systemPrompt(ctx),
    history: input.history.slice(-6),
    userText: input.userText,
    tools,
    exec,
    model: model ?? 'mock',
    apiKey,
    signal: AbortSignal.timeout(config.agentTimeoutMs),
    ctx,
  };

  let error: string | undefined;
  let result;
  try {
    result = await provider.run(params);
    if (!result.text) throw new Error('AI 응답이 비어 있음');
  } catch (e) {
    // AI 오류 시 가짜 응답 모드로 대신 답한다 (셀러는 답을 받고, 관리자는 로그에서 오류 확인)
    error = e instanceof Error ? e.message : String(e);
    provider = mockProvider;
    model = null;
    toolLogs.length = 0;
    lastResult = undefined;
    lastTool = '';
    result = await mockProvider.run(params);
  }

  return {
    text: (note + result.text).trim(),
    card: lastResult?.card,
    quickReplies: NEXT_SUGGESTIONS[lastTool] ?? DEFAULT_QUICK,
    provider: provider.name,
    model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    toolLogs,
    error,
  };
}
