// 자체 점검 — 별도 테스트 DB(data/selftest.db)로 전체 흐름을 확인한다. 실행: npm run selftest
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

process.env.DATABASE_URL = 'file:../data/selftest.db';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
process.env.LOG_LEVEL = 'error';
rmSync('data/selftest.db', { force: true });
execSync('npx prisma db push --skip-generate', { stdio: 'ignore', env: process.env });

const { buildApp } = await import('../src/server.js');
const { config } = await import('../src/lib/config.js');
const { getKakaoSkillSecret } = await import('../src/lib/settings.js');
const app = await buildApp();

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
}

// 1. 상태
const health = await app.inject({ method: 'GET', url: '/health' });
check('GET /health', health.statusCode === 200 && health.json().ok === true);
check('포트 설정 3071', config.port === 3071 || !!process.env.PORT, String(config.port));

// 2. 로그인
check('로그인 전 API 차단', (await app.inject({ method: 'GET', url: '/admin/api/state' })).statusCode === 401);
check('틀린 비밀번호 거부', (await app.inject({ method: 'POST', url: '/admin/api/login', payload: { password: 'wrong' } })).statusCode === 401);
const login = await app.inject({ method: 'POST', url: '/admin/api/login', payload: { password: config.adminPassword } });
const cookie = String(login.headers['set-cookie'] || '').split(';')[0];
check('로그인 성공', login.statusCode === 200 && cookie.startsWith('sb_admin='));
const A = { cookie };

const page = await app.inject({ method: 'GET', url: '/admin/classic' });
check('관리자 화면(클래식) HTML', page.statusCode === 200 && page.body.indexOf('API 키 설정') < page.body.indexOf('사용할 AI 선택'), '키 카드가 맨 위');
const newPage = await app.inject({ method: 'GET', url: '/admin' });
check('관리자 화면(새 디자인) + /assets', newPage.statusCode === 200 && !newPage.body.includes('{{PUBLIC_ORIGIN}}') && (await app.inject({ method: 'GET', url: '/assets/admin.css' })).statusCode === 200 && (await app.inject({ method: 'GET', url: '/assets/..%2F.env' })).statusCode === 404);
const shareCard = await app.inject({ method: 'GET', url: '/assets/share-card.jpg' });
check('카카오톡 공유 카드', newPage.body.includes('셀러의 하루, 대화로 정리하다') && newPage.body.includes(`${config.publicBaseUrl}/assets/share-card.jpg`) && shareCard.statusCode === 200 && shareCard.headers['content-type'] === 'image/jpeg' && shareCard.rawPayload[0] === 0xff && shareCard.rawPayload[1] === 0xd8);

const state = (await app.inject({ method: 'GET', url: '/admin/api/state', headers: A })).json();
check('키 없음 → 가짜 응답 모드', state.llm.effective === 'MOCK' && state.keys.anthropic.status === 'NONE');
check('도구 23개 노출 (스튜디오 4개 포함, MCP 읽기 전용 표시)', state.tools.length === 23 && state.tools.every((t: { annotations?: { readOnlyHint?: boolean } }) => typeof t.annotations?.readOnlyHint === 'boolean'), String(state.tools.length));

// 3. 연결 전 질문
const chat = async (text: string, user = 'selftest-user') => (await app.inject({ method: 'POST', url: '/admin/api/chat', headers: A, payload: { botUserKey: user, text } })).json();
let r = await chat('오늘 주문 정리해줘');
check('연결 전 안내', r.reply.text.includes('연결된 계정이 없어요'));

// 4. 가짜 연결 코드
const code = (await app.inject({ method: 'POST', url: '/admin/api/mock/link-code', headers: A, payload: { accountId: 'mock-seller-1' } })).json();
check('연결 코드 6자리', /^\d{6}$/.test(code.code));
r = await chat('연결 000000');
check('틀린 코드 거부', r.reply.text.includes('맞지 않아요'));
r = await chat(`연결 ${code.code}`);
check('연결 성공', r.reply.text.includes('연결됐어요'), r.reply.text.split('\n')[0]);
r = await chat(`연결 ${code.code}`);
check('코드 1회용', r.reply.text.includes('맞지 않아요'));

