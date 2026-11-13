import { prisma } from './db.js';
import { config } from './config.js';
import { decrypt, encrypt, randomToken } from './crypto.js';

export type Provider = 'CLAUDE' | 'GPT' | 'MOCK';
export type KeyName = 'anthropic' | 'openai';
export type KeyStatus = 'NONE' | 'UNTESTED' | 'OK' | 'FAIL';
export type PlatformMode = 'OFF' | 'MOCK' | 'LIVE';

export const DEFAULT_MODELS = {
  CLAUDE: 'claude-sonnet-5-5',
  GPT: 'gpt-5-mini',
};

export const MODEL_PRESETS = {
  CLAUDE: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
  GPT: ['gpt-5-mini', 'gpt-5', 'gpt-5-nano'],
};

let cache: Map<string, string> | null = null;

async function load(): Promise<Map<string, string>> {
  if (cache) return cache;
  const rows = await prisma.setting.findMany();
  cache = new Map(rows.map((r) => [r.key, r.value]));
  return cache;
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const m = await load();
  return m.get(key) ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  (await load()).set(key, value);
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key } });
  (await load()).delete(key);
}

export async function getSecret(key: string): Promise<string> {
  const v = await getSetting(key);
  return v ? decrypt(v) ?? '' : '';
}

export async function setSecret(key: string, plain: string): Promise<void> {
  await setSetting(key, encrypt(plain));
}

// ── API 키 ─────────────────────────────────────────────

/** 관리자 화면 입력값 우선, 없으면 .env 값 */
export async function getApiKey(name: KeyName): Promise<{ key: string; source: 'ADMIN' | 'ENV' | 'NONE' }> {
  const fromAdmin = await getSecret(`key.${name}`);
  if (fromAdmin) return { key: fromAdmin, source: 'ADMIN' };
  const fromEnv = name === 'anthropic' ? config.envAnthropicKey : config.envOpenaiKey;
  if (fromEnv) return { key: fromEnv, source: 'ENV' };
  return { key: '', source: 'NONE' };
}

export async function getKeyStatus(name: KeyName): Promise<{ status: KeyStatus; message: string; testedAt: string }> {
  const { key } = await getApiKey(name);
  if (!key) return { status: 'NONE', message: '', testedAt: '' };
  return {
    status: ((await getSetting(`key.${name}.status`)) || 'UNTESTED') as KeyStatus,
    message: await getSetting(`key.${name}.message`),
    testedAt: await getSetting(`key.${name}.testedAt`),
  };
}

export async function setKeyStatus(name: KeyName, status: KeyStatus, message = ''): Promise<void> {
  await setSetting(`key.${name}.status`, status);
  await setSetting(`key.${name}.message`, message);
  await setSetting(`key.${name}.testedAt`, new Date().toISOString());
}

// ── AI 선택 ────────────────────────────────────────────

export interface LlmSettings {
  selected: Provider; // 관리자가 고른 것
  effective: Provider; // 실제 사용 (키가 없으면 MOCK)
  reason: string;
  claudeModel: string;
  gptModel: string;
  monthlyLimit: number; // 0 = 제한 없음
}

export async function getLlmSettings(): Promise<LlmSettings> {
  const selected = ((await getSetting('llm.provider')) || 'CLAUDE') as Provider;
  const claudeModel = (await getSetting('llm.claudeModel')) || DEFAULT_MODELS.CLAUDE;
  const gptModel = (await getSetting('llm.gptModel')) || DEFAULT_MODELS.GPT;
  const monthlyLimit = Number((await getSetting('llm.monthlyLimit')) || '3000');
  let effective: Provider = selected;
  let reason = '';
  if (selected === 'CLAUDE' && !(await getApiKey('anthropic')).key) {
    effective = 'MOCK';
    reason = 'Claude API 키가 없어 가짜 응답 모드로 동작 중';
  } else if (selected === 'GPT' && !(await getApiKey('openai')).key) {
    effective = 'MOCK';
    reason = 'GPT API 키가 없어 가짜 응답 모드로 동작 중';
  } else if (selected === 'MOCK') {
    reason = '관리자가 가짜 응답 모드를 선택함';
  }
  return { selected, effective, reason, claudeModel, gptModel, monthlyLimit };
}

// ── 카카오 ─────────────────────────────────────────────

export async function getKakaoSkillSecret(): Promise<string> {
  if (config.kakaoSkillSecretEnv) return config.kakaoSkillSecretEnv;
  let s = await getSetting('kakao.skillSecret');
  if (!s) {
    s = randomToken(18);
    await setSetting('kakao.skillSecret', s);
  }
  return s;
}

// ── 플랫폼 연결 ────────────────────────────────────────

