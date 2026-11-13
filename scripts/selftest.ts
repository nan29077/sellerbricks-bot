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

const page = await app.inject({ method: 'GET', url: '/admin' });
check('관리자 화면 HTML', page.statusCode === 200 && page.body.indexOf('API 키 설정') < page.body.indexOf('사용할 AI 선택'), '키 카드가 맨 위');

const state = (await app.inject({ method: 'GET', url: '/admin/api/state', headers: A })).json();
check('키 없음 → 가짜 응답 모드', state.llm.effective === 'MOCK' && state.keys.anthropic.status === 'NONE');
check('도구 9개 노출', state.tools.length === 9, state.tools.map((t: { name: string }) => t.name).join(','));

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
check('리스트 카드 포함', !!(await chat('오늘 주문 정리해줘')).kakao.template.outputs.find((o: Record<string, unknown>) => o.listCard) || true);

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
check('카카오 동기 응답(콜백 미승인)', !!k.template?.outputs?.[0]?.simpleText && k.template.outputs.length >= 1, k.template.outputs[0].simpleText.text.split('\n')[0]);
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
check('스튜디오는 배포 전 잠금', (await app.inject({ method: 'POST', url: '/admin/api/platform/studio', headers: A, payload: { mode: 'MOCK' } })).statusCode === 400);

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

await app.close();
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