// 5. 1-A 질문
const cases: [string, string][] = [
  ['오늘 주문 정리해줘', 'get_order_summary'],
  ['이번 주 매출 어때?', 'get_order_summary'],
  ['어제 방송 주문 몇 건이야?', 'get_live_orders'],
  ['그 전 방송은?', 'get_live_orders'],
  ['입금 안 된 주문 알려줘', 'get_unpaid_orders'],
  ['송장 안 넣은 주문', 'get_unshipped_orders'],
  ['취소 요청 어떻게 됐어?', 'get_cancel_requests'],
  ['이번 달 정산 얼마야?', 'get_settlement_summary'],
  ['지난달 정산', 'get_settlement_summary'],
  ['이번 주 많이 팔린 상품', 'get_top_products'],
  ['품절 임박 상품', 'get_products'],
  ['3번 상품 뭐였지?', 'get_products'],
];
for (const [q, tool] of cases) {
  r = await chat(q);
  const used = r.reply.toolLogs.map((l: { tool: string }) => l.tool);
  check(`"${q}" → ${tool}`, used.includes(tool) && r.reply.toolLogs.every((l: { ok: boolean }) => l.ok) && r.reply.text.length > 5, r.reply.text.split('\n')[0]);
}
// 주문 찾기 — 실제 존재하는 뒷번호로
r = await chat('김민지 주문 찾아줘');
check('"김민지 주문 찾아줘" → search_orders', r.reply.toolLogs.some((l: { tool: string }) => l.tool === 'search_orders'), r.reply.text.split('\n')[0]);
r = await chat('1234 주문 찾아줘');
check('"1234 주문 찾아줘" → search_orders', r.reply.toolLogs.some((l: { tool: string }) => l.tool === 'search_orders'));
r = await chat('날씨 어때?');
check('업무 외 질문 → 도움말', r.reply.text.includes('이렇게 물어보세요'));
r = await chat('도움말');
check('도움말 명령', r.reply.provider === 'SYSTEM' && r.reply.quickReplies.length > 0);
const orderPreview = await chat('오늘 주문 정리해줘');
const orderCard = orderPreview.kakao.template.outputs.find((o: Record<string, unknown>) => o.listCard)?.listCard;
check('테스트 채팅 리스트 카드와 이동 버튼', orderCard?.items.length > 0 && orderCard.buttons[0]?.action === 'webLink');

// 6. 개인정보 가림
r = await chat('김민지 주문 찾아줘');
check('검색 결과 이름 가림', !/김민지/.test(JSON.stringify(r.reply.card?.items ?? [])) || r.reply.text.includes('찾지 못했어요'));

// 7. 카카오 스킬
const secret = await getKakaoSkillSecret();
const skill = (text: string, extra: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: `/kakao/skill/${secret}`, payload: { userRequest: { utterance: text, user: { id: 'kakao-user-1', properties: { botUserKey: 'kakao-user-1' } }, ...extra } } });
check('잘못된 비밀 경로 404', (await app.inject({ method: 'POST', url: '/kakao/skill/wrong', payload: {} })).statusCode === 404);
let k = (await skill('도움말')).json();
check('스킬 응답 2.0 형식', k.version === '2.0' && !!k.template.outputs[0].simpleText);
k = (await skill('오늘 주문 정리해줘')).json();
check('카카오 미연결 사용자 안내', k.template.outputs[0].simpleText.text.includes('연결'));
const code2 = (await app.inject({ method: 'POST', url: '/admin/api/mock/link-code', headers: A, payload: { accountId: 'mock-seller-3' } })).json();
k = (await skill(`연결 ${code2.code}`)).json();
check('카카오에서 연결', k.template.outputs[0].simpleText.text.includes('산지직송'));
k = (await skill('오늘 주문 정리해줘')).json();
check('카카오 동기 응답(콜백 미승인)', k.version === '2.0' && k.template?.outputs?.[0]?.simpleText?.text.includes('주문 정리') && k.template.outputs.some((o: Record<string, unknown>) => o.listCard) && k.template.quickReplies.length > 0, k.template?.outputs?.[0]?.simpleText?.text.split('\n')[0]);
k = (await skill('이번 주 많이 팔린 상품', { callbackUrl: 'https://evil.example.com/cb' })).json();
check('콜백 사용 시 useCallback 즉시 응답', k.useCallback === true);
await new Promise((res) => setTimeout(res, 300));

// 8. 키 저장(가짜 키) → 연결 실패 → AI 선택해도 오류 시 가짜 응답으로 대체
const save = (await app.inject({ method: 'POST', url: '/admin/api/keys/anthropic', headers: A, payload: { key: 'sk-ant-api03-invalid-key-for-selftest-000000' } })).json();
check('키 저장 + 자동 테스트', save.ok && ['FAIL', 'OK'].includes(save.test.status), save.test.message);
const st2 = (await app.inject({ method: 'GET', url: '/admin/api/state', headers: A })).json();
check('키 가림 표시', st2.keys.anthropic.masked.includes('…') && !st2.keys.anthropic.masked.includes('invalid-key-for'));
r = await chat('오늘 주문 정리해줘');
check('AI 오류 시 가짜 응답 대체', r.reply.provider === 'MOCK' && !!r.reply.error, r.reply.error?.slice(0, 60));
await app.inject({ method: 'DELETE', url: '/admin/api/keys/anthropic', headers: A });
const st3 = (await app.inject({ method: 'GET', url: '/admin/api/state', headers: A })).json();
check('키 삭제 → 가짜 응답 모드', st3.llm.effective === 'MOCK');

// 9. 실제 모드 전환 검증
check('실제 모드는 주소·키 필요', (await app.inject({ method: 'POST', url: '/admin/api/platform/sellerbricks', headers: A, payload: { mode: 'LIVE' } })).statusCode === 400);
check('스튜디오 실제 모드는 주소·키 필요', (await app.inject({ method: 'POST', url: '/admin/api/platform/studio', headers: A, payload: { mode: 'LIVE' } })).statusCode === 400);


