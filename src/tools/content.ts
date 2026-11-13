// 문구 작성 · FAQ 검색 도구
import { adIssuesText, checkAdText } from '../lib/adcheck.js';
import { createArtifact } from '../lib/artifacts.js';
import { prisma } from '../lib/db.js';
import { won } from '../lib/time.js';
import { sellerbricksApi } from '../platforms/index.js';
import type { ProductQueryItem } from '../platforms/sellerbricks/types.js';
import type { BotTool, ToolContext } from './types.js';

const KINDS = {
  product_description: '상품 설명',
  live_script: '방송 대본·멘트',
  notice: '공지문',
  sms_unpaid: '미입금 안내 문자',
  review_reply: '리뷰 답변',
  sns_post: 'SNS 홍보문',
  hashtags: '해시태그',
} as const;
type Kind = keyof typeof KINDS;

const GUIDE: Record<Kind, string[]> = {
  product_description: ['첫 줄에 핵심 장점 한 문장', '특징 3~5개를 짧은 줄로', '용량·구성·보관법 등 사실 정보', '과장·효능 표현 금지(치료·완치·100% 등)', '마지막에 구매 안내'],
  live_script: ['오프닝 인사 → 오늘 상품 소개 → 구매 방법(평생번호 "N번" 문자/주문서) → 마감 임박 멘트 → 클로징', '말하듯 짧은 문장', '상품마다 가격·번호를 또렷하게', '과장 표현 금지'],
  notice: ['제목 한 줄', '무엇이·언제·어떻게를 3~5줄로', '문의 방법'],
  sms_unpaid: ['90자 안팎(단문) 권장', '상호·주문 내용·금액·입금 기한', '정중하게, 재촉하는 느낌 최소화', '계좌번호는 셀러가 직접 넣도록 자리만 표시'],
  review_reply: ['감사 인사', '리뷰 내용에 구체적으로 반응', '불만이면 사과 + 해결 방법 안내', '3~4문장'],
  sns_post: ['첫 줄 후킹 문장', '방송 일시·혜택', '이모지 적당히', '해시태그 5~8개'],
  hashtags: ['상품·카테고리·상황 태그 10~15개', '너무 일반적인 태그만 쓰지 않기'],
};

function token(ctx: ToolContext): string {
  const l = ctx.links.SELLERBRICKS;
  if (!l) throw new Error('NOT_LINKED:SELLERBRICKS');
  return l.token;
}

function template(kind: Kind, p: ProductQueryItem | null, shop: string, topic: string, details: string): string {
  const name = p?.name ?? (topic || '상품');
  const price = p ? won(p.price) : '';
  const no = p?.linkNo ? `${p.linkNo}번` : '';
  switch (kind) {
    case 'product_description':
      return `${name}\n\n${details || '매일 쓰기 좋은, 셀러가 직접 써 보고 고른 상품이에요.'}\n\n· 판매가 ${price || '(가격)'}\n· 구성/용량: (입력해 주세요)\n· 보관/사용 방법: (입력해 주세요)\n\n궁금한 점은 상품 문의로 남겨 주세요`;
    case 'live_script':
      return `[오프닝]\n안녕하세요 여러분~ ${shop} 라이브 시작합니다! 오늘도 좋은 상품 가득 준비했어요.\n\n[상품 소개]\n오늘 첫 번째 상품은 ${name}${price ? `, 방송 특가 ${price}` : ''}이에요.\n${details || '제가 직접 써 보고 정말 좋아서 가져왔어요.'}\n\n[구매 방법]\n${no ? `문자로 "${no}"이라고 보내 주시면 주문서 링크가 바로 가요!` : '화면 아래 주문서 버튼으로 주문해 주세요!'}\n\n[마감 멘트]\n수량이 많지 않아서 곧 마감될 수 있어요. 고민은 배송만 늦출 뿐!\n\n[클로징]\n오늘도 함께해 주셔서 감사합니다. 다음 방송에서 또 만나요~`;
    case 'notice':
      return `[공지] ${topic || '안내드립니다'}\n\n${details || '안녕하세요, ' + shop + '입니다.\n(내용을 입력해 주세요)'}\n\n문의는 채팅/상품 문의로 남겨 주세요. 감사합니다.`;
    case 'sms_unpaid':
      return `[${shop}] 주문하신 ${name} 입금 확인이 아직이에요. 금액 ${price || '(금액)'} / 계좌 (계좌번호) — 오늘 자정까지 입금 부탁드려요 :)`;
    case 'review_reply':
      return /별로|불만|아쉽|적어|느려|파손|늦/.test(details)
        ? `소중한 후기 남겨 주셔서 감사합니다. 불편을 드려 정말 죄송해요. 말씀해 주신 부분은 바로 확인해서 개선하겠습니다. 채팅으로 연락 주시면 빠르게 도와드릴게요.`
        : `소중한 후기 감사합니다! 마음에 드셨다니 저희도 정말 기뻐요 다음 방송에서도 좋은 상품으로 찾아뵐게요!`;
    case 'sns_post':
      return `${topic || name} 라이브 특가!\n\n${details || `${shop}에서 오늘 밤 라이브로 만나요.`}\n${price ? `방송 특가 ${price}\n` : ''}\n#${shop.replace(/\s/g, '')} #라이브커머스 #라방 #특가 #${name.replace(/\s/g, '')}`;
    case 'hashtags':
      return [`#${name.replace(/\s/g, '')}`, `#${shop.replace(/\s/g, '')}`, '#라이브커머스', '#라방', '#라방특가', '#오늘의특가', '#쇼핑', '#추천템', '#내돈내산', '#선물추천'].join(' ');
  }
}

