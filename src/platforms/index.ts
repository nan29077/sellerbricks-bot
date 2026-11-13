import { getPlatformSettings } from '../lib/settings.js';
import { HttpSellerbricksApi } from './sellerbricks/http.js';
import { MockSellerbricksApi } from './sellerbricks/mock.js';
import { PlatformError, type SellerbricksApi } from './sellerbricks/types.js';
import { HttpStudioApi } from './studio/http.js';
import { MockStudioApi } from './studio/mock.js';
import type { StudioApi } from './studio/types.js';

export type PlatformKey = 'SELLERBRICKS' | 'STUDIO';

export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  SELLERBRICKS: '셀러브릭스',
  STUDIO: '스토리지 마켓', // 옛 이름: 셀러브릭스 스튜디오 (내부 키는 STUDIO 유지)
};

const mock = new MockSellerbricksApi();
const studioMock = new MockStudioApi();

/** 관리자 설정(가짜/실제)에 따라 셀러브릭스 클라이언트 선택 */
export async function sellerbricksApi(): Promise<SellerbricksApi> {
  const s = await getPlatformSettings('sellerbricks');
  if (s.mode === 'LIVE') return new HttpSellerbricksApi(s.baseUrl, s.signingKey);
  if (s.mode === 'OFF') throw new PlatformError('UNAVAILABLE', '셀러브릭스 연동이 꺼져 있습니다.');
  return mock;
}

/** 스토리지 마켓(옛 셀러브릭스 스튜디오) 클라이언트 — 기본은 꺼짐. 배포 전에는 가짜(MOCK)로 시험, 배포 후 실제(LIVE) */
export async function studioApi(): Promise<StudioApi> {
  const s = await getPlatformSettings('studio');
  if (s.mode === 'LIVE') return new HttpStudioApi(s.baseUrl, s.signingKey);
  if (s.mode === 'OFF') throw new PlatformError('UNAVAILABLE', '스토리지 마켓 연결은 아직 열리지 않았어요.');
  return studioMock;
}

export async function isPlatformEnabled(p: PlatformKey): Promise<boolean> {
  const s = await getPlatformSettings(p === 'SELLERBRICKS' ? 'sellerbricks' : 'studio');
  return s.mode !== 'OFF';
}

/** 플랫폼별 연결 코드 검증·해제 (link.ts 에서 사용) */
export async function linkClient(p: PlatformKey): Promise<{ verifyLink(code: string, key: string): Promise<{ linkToken: string; accountId: string; accountName: string }>; revokeLink(token: string): Promise<void> }> {
  return p === 'SELLERBRICKS' ? sellerbricksApi() : studioApi();
}