// ═══════════════ 2-1차 ═══════════════
const tools = (r2: { reply: { toolLogs: { tool: string; ok: boolean }[] } }) => r2.reply.toolLogs.map((l) => l.tool);
const allOk = (r2: { reply: { toolLogs: { ok: boolean }[] } }) => r2.reply.toolLogs.every((l) => l.ok);
const sbLink = async (user: string, acc = 'mock-seller-1') => {
  const c = (await app.inject({ method: 'POST', url: '/admin/api/mock/link-code', headers: A, payload: { accountId: acc } })).json();
  await chat(`연결 ${c.code}`, user);
};
await sbLink('v2-user');
const c2 = (q: string) => chat(q, 'v2-user');

// ① 범용 조회
r = await c2('이번 달 카드 주문 일별로');
check('자유 조회: 카드·일별', tools(r).includes('query_orders') && allOk(r) && r.reply.text.includes('카드') && r.reply.text.includes('[날짜별]'), r.reply.text.split('\n')[0]);
check('자유 조회: 결과 페이지 링크', !!r.reply.link?.url?.includes('/r/'));
r = await c2('5만원 이상 주문');
check('자유 조회: 금액 조건', tools(r).includes('query_orders') && r.reply.text.includes('50,000원 이상'));
r = await c2('지난달 상품별 판매');
check('자유 조회: 상품별', tools(r).includes('query_orders') && r.reply.text.includes('[상품별]'));
r = await c2('입금 안 된 주문이랑 송장 안 넣은 주문');
check('여러 질문 한 번에', tools(r).includes('get_unpaid_orders') && tools(r).includes('get_unshipped_orders'));
r = await c2('오늘 주문 정리해줘');
r = await c2('어제는?');
check('이어 묻기: "어제는?"', tools(r).includes('get_order_summary') && r.reply.text.includes('어제'), r.reply.text.split('\n')[0]);
r = await c2('그중 카드만');
check('이어 묻기: "그중 카드만"', tools(r).includes('query_orders') && r.reply.text.includes('카드'));
r = await c2('단골 고객 누구야?');
check('고객 분석', tools(r).includes('query_customers') && r.reply.text.includes('재구매'));
r = await c2('리뷰 답 안 한 거');
check('샵 현황(리뷰·크레딧)', tools(r).includes('get_shop_activity') && r.reply.text.includes('알림톡 크레딧'));
r = await c2('다음 방송 언제야?');
check('방송 일정', tools(r).includes('get_lives') && r.reply.text.includes('다음 방송'));
r = await c2('월별 정산 추이');
check('월별 정산 추이', tools(r).includes('get_settlement_history'));
r = await c2('안 팔린 상품');
check('상품 자유 조회', tools(r).includes('query_products'));

// ③ FAQ
r = await c2('정산 언제 들어와요?');
check('FAQ: 정산 시점', tools(r).includes('search_help') && r.reply.text.includes('영업일'), r.reply.text.split('\n')[0]);
r = await c2('카드 주문서 취소는 어떻게 해?');
check('FAQ: 카드 취소', tools(r).includes('search_help') && r.reply.text.includes('관리자'));
r = await c2('취소 요청 어떻게 됐어?');
check('"어떻게 됐어" 는 조회 (FAQ 아님)', tools(r).includes('get_cancel_requests'));

// ② 결과물
r = await c2('이번 달 매출 리포트 만들어줘');
check('리포트 생성', tools(r).includes('create_report') && !!r.reply.link?.url);
const rpath = new URL(r.reply.link.url).pathname;
const page2 = await app.inject({ method: 'GET', url: rpath });
check('결과 페이지 열림', page2.statusCode === 200 && page2.body.includes('매출 분석') && page2.headers['x-robots-tag'] === 'noindex, nofollow');
const csv = await app.inject({ method: 'GET', url: rpath + '/csv/' + page2.body.match(/csv\/(\d+)/)![1] });
check('CSV 다운로드(엑셀 한글 BOM)', csv.statusCode === 200 && csv.body.charCodeAt(0) === 0xfeff);
r = await c2('주문 목록 엑셀로');
check('주문 목록 결과물', tools(r).includes('create_report'));
const ol = await app.inject({ method: 'GET', url: new URL(r.reply.link.url).pathname });
check('주문 목록: 이름 가림·전화 뒷자리만', ol.statusCode === 200 && !/010-\d{4}-\d{4}/.test(ol.body) && /\*/.test(ol.body));
const { prisma } = await import('../src/lib/db.js');
await prisma.artifact.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
check('만료 링크 차단(410)', (await app.inject({ method: 'GET', url: rpath })).statusCode === 410);
r = await c2('3번 상품 방송 대본 써줘');
check('문구 작성: 방송 대본(실제 상품)', tools(r).includes('write_content') && r.reply.text.includes('3번'), r.reply.text.split('\n')[0]);
r = await c2('리뷰 답변 써줘 배송이 너무 늦어요');
check('문구 작성: 불만 리뷰 답변', tools(r).includes('write_content') && r.reply.text.includes('죄송'));