export const contentTools: BotTool[] = [
  {
    name: 'write_content',
    title: '문구 작성',
    description:
      '셀러 업무용 글을 쓴다. kind: product_description(상품 설명), live_script(방송 대본·멘트), notice(공지문), sms_unpaid(미입금 안내 문자), review_reply(리뷰 답변 — details 에 리뷰 내용), sns_post(SNS 홍보문), hashtags(해시태그). ' +
      'linkNo 또는 productKeyword 로 실제 상품 정보(이름·가격·번호)를 불러온다. 결과의 guidelines 를 지켜 직접 완성된 글을 써서 답할 것(summary 는 기본 양식). 과장·의약품 오인 표현 금지.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: Object.keys(KINDS) },
        linkNo: { type: 'integer', minimum: 1 },
        productKeyword: { type: 'string' },
        topic: { type: 'string', description: '주제·제목 (공지 제목, 방송 테마 등)' },
        details: { type: 'string', description: '넣을 내용, 리뷰 원문, 강조점 등' },
        tone: { type: 'string', enum: ['friendly', 'formal', 'energetic'], default: 'friendly' },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    platform: 'SELLERBRICKS',
    async run(ctx, args) {
      const kind = (Object.keys(KINDS).includes(String(args.kind)) ? args.kind : 'product_description') as Kind;
      const api = await sellerbricksApi();
      let product: ProductQueryItem | null = null;
      const linkNo = Number(args.linkNo) || undefined;
      const kw = typeof args.productKeyword === 'string' && args.productKeyword.trim() ? args.productKeyword.trim() : undefined;
      if (linkNo || kw) product = (await api.queryProducts(token(ctx), { linkNo, keyword: kw, limit: 1 })).items[0] ?? null;
      const shop = ctx.links.SELLERBRICKS?.accountName ?? '우리 샵';
      const topic = String(args.topic ?? '');
      const details = String(args.details ?? '');
      const text = template(kind, product, shop, topic, details);
      const issues = checkAdText(`${topic} ${details}`);
      const a = await createArtifact(ctx.botUserId, 'TEXT', { title: `${KINDS[kind]}${product ? ` · ${product.name}` : ''}`, sections: [{ type: 'text', title: KINDS[kind], body: text }] });
      return {
        summary: `${KINDS[kind]} 초안\n\n${text}${issues.length ? `\n\n${adIssuesText(issues)}` : ''}`,
        data: { kind: KINDS[kind], product: product ? { name: product.name, price: product.price, linkNo: product.linkNo } : null, shop, topic, details, tone: args.tone ?? 'friendly', guidelines: GUIDE[kind], adIssues: issues, draft: text },
        link: { label: '복사하기 좋게 보기', url: a.url },
      };
    },
  },
];

// ── FAQ 검색 ──────────────────────────────────────────

/** 한글 2글자 단위 + 단어 단위 토큰 */
function tokens(s: string): string[] {
  const t = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const words = t.split(/\s+/).filter((w) => w.length >= 2);
  const grams: string[] = [];
  for (const w of words) for (let i = 0; i < w.length - 1; i++) grams.push(w.slice(i, i + 2));
  return [...words, ...grams];
}

export async function searchFaq(query: string, limit = 3) {
  const docs = await prisma.faqDoc.findMany({ where: { isActive: true } });
  const q = tokens(query);
  const scored = docs
    .map((d) => {
      const hay = tokens(`${d.question} ${d.question} ${d.keywords} ${d.keywords} ${d.category} ${d.answer}`);
      const set = new Map<string, number>();
      for (const h of hay) set.set(h, (set.get(h) || 0) + 1);
      let score = 0;
      for (const t of new Set(q)) if (set.has(t)) score += (t.length >= 3 ? 3 : 1) + Math.log(1 + set.get(t)!);
      return { d, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => ({ id: x.d.id, category: x.d.category, question: x.d.question, answer: x.d.answer, score: Math.round(x.score) }));
}

export const helpTools: BotTool[] = [
  {
    name: 'search_help',
    title: 'FAQ·사용법 검색',
    description: '셀러브릭스 사용법·정책 FAQ 검색(수수료, 정산 일정, 출금, 원천징수, 취소·환불 규칙, 간편 상품 종류, 평생번호 문자 주문, 알림톡 크레딧, 배송비 규칙, 결제수단 등). "어떻게 해요?", "언제 들어와요?", "규칙이 뭐예요?" 질문에 사용. 결과에 없는 내용은 지어내지 말고 관리자 문의로 안내.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    platform: 'SELLERBRICKS',
    async run(_ctx, args) {
      const r = await searchFaq(String(args.query ?? ''));
      if (!r.length) return { summary: '관련 안내를 찾지 못했어요. 셀러브릭스 관리자에게 문의해 주세요. (셀러 관리자 화면 > 1:1 문의)', data: { results: [] } };
      return {
        summary: `${r[0].question}\n\n${r[0].answer}`,
        data: { results: r },
        card: r.length > 1 ? { title: '관련 안내', items: r.map((x) => ({ title: x.question, description: x.category })) } : undefined,
      };
    },
  },
];
