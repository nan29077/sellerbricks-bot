// 광고 문구 점검 — 식품·화장품 등에서 문제 되기 쉬운 과장·의약품 오인 표현을 찾아 순한 표현을 제안한다.
// (법률 자문이 아닌 1차 점검용. 최종 판단은 셀러 책임)
const RULES: { re: RegExp; why: string; suggest: string }[] = [
  { re: /치료|완치|낫(는|게|습)|고쳐/g, why: '질병 치료 효능(의약품 오인)', suggest: '"관리에 도움" 같은 표현' },
  { re: /염증|아토피|여드름\s*(치료|제거)|탈모\s*(치료|방지)/g, why: '질환명 + 효능', suggest: '"피부 컨디션 케어" 같은 표현' },
  { re: /항암|암\s*예방|혈압|혈당|당뇨|콜레스테롤/g, why: '질병 예방·치료 표현', suggest: '해당 표현 삭제' },
  { re: /면역력\s*(강화|증진|up)/gi, why: '건강기능식품 인정 기능이 아니면 사용 불가', suggest: '"건강한 일상" 같은 표현' },
  { re: /살\s*(이|을)?\s*빠|체지방\s*(감소|분해)|다이어트\s*효과|붓기\s*(제거|쏙)/g, why: '체중 감량 효능', suggest: '"가볍게 즐기는" 같은 표현' },
  { re: /피부\s*재생|주름\s*(제거|개선)|미백\s*효과/g, why: '기능성 화장품 심사 필요 표현', suggest: '심사받은 기능성 제품만 사용, 아니면 "촉촉한 피부결" 등' },
  { re: /100\s*%\s*(효과|만족|천연)|부작용\s*(없|제로|0)/g, why: '절대적·보장 표현', suggest: '근거 있는 사실만 표기' },
  { re: /국내\s*(최초|유일)|업계\s*1위|최고의?\s*효과|무조건/g, why: '근거 없는 최상급 표현', suggest: '근거(출처)를 함께 쓰거나 삭제' },
];

export interface AdIssue {
  word: string;
  why: string;
  suggest: string;
}

export function checkAdText(text: string): AdIssue[] {
  const out: AdIssue[] = [];
  for (const r of RULES) for (const m of text.matchAll(r.re)) if (!out.some((o) => o.word === m[0])) out.push({ word: m[0], why: r.why, suggest: r.suggest });
  return out.slice(0, 6);
}

export function adIssuesText(issues: AdIssue[]): string {
  if (!issues.length) return '';
  return '광고 문구 점검\n' + issues.map((i) => `· "${i.word}" — ${i.why} → ${i.suggest}`).join('\n');
}