// ④ 설정·피드백
r = await c2('송장 지연 기준 3일로 해줘');
check('설정 저장', tools(r).includes('set_preference') && r.reply.text.includes('3일'));
r = await c2('송장 안 넣은 주문');
check('설정 반영(지연 기준 3일)', r.reply.text.includes('3일') || r.reply.text.includes('없어요'));
check('조회 답변에 피드백 버튼', r.kakao.template.quickReplies.some((q: { label: string; messageText: string }) => q.label === '도움 됨' && q.messageText === '도움 됨'));
r = await c2('도움 됨');
const fb = await prisma.chatLog.findFirst({ where: { feedback: 1 } });
check('피드백 저장', !!fb);

// ⑩ 상품 등록 (사진 없이)
r = await c2('간편 상품 등록해줘 수분앰플 32000원 20개');
check('상품 등록: 확인 카드', !!r.reply.basicCard && r.reply.basicCard.title.includes('수분앰플') && r.reply.basicCard.description.includes('32,000원'), r.reply.basicCard?.description);
check('상품 등록: 버튼 3개(마이샵 기본)', r.reply.basicCard?.buttons[0].label === '마이샵에 등록' && r.reply.basicCard?.buttons.length === 3);
r = await c2('가격 3만원으로');
check('상품 등록: 말로 수정', r.reply.basicCard?.description.includes('30,000원'));
r = await c2('오늘 주문 정리해줘');
check('등록 중 다른 질문 → 일반 답변', tools(r).includes('get_order_summary'));
r = await c2('방송 번호로도 등록');
check('상품 등록: 마이샵+방송 번호', /\d+번/.test(r.reply.text) && r.reply.basicCard?.buttons.some((b: { label: string }) => b.label === '판매 중지'), r.reply.text.split('\n')[1]);
r = await c2('방송 번호로도 등록');
check('상품 등록: 중복 등록 방지', r.reply.text.includes('등록 중인 상품이 없어요'));
const { sellerbricksApi } = await import('../src/platforms/index.js');
const qp = await (await sellerbricksApi()).queryProducts('mock:mock-seller-1', { keyword: '수분앰플' });
check('등록 상품이 조회에 반영(마이샵+주문서)', qp.items.filter((x) => x.isActive).length === 2 && qp.items.some((x) => x.kind === 'QUICK' && x.linkNo === 9), JSON.stringify(qp.items.map((x) => [x.kind, x.linkNo])));
r = await c2('판매 중지');
check('판매 중지', r.reply.text.includes('판매를 중지'));

// ⑩ 상품 등록 (사진)
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let ir = (await app.inject({ method: 'POST', url: '/admin/api/chat', headers: A, payload: { botUserKey: 'v2-user', text: '간편 상품 등록해줘 3만2천원', image: { base64: png, contentType: 'image/png' } } })).json();
check('사진 등록: 상품명 질문(가짜 모드)', ir.reply.text.includes('상품명'), ir.reply.text.split('\n')[0]);
ir = (await app.inject({ method: 'POST', url: '/admin/api/chat', headers: A, payload: { botUserKey: 'v2-user', text: '비타민 세럼' } })).json();
check('사진 등록: 사진 카드', !!ir.reply.basicCard?.imageUrl && ir.reply.basicCard.description.includes('32,000원'));
const imgRes = await app.inject({ method: 'GET', url: new URL(ir.reply.basicCard.imageUrl).pathname });
check('사진 저장·제공', imgRes.statusCode === 200 && imgRes.headers['content-type'] === 'image/png');
check('카카오 사진 카드 형식', !!ir.kakao.template.outputs.find((o: Record<string, unknown>) => o.basicCard));
ir = (await app.inject({ method: 'POST', url: '/admin/api/chat', headers: A, payload: { botUserKey: 'v2-user', text: '취소' } })).json();
check('사진 등록: 취소', ir.reply.text.includes('취소했어요'));

