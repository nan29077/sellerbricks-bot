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

export interface AgentOutput {
  text: string;
  card?: ToolResult['card'];
  quickReplies: string[];
  provider: 'CLAUDE' | 'GPT' | 'MOCK' | 'SYSTEM';
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  toolLogs: ToolExecLog[];
  error?: string;
}
