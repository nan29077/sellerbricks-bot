// 챗봇 사용자(botUserKey) ↔ 플랫폼 계정 연결
// 코드 발급·검증은 각 플랫폼이 담당하고, 봇은 검증 결과(연결 토큰)만 암호화해 저장한다.
import { prisma } from '../lib/db.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { PLATFORM_LABEL, type PlatformKey, sellerbricksApi } from '../platforms/index.js';
import { MOCK_SELLERS } from '../platforms/sellerbricks/mock.js';
import { PlatformError } from '../platforms/sellerbricks/types.js';
import type { ToolContext } from '../tools/types.js';

export async function ensureBotUser(botUserKey: string) {
  return prisma.botUser.upsert({
    where: { botUserKey },
    create: { botUserKey },
    update: { lastSeenAt: new Date() },
  });
}

export async function getLinks(botUserId: string): Promise<ToolContext['links']> {
  const rows = await prisma.platformLink.findMany({ where: { botUserId } });
  const links: ToolContext['links'] = {};
  for (const r of rows) {
    const token = decrypt(r.linkToken);
    if (token) links[r.platform as PlatformKey] = { token, accountName: r.accountName };
  }
  return links;
}

export async function linkAccount(botUserId: string, botUserKey: string, platform: PlatformKey, code: string): Promise<string> {
  if (platform === 'STUDIO') return '셀러브릭스 스튜디오 연결은 스튜디오 실서버 배포 후 열릴 예정이에요.';
  try {
    const api = await sellerbricksApi();
    const r = await api.verifyLink(code, botUserKey);
    await prisma.platformLink.upsert({
      where: { botUserId_platform: { botUserId, platform } },
      create: { botUserId, platform, accountId: r.accountId, accountName: r.accountName, linkToken: encrypt(r.linkToken) },
      update: { accountId: r.accountId, accountName: r.accountName, linkToken: encrypt(r.linkToken) },
    });
    return `✅ ${PLATFORM_LABEL[platform]} "${r.accountName}" 계정이 연결됐어요!\n이제 "오늘 주문 정리해줘" 처럼 물어보세요.`;
  } catch (e) {
    if (e instanceof PlatformError) {
      if (e.code === 'LINK_EXPIRED') return '연결 코드 유효시간(5분)이 지났어요. 새 코드를 받아 다시 입력해 주세요.';
      if (e.code === 'LINK_INVALID') return '연결 코드가 맞지 않아요. 셀러 관리자 화면에 보이는 6자리 숫자를 다시 확인해 주세요.';
      return e.message;
    }
    throw e;
  }
}

export async function unlinkAccount(botUserId: string, platform?: PlatformKey): Promise<string> {
  const rows = await prisma.platformLink.findMany({ where: { botUserId, ...(platform ? { platform } : {}) } });
  if (!rows.length) return '연결된 계정이 없어요.';
  for (const r of rows) {
    const token = decrypt(r.linkToken);
    if (token && r.platform === 'SELLERBRICKS') {
      try {
        await (await sellerbricksApi()).revokeLink(token);
      } catch {
        /* 플랫폼 쪽 해제 실패해도 봇 쪽 연결은 끊는다 */
      }
    }
  }
  await prisma.platformLink.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return `연결을 해제했어요: ${rows.map((r) => `${PLATFORM_LABEL[r.platform as PlatformKey]}(${r.accountName})`).join(', ')}`;
}

export async function linkStatusText(botUserId: string): Promise<string> {
  const rows = await prisma.platformLink.findMany({ where: { botUserId } });
  const sb = rows.find((r) => r.platform === 'SELLERBRICKS');
  const st = rows.find((r) => r.platform === 'STUDIO');
  return [
    '🔗 연결 상태',
    `셀러브릭스: ${sb ? `연결됨 (${sb.accountName})` : '연결 안 됨'}`,
    `셀러브릭스 스튜디오: ${st ? `연결됨 (${st.accountName})` : '연결 안 됨 (배포 후 오픈 예정)'}`,
  ].join('\n');
}

/** 가짜 플랫폼용 연결 코드 발급 (관리자 화면 테스트) */
export async function issueMockLinkCode(accountId: string): Promise<{ code: string; accountName: string; expiresAt: Date }> {
  const seller = MOCK_SELLERS.find((s) => s.id === accountId) ?? MOCK_SELLERS[0];
  await prisma.mockLinkCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  let code = '';
  for (let i = 0; i < 10; i++) {
    code = String(100000 + Math.floor(Math.random() * 900000));
    if (!(await prisma.mockLinkCode.findUnique({ where: { code } }))) break;
  }
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await prisma.mockLinkCode.create({ data: { code, platform: 'SELLERBRICKS', accountId: seller.id, accountName: seller.name, expiresAt } });
  return { code, accountName: seller.name, expiresAt };
}