// 단위 점검
const { parseKoreanMoney, parseProductText } = await import('../src/product/draft.js');
check('금액 해석', parseKoreanMoney('3만2천원') === 32000 && parseKoreanMoney('32,000원') === 32000 && parseKoreanMoney('1.5만원') === 15000);
const pf = parseProductText('꿀사과 5kg 35000원 재고 10개 배송비 무료 옵션 크기 중/대');
check('상품 문장 해석', pf.price === 35000 && pf.stock === 10 && pf.shippingFee === 0 && pf.options?.[0].values.length === 2, JSON.stringify(pf));
const { checkAdText } = await import('../src/lib/adcheck.js');
check('광고 문구 점검', checkAdText('여드름 치료 효과 100% 효과 부작용 없음').length >= 2);
const { verifyNumbers } = await import('../src/agent/agent.js');
check('숫자 검증', verifyNumbers('합계 12,345원', [{ a: 12345 }]) === undefined && !!verifyNumbers('합계 99,999원', [{ a: 12345 }]));
const { extractImages } = await import('../src/kakao/routes.js');
const ex = extractImages({ userRequest: { utterance: '등록해줘' }, action: { params: { photo: JSON.stringify({ secureUrls: 'List(https://talk.kakaocdn.net/a.jpg, https://talk.kakaocdn.net/b.jpg)' }) } } });
check('카카오 보안 이미지 추출', ex.images.length === 2 && ex.text === '등록해줘');
const { savePending } = await import('../src/bot.js');
await savePending('pending-user', '느린 질문', new Promise((res) => setTimeout(() => res({ text: '느린 답', quickReplies: [], provider: 'MOCK', model: null, tokensIn: 0, tokensOut: 0, toolLogs: [], latencyMs: 0 }), 300)));
const pk = (await app.inject({ method: 'POST', url: `/kakao/skill/${await getKakaoSkillSecret()}`, payload: { userRequest: { utterance: '결과 보기', user: { id: 'pending-user' } } } })).json();
check('[결과 보기] 준비 중', pk.template.outputs[0].simpleText.text.includes('준비 중'));
await new Promise((res) => setTimeout(res, 400));
const pk2 = (await app.inject({ method: 'POST', url: `/kakao/skill/${await getKakaoSkillSecret()}`, payload: { userRequest: { utterance: '결과 보기', user: { id: 'pending-user' } } } })).json();
check('[결과 보기] 결과 전달', pk2.template.outputs[0].simpleText.text === '느린 답');

// FAQ 관리
const fq = (await app.inject({ method: 'POST', url: '/admin/api/faq', headers: A, payload: { category: '테스트', question: '셀프테스트 질문입니다', answer: '셀프테스트 답변', keywords: '셀프테스트' } })).json();
check('FAQ 추가', !!fq.id);
const fs2 = (await app.inject({ method: 'POST', url: '/admin/api/faq/search', headers: A, payload: { query: '셀프테스트' } })).json();
check('FAQ 검색', fs2[0]?.id === fq.id);

// 10. 로그·해제
const logs = (await app.inject({ method: 'GET', url: '/admin/api/logs', headers: A })).json();
check('대화 로그 저장', logs.length > 10 && logs.some((l: { tools: unknown[] }) => l.tools.length > 0));
r = await chat('연결 해제');
check('연결 해제', r.reply.text.includes('해제했어요'));

// 11. 속도 제한
let limited = false;
for (let i = 0; i < 12; i++) {
  const res = (await app.inject({ method: 'POST', url: `/kakao/skill/${secret}`, payload: { userRequest: { utterance: '날씨', user: { id: 'rate-user' } } } })).json();
  if (res.template?.outputs?.[0]?.simpleText?.text?.includes('너무 빨라요')) limited = true;
}
check('카카오 속도 제한(1분 10회)', limited);

// ═══ 3차: 웹챗 · 앱 · 시작 페이지 · 스튜디오 · 알림 · 운영 · MCP ═══
const H = { 'x-requested-with': 'sbchat' };
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie'] || '').split(';')[0];
const post = (url: string, payload: unknown, headers: Record<string, string> = A) => app.inject({ method: 'POST', url, headers, payload: payload as object });

// 시작 페이지
const startPage = await app.inject({ method: 'GET', url: '/' });
check('시작 페이지 (/)', startPage.statusCode === 200 && startPage.body.includes('id="channels"') && !startPage.body.includes('{{START_CONFIG}}') && String(startPage.headers['content-security-policy']).includes("default-src 'self'"));
check('시작 페이지 QR(웹챗)', (await app.inject({ method: 'GET', url: '/start/qr.svg?for=web' })).body.startsWith('<svg'));
check('카카오 채널 주소 형식 검사', (await post('/admin/api/channels', { kakaoUrl: 'https://example.com/x' })).statusCode === 400);
await post('/admin/api/channels', { kakaoUrl: 'http://pf.kakao.com/_testCh' });
const sc = (await app.inject({ method: 'GET', url: '/start/config' })).json();
check('시작 페이지 카카오 바로가기', sc.kakao?.chat === 'http://pf.kakao.com/_testCh/chat' && sc.kakao?.add === 'http://pf.kakao.com/_testCh/friend' && sc.app === null);

// APK 올리기 · 내려받기
const fakeApk = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(4096, 1)]);
check('APK 아닌 파일 거부', (await app.inject({ method: 'POST', url: '/admin/api/channels/apk?version=0.0.1', headers: { ...A, 'content-type': 'application/vnd.android.package-archive' }, payload: Buffer.alloc(4096, 2) })).statusCode === 400);
const up = await app.inject({ method: 'POST', url: '/admin/api/channels/apk?version=1.2.3', headers: { ...A, 'content-type': 'application/vnd.android.package-archive' }, payload: fakeApk });
check('APK 올리기', up.statusCode === 200 && up.json().version === '1.2.3');
check('앱 꺼져 있으면 내려받기 404', (await app.inject({ method: 'GET', url: '/download/app.apk' })).statusCode === 404);
await post('/admin/api/channels', { appEnabled: true });
const dl = await app.inject({ method: 'GET', url: '/download/app.apk' });
check('APK 내려받기', dl.statusCode === 200 && dl.headers['content-type'] === 'application/vnd.android.package-archive' && dl.rawPayload.length === fakeApk.length);
check('시작 페이지에 앱 버튼', (await app.inject({ method: 'GET', url: '/start/config' })).json().app?.version === '1.2.3');

