import type { PlatformKey } from '../platforms/index.js';

/** 카카오 리스트카드로 바꿔 보여줄 수 있는 결과 */
export interface ListCard {
  title: string;
  items: { title: string; description: string }[];
  button?: { label: string; url: string };
}

export interface ToolResult {
  /** 사람이 읽는 요약 (가짜 응답 모드는 이 문장을 그대로 답변으로 사용) */
  summary: string;
  /** AI 에게 전달하는 데이터 (개인정보는 이미 가려진 상태) */
  data: unknown;
  card?: ListCard;
  link?: { label: string; url: string };
}

export interface ToolContext {
  now: Date;
  /** 봇 사용자 id (결과물 링크 소유자) */
  botUserId: string;
  /** 셀러별 기본 설정 (송장 지연 기준일 등) */
  prefs: Record<string, string>;
  /** 연결된 플랫폼별 토큰 — 셀러 범위는 이 토큰으로 플랫폼이 강제 */
  links: Partial<Record<PlatformKey, { token: string; accountName: string }>>;
}

/** MCP Tool 형식(name / description / inputSchema)과 동일 + 실행 함수 */
export interface BotTool {
  name: string;
  title: string; // 한글 이름 (관리자 로그 표시용)
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  platform: PlatformKey;
  run(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
}
