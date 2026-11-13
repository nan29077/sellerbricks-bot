// 로그·AI 전달용 개인정보 가림

/** 010-1234-5678 / 01012345678 → 010-****-5678 */
export function maskPhones(text: string): string {
  return text.replace(/(01[016789])[-\s.]?(\d{3,4})[-\s.]?(\d{4})/g, (_m, a, _b, c) => `${a}-****-${c}`);
}

/** 홍길동 → 홍*동, 김철 → 김*, 남궁민수 → 남**수 */
export function maskName(name: string): string {
  const n = (name || '').trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0] + '*';
  return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
}

export function maskForLog(text: string): string {
  return maskPhones(text).slice(0, 4000);
}