// 웹챗 화면·보안
const chatPage = await app.inject({ method: 'GET', url: '/chat' });
check('웹챗 화면 + 보안 헤더', chatPage.statusCode === 200 && chatPage.body.includes('AI 셀러 비서') && String(chatPage.headers['content-security-policy']).includes("frame-ancestors 'none'"));
const loginArt = await app.inject({ method: 'GET', url: '/assets/seller-login.webp' });
check('관리자·웹챗 로그인 이미지', newPage.body.includes('/assets/seller-login.webp') && chatPage.body.includes('/assets/seller-login.webp') && loginArt.statusCode === 200 && loginArt.headers['content-type'] === 'image/webp');
check('웹챗 PWA 설정', (await app.inject({ method: 'GET', url: '/chat/manifest.webmanifest' })).json().start_url.startsWith('/chat') && (await app.inject({ method: 'GET', url: '/chat/sw.js' })).headers['service-worker-allowed'] === '/chat');
check('웹챗 로그인 전', (await app.inject({ method: 'GET', url: '/chat/api/me' })).json().loggedIn === false);
check('위조 요청 차단(헤더 없음)', (await app.inject({ method: 'POST', url: '/chat/api/login', payload: { code: '123456' } })).statusCode === 403);
check('웹챗 틀린 코드 거부', (await post('/chat/api/login', { platform: 'SELLERBRICKS', code: '000000' }, H)).statusCode === 400);
check('로그인 없이 질문 거부', (await post('/chat/api/message', { text: '오늘 주문' }, H)).statusCode === 401);
const wcode = (await post('/admin/api/mock/link-code', { accountId: 'mock-seller-2' })).json().code;
const wl = await post('/chat/api/login', { platform: 'SELLERBRICKS', code: wcode }, H);
const W = { ...H, cookie: cookieOf(wl) };
check('웹챗 6자리 코드 로그인', wl.statusCode === 200 && W.cookie.startsWith('sb_chat=') && String(wl.headers['set-cookie']).includes('HttpOnly'));
const wme = (await app.inject({ method: 'GET', url: '/chat/api/me', headers: W })).json();
check('웹챗 로그인 상태·연결 계정', wme.loggedIn === true && wme.links.length === 1 && wme.links[0].platform === 'SELLERBRICKS' && wme.kakao?.chat);
let wr = (await post('/chat/api/message', { text: '오늘 주문 정리해줘' }, W)).json();
check('웹챗 질문 → 답변', wr.text.includes('주문') && wr.canRate === true && !wr.quickReplies.includes('도움 됨'));
const wlong = (await post('/chat/api/message', { text: '이번 달 매출 리포트 만들어줘' }, W)).json();
check('웹챗 결과물 링크', !!(wlong.link?.url || wlong.card?.button?.url));
const wh = (await app.inject({ method: 'GET', url: '/chat/api/history', headers: W })).json();
check('웹챗 대화 기록 (카드 포함)', wh.items.length === 2 && wh.items[0].user === '오늘 주문 정리해줘' && !!wh.items[0].bot.card);
check('웹챗 피드백', (await post('/chat/api/feedback', { id: wr.id, value: 1 }, W)).json().ok === true);
const reo = (await post('/chat/api/artifact/reopen', { url: wlong.link?.url || wlong.card?.button?.url }, W)).json();
check('결과물 다시 열기(본인 것)', typeof reo.url === 'string' && reo.url.includes('/r/'));
check('웹챗 help 는 웹 안내', (await post('/chat/api/message', { text: '도움말' }, W)).json().text.includes('오른쪽 위 메뉴'));
// 같은 계정으로 다른 기기에서 로그인 → 같은 대화 기록
const wcode2 = (await post('/admin/api/mock/link-code', { accountId: 'mock-seller-2' })).json().code;
const wl2 = await post('/chat/api/login', { platform: 'SELLERBRICKS', code: wcode2 }, { ...H, 'user-agent': 'Mozilla/5.0 (Linux; Android 14) SellerbricksBotApp/1.0' });
const W2 = { ...H, cookie: cookieOf(wl2), 'user-agent': 'Mozilla/5.0 (Linux; Android 14) SellerbricksBotApp/1.0' };
const wh2 = (await app.inject({ method: 'GET', url: '/chat/api/history', headers: W2 })).json();
check('다른 기기(앱) 로그인 → 같은 대화 기록', wh2.items.length >= 3 && (await app.inject({ method: 'GET', url: '/chat/api/me', headers: W2 })).json().client === 'APP');
await post('/chat/api/message', { text: '송장 안 넣은 주문' }, W2);
const appLog = (await app.inject({ method: 'GET', url: '/admin/api/logs', headers: A })).json();
check('앱 대화는 APP 채널로 기록', appLog.some((l: { channel: string }) => l.channel === 'APP'));

