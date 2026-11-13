import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export const ROOT = process.cwd();
export const DATA_DIR = resolve(ROOT, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// .env 에 DATABASE_URL 이 없으면 기본 SQLite 파일 사용
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:../data/bot.db';

/** APP_SECRET 이 비어 있으면 data/app-secret.txt 에 만들어 두고 계속 사용 */
function loadAppSecret(): string {
  const fromEnv = (process.env.APP_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  const file = resolve(DATA_DIR, 'app-secret.txt');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const generated = randomBytes(32).toString('hex');
  writeFileSync(file, generated, 'utf8');
  return generated;
}

export const config = {
  port: Number(process.env.PORT || 3071),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin1234',
  appSecret: loadAppSecret(),
  kakaoSkillSecretEnv: (process.env.KAKAO_SKILL_SECRET || '').trim(),
  sellerbricksWebUrl: (process.env.SELLERBRICKS_WEB_URL || 'https://sellerbricks.co.kr').replace(/\/$/, ''),
  envAnthropicKey: (process.env.ANTHROPIC_API_KEY || '').trim(),
  envOpenaiKey: (process.env.OPENAI_API_KEY || '').trim(),
  /** AI 처리 전체 제한 시간. 카카오 콜백 URL 은 5분 유효·1회용이지만 셀러가 기다리지 않도록 60초로 제한 */
  agentTimeoutMs: 60_000,
  /** 콜백 미승인 상태에서 즉시 응답을 기다리는 최대 시간 (카카오 5초 제한) */
  syncReplyBudgetMs: 4_000,
};

export const isDefaultAdminPassword = () => config.adminPassword === 'admin1234';
