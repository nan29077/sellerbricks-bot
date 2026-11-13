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