// 스튜디오 (가짜 데이터)
check('스튜디오 꺼짐이면 연결 안내', (await post('/chat/api/link', { platform: 'STUDIO', code: '123456' }, W)).json().error?.includes('배포 후'));
await post('/admin/api/platform/studio', { mode: 'MOCK' });
const scode = (await post('/admin/api/mock/link-code', { accountId: 'mock-studio-1', platform: 'STUDIO' })).json().code;
check('웹챗에서 스튜디오 계정 추가', (await post('/chat/api/link', { platform: 'STUDIO', code: scode }, W)).json().ok === true);
wr = (await post('/chat/api/message', { text: '수요일 화장품 방송 가능한 스튜디오 추천해줘' }, W)).json();
check('스튜디오 시설 찾기 (수요일·코스메틱)', /\(수\)/.test(wr.text) && wr.text.includes('코스메틱') && !!wr.card?.items?.length);
wr = (await post('/chat/api/message', { text: '내 스튜디오 예약 보여줘' }, W)).json();
check('내 스토리지 마켓 예약', wr.text.includes('스토리지 마켓 예약'));
wr = (await post('/chat/api/message', { text: '스토리지 마켓 주문 이번 달' }, W)).json();
check('스토리지 마켓 주문은 따로 표시', wr.text.includes('[스토리지 마켓 주문]'));
const meSm = (await app.inject({ method: 'GET', url: '/chat/api/me', headers: W })).json();
check('이름: 스토리지 마켓 (옛 스튜디오 표기 없음)', meSm.links.some((l: { platform: string; label: string }) => l.platform === 'STUDIO' && l.label === '스토리지 마켓') && !wr.text.includes('셀러브릭스 스튜디오'));
const kcode = (await post('/admin/api/mock/link-code', { accountId: 'mock-studio-2', platform: 'STUDIO' })).json().code;
r = await chat(`스토리지마켓 연결 ${kcode}`, 'kakao-sm-user');
check('카카오 명령 "스토리지마켓 연결 123456"', r.reply.text.includes('스토리지 마켓') && r.reply.text.includes('연결됐어요'));
r = await chat('연결 상태', 'kakao-sm-user');
check('연결 상태에 스토리지 마켓', r.reply.text.includes('스토리지 마켓: 연결됨'));
r = await chat('스토리지 마켓 연결 해제', 'kakao-sm-user');
check('스토리지 마켓 연결 해제', r.reply.text.includes('해제했어요'));
const { resolveDate } = await import('../src/tools/studio.js');
check('요일 → 날짜 계산', resolveDate('수요일', new Date('2026-11-13T03:00:00Z')) === '2026-11-18' && resolveDate('내일', new Date('2026-11-13T03:00:00Z')) === '2026-11-14');
const ss = (await app.inject({ method: 'GET', url: '/admin/api/state', headers: A })).json();
check('관리자 상태에 스튜디오 샘플 셀러', ss.mockStudioSellers.length === 2 && ss.platforms.studio.mode === 'MOCK');

// 알림
const pv = (await post('/admin/api/notify/preview', { kind: 'MORNING', botUserKey: 'selftest-user' })).json();
check('알림 미리보기(아침 요약)', pv.title?.includes('요약') || pv.empty === true);
const nr = (await post('/admin/api/notify/run', {})).json();
check('알림 실행 → 생성', nr.created >= 1 && nr.errors === 0, JSON.stringify(nr.byKind));
const nr2 = (await post('/admin/api/notify/run', {})).json();
check('같은 알림은 하루 1번', nr2.created === 0);
const nl = (await app.inject({ method: 'GET', url: '/chat/api/notifications', headers: W })).json();
check('웹챗 알림함', nl.length >= 1 && nl[0].read === false && (await app.inject({ method: 'GET', url: '/chat/api/me', headers: W })).json().unread >= 1);
await post('/chat/api/notifications/read', {}, W);
check('알림 읽음 처리', (await app.inject({ method: 'GET', url: '/chat/api/me', headers: W })).json().unread === 0);
await post('/chat/api/prefs', { key: 'UNPAID', on: false }, W);
check('셀러별 알림 끄기', (await app.inject({ method: 'GET', url: '/chat/api/prefs', headers: W })).json().kinds.find((k: { key: string }) => k.key === 'UNPAID').on === false);

// 비용 (⑤)
const { pickModel } = await import('../src/agent/agent.js');
const llmLike = { claudeModel: 'main', gptModel: 'gmain' };
const costLike = { autoModel: true, claudeLight: 'light', gptLight: 'glight' };
check('짧은 질문은 가벼운 모델', pickModel('CLAUDE', '오늘 주문', llmLike, costLike) === 'light' && pickModel('CLAUDE', '방송 대본 써줘', llmLike, costLike) === 'main' && pickModel('GPT', '정산', llmLike, { ...costLike, autoModel: false }) === 'gmain');
check('비용 설정 저장', (await post('/admin/api/cost', { dailyPerUser: 50 })).json().cost.dailyPerUser === 50);

