import { PlatformError } from '../platforms/sellerbricks/types.js';
import { PLATFORM_LABEL, type PlatformKey } from '../platforms/index.js';
import { sellerbricksTools } from './sellerbricks.js';
import type { BotTool, ToolContext, ToolResult } from './types.js';

export const ALL_TOOLS: BotTool[] = [...sellerbricksTools];

/** 연결된 플랫폼의 도구만 노출 */
export function toolsFor(ctx: ToolContext): BotTool[] {
  return ALL_TOOLS.filter((t) => !!ctx.links[t.platform]);
}

/** MCP tools/list 형식 */
export function mcpToolList(tools: BotTool[]) {
  return tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema }));
}

export interface ToolExecLog {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  error?: string;
}

export async function execTool(name: string, args: Record<string, unknown>, ctx: ToolContext, logs: ToolExecLog[]): Promise<ToolResult> {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  const started = Date.now();
  try {
    if (!tool) throw new Error(`알 수 없는 도구: ${name}`);
    if (!ctx.links[tool.platform]) throw new Error(`NOT_LINKED:${tool.platform}`);
    const r = await tool.run(ctx, args || {});
    logs.push({ tool: name, args, ok: true, ms: Date.now() - started });
    return r;
  } catch (e) {
    const msg = friendlyError(e);
    logs.push({ tool: name, args, ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) });
    return { summary: msg, data: { error: msg } };
  }
}

export function friendlyError(e: unknown): string {
  if (e instanceof PlatformError) {
    if (e.code === 'UNAUTHORIZED' || e.code === 'LINK_INVALID') return '계정 연결이 끊어졌어요. 관리자 화면에서 연결 코드를 다시 받아 "연결 123456" 처럼 입력해 주세요.';
    if (e.code === 'UNAVAILABLE') return '지금 셀러브릭스 서버 응답이 없어요. 잠시 후 다시 시도해 주세요.';
    return e.message;
  }
  const m = e instanceof Error ? e.message : String(e);
  if (m.startsWith('NOT_LINKED:')) {
    const p = m.split(':')[1] as PlatformKey;
    return `${PLATFORM_LABEL[p] ?? p} 계정이 아직 연결되지 않았어요. 셀러 관리자 화면에서 연결 코드를 받아 "연결 123456" 처럼 입력해 주세요.`;
  }
  return '조회 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}
