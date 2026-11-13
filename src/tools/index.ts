import { PlatformError } from '../platforms/sellerbricks/types.js';
import { PLATFORM_LABEL, type PlatformKey } from '../platforms/index.js';
import { contentTools, helpTools } from './content.js';
import { queryTools } from './query.js';
import { sellerbricksTools } from './sellerbricks.js';
import { studioTools } from './studio.js';
import type { BotTool, ToolContext, ToolResult } from './types.js';

export const ALL_TOOLS: BotTool[] = [...sellerbricksTools, ...queryTools, ...contentTools, ...helpTools, ...studioTools];

/** 쓰기 도구(데이터를 바꾸는 도구) — MCP readOnlyHint=false 대상. 1차 조회 도구는 모두 읽기 전용 */
export const WRITE_TOOLS = new Set(['set_preference']);

/** 연결된 플랫폼의 도구만 노출 */
export function toolsFor(ctx: ToolContext): BotTool[] {
  return ALL_TOOLS.filter((t) => !!ctx.links[t.platform]);
}

/** MCP tools/list 형식 */
export function mcpToolList(tools: BotTool[]) {
  return tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: !WRITE_TOOLS.has(t.name), destructiveHint: false } }));
}

export interface ToolExecLog {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  error?: string;
}

// ── 조회 결과 캐시 (2-2차 ⑤): 같은 셀러가 1분 안에 같은 조회를 다시 하면 플랫폼 API 를 다시 부르지 않는다 ──
const NO_CACHE = new Set(['create_report', 'write_content', 'set_preference', 'search_help']);
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; r: ToolResult }>();

export function clearToolCache() {
  cache.clear();
}

export async function execTool(name: string, args: Record<string, unknown>, ctx: ToolContext, logs: ToolExecLog[]): Promise<ToolResult> {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  const started = Date.now();
  try {
    if (!tool) throw new Error(`알 수 없는 도구: ${name}`);
    if (!ctx.links[tool.platform]) throw new Error(`NOT_LINKED:${tool.platform}`);
    const key = NO_CACHE.has(name) ? '' : JSON.stringify([ctx.botUserId, ctx.links[tool.platform]?.token, name, args || {}, ctx.prefs, Math.floor(ctx.now.getTime() / 60_000)]);
    const hit = key ? cache.get(key) : undefined;
    if (hit && Date.now() - hit.at < CACHE_MS) {
      logs.push({ tool: name, args, ok: true, ms: 0 });
      return hit.r;
    }
    const r = await tool.run(ctx, args || {});
    if (key) {
      cache.set(key, { at: Date.now(), r });
      if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
    }
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
    if (e.code === 'UNAUTHORIZED' || e.code === 'LINK_INVALID') return '계정 연결이 끊어졌어요. 셀러 관리자 화면 "AI 셀러 비서" 메뉴에서 새 6자리 코드를 받아 다시 연결해 주세요.';
    if (e.code === 'UNAVAILABLE') return e.message.includes('스토리지 마켓') ? e.message : '지금 셀러브릭스 서버 응답이 없어요. 잠시 후 다시 시도해 주세요.';
    return e.message;
  }
  const m = e instanceof Error ? e.message : String(e);
  if (m.startsWith('NOT_LINKED:')) {
    const p = m.split(':')[1] as PlatformKey;
    return `${PLATFORM_LABEL[p] ?? p} 계정이 아직 연결되지 않았어요. ${PLATFORM_LABEL[p] ?? p} 셀러 관리자 화면 "AI 셀러 비서" 메뉴에서 6자리 코드를 받아 연결해 주세요.`;
  }
  return '조회 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}