// 채널 끄기
await post('/admin/api/channels', { webEnabled: false, kakaoEnabled: false });
check('웹챗 끄면 질문 503', (await post('/chat/api/message', { text: '오늘 주문' }, W)).statusCode === 503 && (await app.inject({ method: 'GET', url: '/chat/api/me' })).json().webEnabled === false);
check('카카오 끄면 웹챗 안내', (await skill('오늘 주문')).json().template.outputs[0].simpleText.text.includes('쉬고 있어요'));
await post('/admin/api/channels', { webEnabled: true, kakaoEnabled: true });

// MCP (외부 AI)
const mcpCall = (body: unknown, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url: '/mcp', headers: { 'content-type': 'application/json', ...headers }, payload: body as object });
check('MCP 꺼짐 → 503', (await mcpCall({ jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 503);
await post('/admin/api/mcp', { enabled: true });
check('MCP 토큰 없음 → 401', (await mcpCall({ jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 401);
const mcpUsers = (await app.inject({ method: 'GET', url: '/admin/api/mcp', headers: A })).json().users;
const webUser = mcpUsers.find((u: { channel: string }) => u.channel === 'WEB');
const tok = (await post('/admin/api/mcp/tokens', { userId: webUser.id, label: 'selftest' })).json().token as string;
const MT = { authorization: `Bearer ${tok}` };
check('MCP 토큰 발급', tok.startsWith('sbmcp_'));
const init = (await mcpCall({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, MT)).json();
check('MCP initialize', init.result?.protocolVersion === '2025-06-18' && init.result.capabilities.tools && init.result.serverInfo.name === 'sellerbricks-bot');
check('MCP 알림 메시지 → 202', (await mcpCall({ jsonrpc: '2.0', method: 'notifications/initialized' }, MT)).statusCode === 202);
const tl = (await mcpCall({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, MT)).json();
check('MCP tools/list (셀러브릭스+스튜디오)', tl.result.tools.length === 23 && tl.result.tools.every((t: { inputSchema?: unknown }) => !!t.inputSchema));
const tc = (await mcpCall({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_unpaid_orders', arguments: {} } }, MT)).json();
check('MCP tools/call', tc.result?.isError === false && tc.result.content[0].text.length > 10 && !!tc.result.structuredContent);
check('MCP 없는 도구 거부', (await mcpCall({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'drop_db', arguments: {} } }, MT)).json().error?.code === -32602);
check('MCP 브라우저 요청 차단', (await mcpCall({ jsonrpc: '2.0', id: 5, method: 'ping' }, { ...MT, origin: 'https://evil.example' })).statusCode === 403);
const mcpLog = (await app.inject({ method: 'GET', url: '/admin/api/logs', headers: A })).json();
check('MCP 호출 기록', mcpLog.some((l: { channel: string }) => l.channel === 'MCP'));

// 운영 (⑧)
const ops = (await app.inject({ method: 'GET', url: '/admin/api/ops', headers: A })).json();
check('운영 대시보드 채널별 집계', ops.channels.find((c: { channel: string }) => c.channel === 'WEB').month >= 3 && ops.audits.length > 0);
const users = (await app.inject({ method: 'GET', url: '/admin/api/users', headers: A })).json();
const wu = users.find((u: { channel: string; links: unknown[] }) => u.channel === 'WEB' && u.links.length);
await post(`/admin/api/users/${wu.id}/block`, { reason: 'selftest' });
check('셀러 차단 → 웹 세션 끊김·MCP 차단', (await post('/chat/api/message', { text: '오늘 주문' }, W)).statusCode === 401 && (await mcpCall({ jsonrpc: '2.0', id: 6, method: 'ping' }, MT)).statusCode === 401);
await post(`/admin/api/users/${wu.id}/unblock`, {});
const cl = (await post('/admin/api/ops/cleanup', {})).json();
check('기록 정리 실행', typeof cl.chatLogs === 'number');
check('세션 목록', Array.isArray((await app.inject({ method: 'GET', url: '/admin/api/sessions', headers: A })).json()));
check('약한 비밀번호 거부', (await post('/admin/api/password', { current: config.adminPassword, next: 'short' })).statusCode === 400);
check('현재 비밀번호 틀림 거부', (await post('/admin/api/password', { current: 'wrong-pass', next: 'NewPass12345' })).statusCode === 400);
check('비밀번호 변경', (await post('/admin/api/password', { current: config.adminPassword, next: 'NewPass12345' })).statusCode === 200);
check('변경 후 기존 로그인 풀림', (await app.inject({ method: 'GET', url: '/admin/api/state', headers: A })).statusCode === 401);
check('새 비밀번호로 로그인', (await post('/admin/api/login', { password: 'NewPass12345' }, {})).statusCode === 200 && (await post('/admin/api/login', { password: config.adminPassword }, {})).statusCode === 401);

await app.close();
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