export interface PlatformSettings {
  mode: PlatformMode;
  baseUrl: string;
  signingKey: string;
}

export async function getPlatformSettings(platform: 'sellerbricks' | 'studio'): Promise<PlatformSettings> {
  const defMode: PlatformMode = platform === 'sellerbricks' ? 'MOCK' : 'OFF';
  return {
    mode: ((await getSetting(`platform.${platform}.mode`)) || defMode) as PlatformMode,
    baseUrl: await getSetting(`platform.${platform}.baseUrl`),
    signingKey: await getSecret(`platform.${platform}.signingKey`),
  };
}

// ── 채널(카카오·웹챗·앱) 설정 ───────────────────────────

export interface ChannelSettings {
  kakao: { enabled: boolean; channelUrl: string };
  web: { enabled: boolean };
  app: { enabled: boolean; version: string; fileName: string; fileSize: number; externalUrl: string; note: string; updatedAt: string };
  /** 시작 페이지 안내 문구 */
  notice: string;
}

const on = (v: string, def: boolean) => (v === '' ? def : v === '1');

export async function getChannelSettings(): Promise<ChannelSettings> {
  return {
    kakao: { enabled: on(await getSetting('channel.kakao.enabled'), true), channelUrl: await getSetting('channel.kakao.url') },
    web: { enabled: on(await getSetting('channel.web.enabled'), true) },
    app: {
      enabled: on(await getSetting('channel.app.enabled'), false),
      version: await getSetting('channel.app.version'),
      fileName: await getSetting('channel.app.fileName'),
      fileSize: Number((await getSetting('channel.app.fileSize')) || 0),
      externalUrl: await getSetting('channel.app.externalUrl'),
      note: await getSetting('channel.app.note'),
      updatedAt: await getSetting('channel.app.updatedAt'),
    },
    notice: await getSetting('channel.notice'),
  };
}

/** 카카오 채널 주소 → 채팅 바로가기 / 채널 추가 주소 (예: http://pf.kakao.com/_abcd) */
export function kakaoLinks(channelUrl: string): { chat: string; add: string } | null {
  const u = channelUrl.trim().replace(/\/+$/, '').replace(/\/(chat|friend)$/, '');
  if (!/^https?:\/\/pf\.kakao\.com\/_[A-Za-z0-9]+$/.test(u)) return null;
  return { chat: `${u}/chat`, add: `${u}/friend` };
}

// ── 비용·성능 (2-2차 ⑤) ─────────────────────────────────

export interface CostSettings {
  /** 셀러 1명당 하루 AI 질문 한도 (0 = 제한 없음) */
  dailyPerUser: number;
  /** 짧고 단순한 질문은 가벼운 모델로 */
  autoModel: boolean;
  claudeLight: string;
  gptLight: string;
  /** 동시에 처리하는 AI 질문 수 */
  maxConcurrent: number;
}

export async function getCostSettings(): Promise<CostSettings> {
  return {
    dailyPerUser: Number((await getSetting('cost.dailyPerUser')) || '100'),
    autoModel: on(await getSetting('cost.autoModel'), true),
    claudeLight: (await getSetting('cost.claudeLight')) || 'claude-haiku-5-5',
    gptLight: (await getSetting('cost.gptLight')) || 'gpt-5-nano',
    maxConcurrent: Math.max(1, Number((await getSetting('cost.maxConcurrent')) || '5')),
  };
}

// ── 알림 (2-2차 ⑥) ──────────────────────────────────────

export interface NotifySettings {
  enabled: boolean;
  morningHour: number; // 한국 시간
  kinds: Record<'MORNING' | 'LIVE_REPORT' | 'UNPAID' | 'UNSHIPPED' | 'CANCEL', boolean>;
  /** 카카오 알림톡 발송 방식 — 지금은 가짜 발송(기록만) */
  kakaoMode: 'MOCK' | 'OFF';
}

export async function getNotifySettings(): Promise<NotifySettings> {
  return {
    enabled: on(await getSetting('notify.enabled'), false),
    morningHour: Number((await getSetting('notify.morningHour')) || '8'),
    kinds: {
      MORNING: on(await getSetting('notify.kind.MORNING'), true),
      LIVE_REPORT: on(await getSetting('notify.kind.LIVE_REPORT'), true),
      UNPAID: on(await getSetting('notify.kind.UNPAID'), true),
      UNSHIPPED: on(await getSetting('notify.kind.UNSHIPPED'), true),
      CANCEL: on(await getSetting('notify.kind.CANCEL'), true),
    },
    kakaoMode: ((await getSetting('notify.kakaoMode')) || 'MOCK') as 'MOCK' | 'OFF',
  };
}

export async function isMcpEnabled(): Promise<boolean> {
  return on(await getSetting('mcp.enabled'), false);
}
