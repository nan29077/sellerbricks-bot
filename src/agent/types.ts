import type { ToolExecLog } from '../tools/index.js';
import type { BotTool, ToolContext, ToolResult } from '../tools/types.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ProviderParams {
  system: string;
  history: ChatTurn[];
  userText: string;
  tools: BotTool[];
  exec: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  model: string;
  apiKey: string;
  signal: AbortSignal;
  ctx: ToolContext;
}

export interface ProviderResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface LlmProvider {
  name: 'CLAUDE' | 'GPT' | 'MOCK';
  run(p: ProviderParams): Promise<ProviderResult>;
}

export interface BasicCard {
  imageUrl?: string;
  title: string;
  description: string;
  buttons: { label: string; action: 'message' | 'webLink'; value: string }[];
}

export interface AgentOutput {
  text: string;
  card?: ToolResult['card'];
  /** 사진·버튼이 있는 카드 (상품 등록 확인 등) */
  basicCard?: BasicCard;
  /** 결과물 링크 (리스트카드가 없을 때 버튼으로 붙임) */
  link?: ToolResult['link'];
  /** 숫자 검증 경고 */
  checkWarn?: string;
  quickReplies: string[];
  provider: 'CLAUDE' | 'GPT' | 'MOCK' | 'SYSTEM';
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  toolLogs: ToolExecLog[];
  error?: string;
}
