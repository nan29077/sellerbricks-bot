'use strict';
let demoLoggedIn = false;
const demoTurns = [];
const demoQuestions = ['오늘 주문 정리해줘', '이번 달 정산 얼마야?', '어제 방송 주문 몇 건이야?'];

function sampleReply(text, image) {
  const answers = [
    { pattern: /정산|출금/, title: '이번 달 정산', text: '샘플 정산 예정액은 328,000원입니다.', items: [['정산 예정', '328,000원'], ['출금 가능', '120,000원']] },
    { pattern: /방송/, title: '어제 방송 실적', text: '샘플 방송에서 주문 8건이 들어왔습니다.', items: [['주문', '8건'], ['매출', '248,000원']] },
    { pattern: /입금|결제/, title: '미입금 주문', text: '샘플 주문 2건이 입금을 기다리고 있습니다.', items: [['미입금', '2건 · 58,000원']] },
    { pattern: /송장|배송/, title: '배송 준비', text: '샘플 주문 3건에 송장 입력이 필요합니다.', items: [['송장 미입력', '3건']] },
    { pattern: /주문|매출|리포트/, title: '오늘 주문 상태', text: '샘플 주문 12건, 결제 매출 486,000원입니다.', items: [['결제 완료', '9건'], ['배송 준비', '3건']] },
  ];
  if (image) return { text: '첨부 사진의 표시를 확인할 수 있어요. 이 화면에서는 사진을 전송하지 않습니다.', quickReplies: demoQuestions };
  const answer = answers.find(({ pattern }) => pattern.test(text));
  if (!answer) return { text: '샘플 화면에서는 주문, 정산, 방송 실적을 확인할 수 있어요. 아래 질문을 선택해 보세요.', quickReplies: demoQuestions };
  return { text: answer.text, card: { title: answer.title, items: answer.items.map(([title, description]) => ({ title, description })) }, quickReplies: demoQuestions };
}

async function previewApi(path, { body } = {}) {
  switch (path) {
    case '/me': return { loggedIn: demoLoggedIn, webEnabled: true, studioOpen: false, links: demoLoggedIn ? [{ platform: 'SELLERBRICKS', label: '셀러브릭스', accountName: '샘플 셀러' }] : [], unread: 0 };
    case '/login': demoLoggedIn = true; return { ok: true, accountName: '샘플 셀러' };
    case '/logout':
    case '/unlink': demoLoggedIn = false; return { ok: true, loggedOut: true };
    case '/history': return { items: demoTurns, more: false };
    case '/message': {
      const bot = sampleReply(body.text || '', body.image);
      demoTurns.push({ at: new Date().toISOString(), user: body.text || '[사진 1장]', bot });
      return bot;
    }
    case '/prefs': return { engine: false, kinds: [] };
    case '/notifications': return [];
    default: throw new Error('GitHub 미리보기에서 제공하지 않는 기능입니다.');
  }
}
