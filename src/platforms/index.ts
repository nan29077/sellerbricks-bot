import { getPlatformSettings } from '../lib/settings.js';
import { HttpSellerbricksApi } from './sellerbricks/http.js';
import { MockSellerbricksApi } from './sellerbricks/mock.js';
import { PlatformError, type SellerbricksApi } from './sellerbricks/types.js';

export type PlatformKey = 'SELLERBRICKS' | 'STUDIO';

export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  SELLERBRICKS: '셀러브릭스',
  STUDIO: '셀러브릭스 스튜디오',
};

const mock = new MockSellerbricksApi();

/** 관리자 설정(가짜/실제)에 따라 셀러브릭스 클라이언트 선택 */
export async function sellerbricksApi(): Promise<SellerbricksApi> {
  const s = await getPlatformSettings('sellerbricks');
  if (s.mode === 'LIVE') return new HttpSellerbricksApi(s.baseUrl, s.signingKey);
  if (s.mode === 'OFF') throw new PlatformError('UNAVAILABLE', '셀러브릭스 연동이 꺼져 있습니다.');
  return mock;
}

/** 스튜디오는 실서버 배포 후 연동 — 지금은 꺼짐 */
export async function isPlatformEnabled(p: PlatformKey): Promise<boolean> {
  const s = await getPlatformSettings(p === 'SELLERBRICKS' ? 'sellerbricks' : 'studio');
  return s.mode !== 'OFF' && (p === 'SELLERBRICKS' || false);
}
