// 결과물 — 셀러 전용 서명 링크(기본 30분)로 여는 결과 페이지 · CSV
// 링크 토큰은 추측 불가능한 랜덤 값이고, 만료·열람 횟수를 기록한다.
// 이름은 이미 가려진 값(홍*동), 전화번호는 뒷 4자리만 들어간다. 주소는 넣지 않는다.
import { config } from './config.js';
import { prisma } from './db.js';
import { randomToken } from './crypto.js';

export type Section =
  | { type: 'kpis'; items: { label: string; value: string; sub?: string }[] }
  | { type: 'bars'; title: string; unit: '원' | '건' | '개' | '명'; data: { label: string; value: number }[] }
  | { type: 'table'; title: string; columns: string[]; rows: (string | number)[][]; note?: string }
  | { type: 'text'; title?: string; body: string };

export interface ReportPayload {
  title: string;
  subtitle?: string;
  sections: Section[];
  footer?: string;
}

export async function createArtifact(botUserId: string, kind: 'REPORT' | 'TABLE' | 'TEXT', payload: ReportPayload) {
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + config.resultLinkMinutes * 60_000);
  await prisma.artifact.create({ data: { token, botUserId, kind, title: payload.title.slice(0, 200), payloadJson: JSON.stringify(payload), expiresAt } });
  return { token, url: `${config.publicBaseUrl}/r/${token}`, expiresAt };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (n: number) => Math.round(n).toLocaleString('ko-KR');

function renderSection(s: Section, i: number, token: string): string {
  if (s.type === 'kpis')
    return `<div class="kpis">${s.items.map((k) => `<div class="kpi"><div class="kl">${esc(k.label)}</div><div class="kv">${esc(k.value)}</div>${k.sub ? `<div class="ks">${esc(k.sub)}</div>` : ''}</div>`).join('')}</div>`;
  if (s.type === 'bars') {
    const max = Math.max(1, ...s.data.map((d) => d.value));
    return `<section><h2>${esc(s.title)}</h2><div class="bars">${s.data
      .map((d) => `<div class="bar"><span class="bl">${esc(d.label)}</span><span class="bt"><i style="width:${Math.max(1, (d.value / max) * 100).toFixed(1)}%"></i></span><span class="bv">${num(d.value)}${esc(s.unit)}</span></div>`)
      .join('')}</div></section>`;
  }
  if (s.type === 'table')
    return `<section><h2>${esc(s.title)} <a class="dl" href="/r/${token}/csv/${i}">엑셀(CSV) 받기</a></h2><div class="tw"><table><thead><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.rows
      .map((r) => `<tr>${r.map((c) => `<td>${typeof c === 'number' ? num(c) : esc(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}</section>`;
  return `<section>${s.title ? `<h2>${esc(s.title)}</h2>` : ''}<div class="text">${esc(s.body)}</div><button class="copy" onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText);this.textContent='복사됨'">복사하기</button></section>`;
}

export function renderArtifactPage(token: string, payload: ReportPayload, expiresAt: Date): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${esc(payload.title)}</title>
<style>
body{margin:0;font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;background:#f5f6f8;color:#1d2129;font-size:14px}
header{background:#1d2129;color:#fff;padding:16px 18px}header h1{margin:0;font-size:18px}header p{margin:4px 0 0;color:#cbd5e1;font-size:12px}
main{max-width:860px;margin:0 auto;padding:14px}
section,.kpis{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:14px;margin-bottom:12px}
h2{font-size:15px;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.kpi{background:#fafafa;border-radius:10px;padding:10px}.kl{font-size:12px;color:#6b7280}.kv{font-size:18px;font-weight:800;margin-top:2px}.ks{font-size:11px;color:#6b7280}
.bar{display:grid;grid-template-columns:90px 1fr 110px;gap:8px;align-items:center;margin:5px 0;font-size:12.5px}.bt{background:#f1f3f5;border-radius:6px;height:14px;overflow:hidden}.bt i{display:block;height:100%;background:#f5a700;border-radius:6px}.bv{text-align:right;font-variant-numeric:tabular-nums}.bl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{padding:7px 6px;border-bottom:1px solid #eef0f2;text-align:left;white-space:nowrap}th{color:#6b7280;font-weight:600;background:#fafafa}
.dl{font-size:12px;font-weight:600;color:#0369a1;text-decoration:none;border:1px solid #bae6fd;background:#f0f9ff;padding:4px 8px;border-radius:8px}
.text{white-space:pre-wrap;line-height:1.6}.copy{margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid #e3e6ea;background:#fff}
.note,.foot{font-size:12px;color:#6b7280}.tools{display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px}.tools button{padding:8px 12px;border:1px solid #e3e6ea;border-radius:8px;background:#fff}
@media print{.tools,.dl,.copy{display:none}body{background:#fff}section,.kpis{break-inside:avoid}}
</style></head><body>
<header><h1>${esc(payload.title)}</h1>${payload.subtitle ? `<p>${esc(payload.subtitle)}</p>` : ''}</header>
<main><div class="tools"><button onclick="window.print()">PDF로 저장 / 인쇄</button></div>
${payload.sections.map((s, i) => renderSection(s, i, token)).join('\n')}
<p class="foot">${esc(payload.footer ?? '')} 이 링크는 ${expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}까지 열 수 있어요. 개인정보 보호를 위해 이름 일부와 전화번호 뒷자리만 표시합니다.</p>
</main></body></html>`;
}

export function expiredPage(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>링크 만료</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;color:#334155"><h2>링크 유효시간이 지났어요</h2><p>개인정보 보호를 위해 결과 링크는 ${config.resultLinkMinutes}분 동안만 열려요.<br>카카오톡 챗봇에 같은 요청을 다시 보내 주세요.</p></body></html>`;
}

export function tableToCsv(s: Extract<Section, { type: 'table' }>): string {
  const cell = (v: string | number) => {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // 엑셀에서 한글이 깨지지 않도록 BOM 추가
  return '﻿' + [s.columns.map(cell).join(','), ...s.rows.map((r) => r.map(cell).join(','))].join('\r\n');
}
