// 사진 상품 등록 비서
// 흐름: 사진(+문장) → AI 초안(상품명·설명) + 문장에서 가격·재고·배송비 추출 → 빠진 것만 한 번에 질문
//       → 확인 카드 [마이샵에 등록] [방송 번호로도 등록] [취소] → 등록 → [상품 보기] [판매 중지]
// 기본 등록 위치: 간편 상품(마이샵 진열용, DirectProduct). [방송 번호로도 등록] = 주문서용 간편 상품(평생번호)도 함께.
import type { AgentOutput, BasicCard } from '../agent/types.js';
import { extractProductFromImage, visionAvailable } from '../agent/vision.js';
import { adIssuesText, checkAdText } from '../lib/adcheck.js';
import { config } from '../lib/config.js';
import { randomToken } from '../lib/crypto.js';
import { prisma } from '../lib/db.js';
import { won } from '../lib/time.js';
import { sellerbricksApi } from '../platforms/index.js';
import { PlatformError } from '../platforms/sellerbricks/types.js';
import type { ToolContext } from '../tools/types.js';

const DRAFT_MINUTES = 30;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface IncomingImage {
  url?: string;
  base64?: string;
  contentType?: string;
}

type Draft = NonNullable<Awaited<ReturnType<typeof prisma.productDraft.findFirst>>>;

const out = (text: string, extra: Partial<AgentOutput> = {}): AgentOutput => ({ text, quickReplies: [], provider: 'SYSTEM', model: null, tokensIn: 0, tokensOut: 0, toolLogs: [], ...extra });

// ── 사진 저장 ─────────────────────────────────────────

/** 카카오 보안 이미지 링크는 곧 만료되므로 받자마자 저장. SSRF 방지를 위해 카카오 이미지 호스트만 허용 */
function allowedImageHost(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return /(^|\.)kakaocdn\.net$|(^|\.)kakao\.com$|(^|\.)daumcdn\.net$|(^|\.)kakaoenterprise\.com$/.test(h);
  } catch {
    return false;
  }
}

export async function storeImages(botUserId: string, images: IncomingImage[]): Promise<{ tokens: string[]; errors: string[] }> {
  const tokens: string[] = [];
  const errors: string[] = [];
  for (const img of images.slice(0, 5)) {
    try {
      let buf: Buffer;
      let ct = img.contentType || 'image/jpeg';
      if (img.base64) buf = Buffer.from(img.base64, 'base64');
      else if (img.url && allowedImageHost(img.url)) {
        const res = await fetch(img.url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ct = res.headers.get('content-type')?.split(';')[0] || ct;
        buf = Buffer.from(await res.arrayBuffer());
      } else {
        errors.push('허용되지 않은 이미지 주소');
        continue;
      }
      if (!/^image\/(jpeg|png|webp|gif)$/.test(ct)) throw new Error('이미지 형식이 아님');
      if (buf.length > MAX_IMAGE_BYTES) throw new Error('8MB 초과');
      const token = randomToken(18);
      await prisma.storedImage.create({ data: { token, botUserId, contentType: ct, bytes: buf } });
      tokens.push(token);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { tokens, errors };
}

const imageUrl = (token: string) => `${config.publicBaseUrl}/img/${token}`;

// ── 문장에서 값 뽑기 ──────────────────────────────────

/** "3만2천원", "32,000원", "1.5만원" → 32000 */
export function parseKoreanMoney(s: string): number | null {
  const t = s.replace(/\s/g, '');
  const km = t.match(/(\d+(?:\.\d+)?)만(?:(\d+)천)?(?:(\d+)백)?원?/);
  if (km) return Math.round(Number(km[1]) * 10000 + (km[2] ? Number(km[2]) * 1000 : 0) + (km[3] ? Number(km[3]) * 100 : 0));
  const kc = t.match(/(\d+)천(?:(\d+)백)?원/);
  if (kc) return Number(kc[1]) * 1000 + (kc[2] ? Number(kc[2]) * 100 : 0);
  const n = t.match(/(\d{1,3}(?:,\d{3})+|\d+)원/);
  if (n) return Number(n[1].replace(/,/g, ''));
  return null;
}

export interface ParsedFields {
  name?: string;
  description?: string;
  price?: number;
  stock?: number | null;
  shippingFee?: number;
  options?: { name: string; values: { label: string; addPrice: number; soldOut: boolean }[] }[];
}

export function parseProductText(raw: string): ParsedFields {
  const t = raw.replace(/\s+/g, ' ').trim();
  const f: ParsedFields = {};
  const name = t.match(/(?:상품명|이름|제품명)\s*(?:은|는|을|를|:|=)?\s*["']?([^,."'\n]{2,40})/);
  if (name) f.name = name[1].replace(/\s*(으로|로)\s*(해|바꿔|변경).*$/, '').trim();
  const desc = t.match(/설명\s*(?:은|는|:|=)\s*(.{2,500})$/);
  if (desc) f.description = desc[1].trim();

  // 배송비 먼저 (가격으로 오인하지 않도록 잘라냄)
  let rest = t;
  if (/무료\s*배송|배송비\s*(없|무료|0원?)/.test(rest)) {
    f.shippingFee = 0;
    rest = rest.replace(/무료\s*배송|배송비\s*(없음|없이|무료|0원?)/g, ' ');
  } else {
    const sh = rest.match(/배송비\s*(?:는|은|:)?\s*([\d,.]+\s*(?:만|천)?\s*[\d]*\s*원?)/);
    if (sh) {
      const v = parseKoreanMoney(sh[1].includes('원') ? sh[1] : sh[1] + '원');
      if (v !== null) f.shippingFee = v;
      rest = rest.replace(sh[0], ' ');
    }
  }
  // 재고
  if (/재고\s*(무제한|관리\s*안|없이|제한\s*없)|수량\s*(무제한|제한\s*없)/.test(rest)) f.stock = null;
  else {
    const st = rest.match(/재고\s*(?:는|은|:)?\s*(\d+)\s*개?|(\d+)\s*개(?:\s*(?:있|준비|재고))?/);
    if (st) f.stock = Number(st[1] ?? st[2]);
  }
  rest = rest.replace(/재고\s*(?:는|은|:)?\s*\d+\s*개?|\d+\s*개/g, ' ');
  // 가격
  const pr = rest.match(/(?:가격|판매가|금액)\s*(?:은|는|:|=)?\s*([\d,.]+\s*(?:만|천)?\s*[\d]*\s*(?:천|백)?\s*원?)/);
  if (pr) f.price = parseKoreanMoney(pr[1].includes('원') ? pr[1] : pr[1] + '원') ?? undefined;
  else {
    const v = parseKoreanMoney(rest);
    if (v !== null) f.price = v;
    else {
      const bare = rest.match(/(?<![\d번])(\d{1,3}(?:,\d{3})+|\d{4,7})(?![\d번개])/);
      if (bare) f.price = Number(bare[1].replace(/,/g, ''));
    }
  }
  // 옵션: "옵션 색상 빨강/파랑/검정"
  const op = t.match(/옵션\s*(?:은|는|:)?\s*([가-힣A-Za-z]{1,10})\s+((?:[^/\s,]+\/)+[^/\s,]+)/);
  if (op) f.options = [{ name: op[1], values: op[2].split('/').map((v) => ({ label: v.trim(), addPrice: 0, soldOut: false })).filter((v) => v.label) }];
  // 이름이 따로 없으면 남는 단어로 추정 ("수분앰플 32000원 20개 등록해줘")
  if (!f.name) {
    const left = t
      .replace(/(?:간편\s*)?상품(?:으로)?|등록\s*해?\s*줘?|등록|올려\s*줘?|해\s*줘|부탁해?|요$|마이샵|방송|번호/g, ' ')
      .replace(/(?:가격|판매가|재고|배송비|옵션)[^,]*/g, ' ')
      .replace(/\d+\s*개/g, ' ')
      .replace(/[\d.]+\s*(?:만|천)\s*\d*\s*(?:천|백)?\s*원?|(?:\d{1,3}(?:,\d{3})+|\d{4,})\s*원?|\d+\s*원|무료|무제한|[,!?~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (left.length >= 2 && left.length <= 30 && !/^(이|이거|이것|사진|이\s*사진)$/.test(left)) f.name = left;
  }
  return f;
}

// ── 초안 관리 ─────────────────────────────────────────

export async function activeDraft(botUserId: string): Promise<Draft | null> {
  return prisma.productDraft.findFirst({ where: { botUserId, status: { in: ['COLLECTING', 'CONFIRM'] }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
}

export function isProductTrigger(text: string): boolean {
  if (/어떻게|방법|되나요|돼요\?|가능|\?$/.test(text)) return false; // "상품 등록 어떻게 해요?" 는 FAQ
  return /(간편\s*)?상품\s*(으로\s*)?(등록|올려)|등록\s*해\s*줘.*상품|상품\s*하나\s*(더\s*)?(등록|올려)/.test(text);
}

const DRAFT_COMMANDS = /^(마이샵에\s*등록|마이샵\s*등록|방송\s*번호로도\s*등록|마이샵\s*\+\s*방송\s*번호\s*등록|등록\s*취소|취소|그만|판매\s*중지)$/;
export const isDraftCommand = (t: string) => DRAFT_COMMANDS.test(t.replace(/\s+/g, ' ').trim());

function missing(d: Draft): string[] {
  const m: string[] = [];
  if (!d.name) m.push('상품명');
  if (d.price === null || d.price === undefined) m.push('가격');
  return m;
}

async function sellerShipping(ctx: ToolContext): Promise<number> {
  try {
    return (await (await sellerbricksApi()).getSellerDefaults(ctx.links.SELLERBRICKS!.token)).shippingFee;
  } catch {
    return 0;
  }
}

function summaryLine(d: Draft, ship: number): string {
  return [d.name ?? '(상품명)', d.price != null ? won(d.price) : '(가격)', d.stock === null ? '재고 무제한' : `재고 ${d.stock}개`, `배송비 ${(d.shippingFee ?? ship) === 0 ? '무료' : won(d.shippingFee ?? ship)}`].join(' · ');
}

async function confirmReply(d: Draft, ctx: ToolContext): Promise<AgentOutput> {
  const ship = await sellerShipping(ctx);
  const imgs = JSON.parse(d.imagesJson) as string[];
  const m = missing(d);
  if (m.length) {
    await prisma.productDraft.update({ where: { id: d.id }, data: { status: 'COLLECTING' } });
    const ask = m.includes('가격') && m.includes('상품명') ? '상품명과 가격을 알려주세요.\n예) 수분 앰플 32000원 20개' : m.includes('가격') ? '가격을 알려주세요. (재고·배송비도 함께 말해도 돼요)\n예) 32000원 20개, 배송비 무료' : '상품명을 알려주세요.\n예) 상품명 수분 앰플';
    return out(`상품 등록 중 — ${summaryLine(d, ship)}\n\n${ask}`, { quickReplies: ['취소'] });
  }
  await prisma.productDraft.update({ where: { id: d.id }, data: { status: 'CONFIRM' } });
  const opt = d.optionsJson ? (JSON.parse(d.optionsJson) as { name: string; values: { label: string }[] }[]).map((o) => `${o.name}: ${o.values.map((v) => v.label).join('/')}`).join(', ') : '';
  const desc = [summaryLine(d, ship), opt ? `옵션 ${opt}` : '', d.description ? `\n${d.description.slice(0, 120)}${d.description.length > 120 ? '…' : ''}` : ''].filter(Boolean).join('\n');
  const both = ctx.prefs.product_default_target === 'BOTH';
  const card: BasicCard = {
    imageUrl: imgs[0] ? imageUrl(imgs[0]) : undefined,
    title: `등록할까요? ${d.name}`,
    description: desc.slice(0, 230),
    buttons: both
      ? [{ label: '마이샵+방송 번호 등록', action: 'message', value: '방송 번호로도 등록' }, { label: '마이샵에만 등록', action: 'message', value: '마이샵에 등록' }, { label: '취소', action: 'message', value: '취소' }]
      : [{ label: '마이샵에 등록', action: 'message', value: '마이샵에 등록' }, { label: '방송 번호로도 등록', action: 'message', value: '방송 번호로도 등록' }, { label: '취소', action: 'message', value: '취소' }],
  };
  const warn = d.warnings ? `\n\n${d.warnings}` : '';
  return out(`확인해 주세요. 고칠 게 있으면 "가격 3만원으로"처럼 말하면 바로 바뀌어요.${warn}`, { basicCard: card });
}

export async function startDraft(botUserId: string, ctx: ToolContext, text: string, imageTokens: string[]): Promise<AgentOutput> {
  if (!ctx.links.SELLERBRICKS) return out('상품 등록은 셀러브릭스 계정을 연결한 뒤 쓸 수 있어요. "연결 방법"을 보내 보세요.', { quickReplies: ['연결 방법'] });
  await prisma.productDraft.updateMany({ where: { botUserId, status: { in: ['COLLECTING', 'CONFIRM'] } }, data: { status: 'CANCELLED' } });
  const f = parseProductText(text);
  let visionNote = '';
  let error: string | undefined;
  let provider: AgentOutput['provider'] = 'SYSTEM';
  if (imageTokens.length && (await visionAvailable())) {
    const img = await prisma.storedImage.findUnique({ where: { token: imageTokens[0] } });
    if (img) {
      const r = await extractProductFromImage({ base64: Buffer.from(img.bytes).toString('base64'), contentType: img.contentType }, text);
      if (r.draft) {
        f.name = f.name ?? r.draft.name;
        f.description = f.description ?? r.draft.description;
        visionNote = '사진을 보고 상품명·설명을 만들었어요. ';
        provider = (r.provider as AgentOutput['provider']) ?? 'SYSTEM';
      }
      error = r.error;
    }
  } else if (imageTokens.length) visionNote = '(가짜 응답 모드라 사진 분석은 건너뛰었어요) ';
  const issues = checkAdText(`${f.name ?? ''} ${f.description ?? ''}`);
  const d = await prisma.productDraft.create({
    data: {
      botUserId,
      status: 'COLLECTING',
      imagesJson: JSON.stringify(imageTokens),
      name: f.name ?? null,
      description: f.description ?? null,
      price: f.price ?? null,
      stock: f.stock === undefined ? null : f.stock,
      shippingFee: f.shippingFee ?? null,
      optionsJson: f.options ? JSON.stringify(f.options) : null,
      warnings: issues.length ? adIssuesText(issues) : null,
      expiresAt: new Date(Date.now() + DRAFT_MINUTES * 60_000),
    },
  });
  const r = await confirmReply(d, ctx);
  return { ...r, text: (visionNote + (imageTokens.length ? '' : '사진 없이 진행해요. 사진을 보내면 상품에 함께 올라가요.\n')) + r.text, provider, error };
}

/** 작성 중인 초안이 있을 때 들어온 메시지 처리. 상품 등록과 무관한 말이면 null (일반 질문으로 넘김) */
export async function continueDraft(d: Draft, botUserId: string, ctx: ToolContext, text: string, imageTokens: string[]): Promise<AgentOutput | null> {
  const t = text.replace(/\s+/g, ' ').trim();
  if (/^(등록\s*취소|취소|그만)$/.test(t)) {
    await prisma.productDraft.update({ where: { id: d.id }, data: { status: 'CANCELLED' } });
    return out('상품 등록을 취소했어요.', { quickReplies: ['오늘 주문 정리', '도움말'] });
  }
  if (/^(마이샵에?\s*(만\s*)?등록)$/.test(t)) return register(d, ctx, false);
  if (/^(방송\s*번호로도\s*등록|마이샵\s*\+\s*방송\s*번호\s*등록)$/.test(t)) return register(d, ctx, true);

  const data: Record<string, unknown> = {};
  if (imageTokens.length) data.imagesJson = JSON.stringify([...(JSON.parse(d.imagesJson) as string[]), ...imageTokens].slice(0, 5));
  const f = parseProductText(t);
  const isEdit = /가격|재고|배송비|상품명|이름|설명|옵션|\d\s*원|\d\s*개|무료/.test(t) || d.status === 'COLLECTING';
  if (!isEdit && !imageTokens.length) return null;
  if (f.name && (/상품명|이름|제품명/.test(t) || !d.name)) data.name = f.name;
  if (f.description) data.description = f.description;
  if (f.price !== undefined) data.price = f.price;
  if (f.stock !== undefined) data.stock = f.stock;
  if (f.shippingFee !== undefined) data.shippingFee = f.shippingFee;
  if (f.options) data.optionsJson = JSON.stringify(f.options);
  if (!Object.keys(data).length) {
    // 등록 중에 다른 질문을 하면 일반 답변으로 넘기고 초안은 그대로 둔다
    if (/주문|정산|방송|매출|송장|미입금|리포트|도움말|취소\s*요청|고객|리뷰/.test(t)) return null;
    if (d.status === 'COLLECTING') return confirmReply(d, ctx);
    return null;
  }
  const issues = checkAdText(`${data.name ?? d.name ?? ''} ${data.description ?? d.description ?? ''}`);
  data.warnings = issues.length ? adIssuesText(issues) : null;
  data.expiresAt = new Date(Date.now() + DRAFT_MINUTES * 60_000);
  const nd = await prisma.productDraft.update({ where: { id: d.id }, data });
  return confirmReply(nd, ctx);
}

async function register(d: Draft, ctx: ToolContext, alsoQuick: boolean): Promise<AgentOutput> {
  if (missing(d).length) return confirmReply(d, ctx);
  const api = await sellerbricksApi();
  const t = ctx.links.SELLERBRICKS!.token;
  try {
    const ship = d.shippingFee ?? (await sellerShipping(ctx));
    const imgs: string[] = [];
    for (const tok of JSON.parse(d.imagesJson) as string[]) {
      const img = await prisma.storedImage.findUnique({ where: { token: tok } });
      if (img) imgs.push((await api.uploadImage(t, { base64: Buffer.from(img.bytes).toString('base64'), contentType: img.contentType })).url);
    }
    const input = {
      name: d.name!,
      price: d.price!,
      description: d.description ?? undefined,
      images: imgs,
      stock: d.stock,
      shippingFee: ship,
      options: d.optionsJson ? JSON.parse(d.optionsJson) : undefined,
      idempotencyKey: d.id, // [등록]을 두 번 눌러도 한 번만
    };
    const direct = await api.createDirectProduct(t, input);
    const quick = alsoQuick ? await api.createQuickProduct(t, input) : null;
    await prisma.productDraft.update({ where: { id: d.id }, data: { status: 'DONE', resultJson: JSON.stringify({ direct, quick }) } });
    const lines = [`"${d.name}" 을(를) 마이샵 간편 상품으로 올렸어요. (${won(d.price!)})`];
    if (quick?.linkNo) lines.push(`방송에서 "${quick.linkNo}번"이라고 말하면 바로 주문받을 수 있어요.`);
    lines.push('실수했다면 [판매 중지]를 누르세요. 언제든 다시 켤 수 있어요.');
    return out(lines.join('\n'), {
      basicCard: {
        title: `${quick?.linkNo ? `${quick.linkNo}번 · ` : ''}${d.name}`,
        description: `${won(d.price!)} · ${d.stock === null ? '재고 무제한' : `재고 ${d.stock}개`}`,
        imageUrl: (JSON.parse(d.imagesJson) as string[])[0] ? imageUrl((JSON.parse(d.imagesJson) as string[])[0]) : undefined,
        buttons: [
          { label: '상품 보기', action: 'webLink', value: direct.shopUrl ?? direct.adminUrl },
          { label: '판매 중지', action: 'message', value: '판매 중지' },
        ],
      },
      quickReplies: ['상품 하나 더 등록', '방송 대본 써줘', '오늘 주문 정리'],
    });
  } catch (e) {
    const msg = e instanceof PlatformError ? e.message : '등록 중 문제가 생겼어요. 잠시 후 다시 [등록]을 눌러 주세요.';
    return out(`${msg}`, { quickReplies: ['마이샵에 등록', '취소'], error: e instanceof Error ? e.message : String(e) });
  }
}

/** [판매 중지] — 가장 최근 등록한 상품(7일 이내)을 비활성화 */
export async function stopLastProduct(botUserId: string, ctx: ToolContext): Promise<AgentOutput> {
  const d = await prisma.productDraft.findFirst({ where: { botUserId, status: 'DONE', updatedAt: { gt: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { updatedAt: 'desc' } });
  if (!d?.resultJson || !ctx.links.SELLERBRICKS) return out('최근 7일 안에 챗봇으로 등록한 상품이 없어요. 판매 중지는 셀러 관리자 화면에서 할 수 있어요.');
  const r = JSON.parse(d.resultJson) as { direct: { id: string }; quick: { id: string; linkNo: number } | null };
  const api = await sellerbricksApi();
  const t = ctx.links.SELLERBRICKS.token;
  await api.setProductActive(t, 'DIRECT', r.direct.id, false);
  if (r.quick) await api.setProductActive(t, 'QUICK', r.quick.id, false);
  await prisma.productDraft.update({ where: { id: d.id }, data: { status: 'STOPPED' } });
  return out(`"${d.name}" 판매를 중지했어요.${r.quick ? ` (${r.quick.linkNo}번 주문서 상품 포함)` : ''}\n다시 판매하려면 셀러 관리자 화면 > 상품 관리에서 켜 주세요.`, { quickReplies: ['상품 등록', '도움말'] });
}
