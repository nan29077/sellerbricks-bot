// AI 셀러 비서 웹챗 — 로그인(6자리 코드) · 대화 · 사진 · 결과물 · 알림 · 설정
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const state = { me: null, platform: 'SELLERBRICKS', busy: false, image: null, oldest: null, more: false, lastDay: '' };

const ICON = {
  orders: '<path d="M6 7h12l-1 12H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  unpaid: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
  ship: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/>',
  money: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.7 2.5 1.8-1 1.6-2.5 1.9-2.5.9-2.5 2 1 1.9 2.5 1.9 2.5-.8 2.5-1.8M12 6.5v1.2m0 8.6v1.2"/>',
  live: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  studio: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  chart: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  up: '<path d="M7 11v9H4v-9h3Zm0 0 4-7c1.5 0 2.5 1 2.2 2.6L12.6 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"/>',
  down: '<path d="M7 13V4H4v9h3Zm0 0 4 7c1.5 0 2.5-1 2.2-2.6L12.6 14H19a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.8 4H7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  kakao: '<path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9L6.5 20l3.7-2.4c.6.1 1.2.1 1.8.1 5 0 9-3.1 9-7s-4-6.7-9-6.7Z"/>',
  out: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m4-12 4 4-4 4m-5-4h9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01"/>',
  ext: '<path d="M14 4h6v6m0-6-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
};
/** 링크는 http(s) 만 허용 (플랫폼 응답에 이상한 주소가 와도 실행되지 않게) */
const safeUrl = (u) => { try { const x = new URL(String(u || ''), location.href); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };
const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ''}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SUGGEST_SB = [
  ['orders', '오늘 주문 정리해줘', '주문서·일반 주문 한눈에'],
  ['unpaid', '입금 안 된 주문', '미입금·미결제 확인'],
  ['ship', '송장 안 넣은 주문', '발송 지연 챙기기'],
  ['money', '이번 달 정산 얼마야?', '정산 예정·출금 가능'],
  ['live', '어제 방송 주문 몇 건이야?', '방송별 실적'],
  ['chart', '이번 달 매출 리포트 만들어줘', '표·차트·엑셀'],
];
const SUGGEST_ST = [
  ['studio', '수요일 화장품 방송 가능한 스튜디오', '빈 시간까지 찾아줘요'],
  ['studio', '내 스튜디오 예약', '다가오는 예약 확인'],
];
const WORKING = ['질문을 이해하고 있어요', '데이터를 확인하고 있어요', '숫자를 맞춰 보고 있어요', '답변을 정리하고 있어요'];

// ── API ───────────────────────────────────────────
const api = previewApi;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── 화면 전환 ─────────────────────────────────────
function only(id) {
  for (const v of ['loginView', 'chatView', 'offView']) $('#' + v).hidden = v !== id;
  $('#boot').hidden = true;
}

async function boot() {
  try {
    state.me = await api('/me');
  } catch {
    state.me = { loggedIn: false, webEnabled: true };
  }
  if (!state.me.webEnabled) { renderAlt($('#offAlt')); return only('offView'); }
  if (state.me.loggedIn) return showChat();
  showLogin();
}

// ── 자동 로그인: 셀러브릭스·스튜디오 "AI 셀러 비서" 메뉴의 [웹챗 열기] → /chat?platform=SELLERBRICKS&code=123456 ──
async function autoLogin() {
  const q = new URLSearchParams(location.search);
  const code = (q.get('code') || '').replace(/\D/g, '');
  const platform = q.get('platform') === 'STUDIO' ? 'STUDIO' : 'SELLERBRICKS';
  if (!q.has('code')) return false;
  // 주소창·방문 기록에 코드가 남지 않게 바로 지운다
  q.delete('code');
  q.delete('platform');
  history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
  if (code.length !== 6) return false;
  try {
    const r = await api('/login', { method: 'POST', body: { platform, code } });
    state.me = await api('/me');
    toast(`${r.accountName} 계정으로 시작해요`);
    showChat();
    return true;
  } catch (e) {
    if (state.me?.loggedIn) { toast('이미 로그인되어 있어요'); return false; }
    setPlatform(platform);
    showLogin();
    $('#loginError').textContent = `${e.message} 관리자 화면에서 다시 [웹챗 열기]를 누르거나 코드를 입력해 주세요.`;
    return true;
  }
}

// ── 로그인 ────────────────────────────────────────
function showLogin() {
  only('loginView');
  const seg = $('#platformSeg');
  const st = seg.querySelector('[data-platform="STUDIO"]');
  st.hidden = !state.me?.studioOpen;
  seg.classList.toggle('one', !state.me?.studioOpen);
  if (st.hidden && state.platform === 'STUDIO') setPlatform('SELLERBRICKS');
  renderAlt($('#loginAlt'));
  if (!matchMedia('(pointer: coarse)').matches) $('#otp0').focus({ preventScroll: true });
}

function renderAlt(box) {
  const me = state.me || {};
  const parts = [];
  if (me.kakao) parts.push(`<a class="btn btn-kakao btn-block" href="${esc(me.kakao.chat)}" target="_blank" rel="noopener">${svg('kakao')}카카오톡으로 이용하기</a>`);
  if (me.app && !isApp()) parts.push(`<a class="btn btn-block" href="${esc(me.app.url)}">${svg('phone')}안드로이드 앱 받기</a>`);
  box.innerHTML = parts.length ? `<div class="divider">또는</div>${parts.join('')}` : '';
}

const isApp = () => /SellerbricksBotApp/i.test(navigator.userAgent);

function setPlatform(p) {
  state.platform = p;
  for (const b of $('#platformSeg').children) b.setAttribute('aria-checked', String(b.dataset.platform === p));
  $('#howPlatform').textContent = p === 'STUDIO' ? '셀러브릭스 스튜디오' : '셀러브릭스';
}

function otpInputs() { return [...$('#otp').querySelectorAll('input')]; }
function otpValue() { return otpInputs().map((i) => i.value).join(''); }
function fillOtp(digits, from = 0) {
  const ins = otpInputs();
  [...digits].slice(0, 6 - from).forEach((d, k) => { ins[from + k].value = d; });
  const next = Math.min(5, from + digits.length);
  ins[next].focus();
  if (otpValue().length === 6) $('#loginForm').requestSubmit();
}

function setupLogin() {
  $('#platformSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-platform]');
    if (b) setPlatform(b.dataset.platform);
  });
  otpInputs().forEach((inp, i, all) => {
    inp.addEventListener('input', () => {
      const d = inp.value.replace(/\D/g, '');
      inp.value = '';
      if (d) fillOtp(d, i);
      $('#loginError').textContent = '';
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) { all[i - 1].value = ''; all[i - 1].focus(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' && i > 0) all[i - 1].focus();
      if (e.key === 'ArrowRight' && i < 5) all[i + 1].focus();
    });
    inp.addEventListener('paste', (e) => {
      const d = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
      if (d) { e.preventDefault(); fillOtp(d, 0); }
    });
  });
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = otpValue();
    const err = $('#loginError');
    if (code.length !== 6) { err.textContent = '6자리 숫자를 모두 입력해 주세요.'; return; }
    const btn = $('#loginButton');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '확인 중…';
    try {
      const r = await api('/login', { method: 'POST', body: { platform: state.platform, code } });
      state.me = await api('/me');
      toast(`${r.accountName} 계정으로 시작해요`);
      showChat();
    } catch (ex) {
      err.textContent = ex.message;
      $('#otp').classList.remove('shake');
      void $('#otp').offsetWidth;
      $('#otp').classList.add('shake');
      otpInputs().forEach((i) => { i.value = ''; });
      $('#otp0').focus();
    } finally {
      btn.disabled = false;
      btn.textContent = '시작하기';
    }
  });
}

// ── 채팅 ──────────────────────────────────────────
async function showChat() {
  only('chatView');
  renderAccount();
  $('#messages').innerHTML = '';
  state.lastDay = '';
  setQuick([]);
  await loadHistory();
  if (!$('#messages').children.length) renderWelcome();
  scrollDown(false);
  if (!matchMedia('(pointer: coarse)').matches) $('#input').focus();
}

function renderAccount() {
  const me = state.me || {};
  const links = me.links || [];
  const sb = links.find((l) => l.platform === 'SELLERBRICKS');
  const st = links.find((l) => l.platform === 'STUDIO');
  const line = sb && st ? (sb.accountName === st.accountName ? `${sb.accountName} · 셀러브릭스+스튜디오` : `${sb.accountName} · 스튜디오 ${st.accountName}`) : sb ? sb.accountName : st ? `${st.accountName} · 스튜디오` : '';
  $('#accountLine').innerHTML = line ? `<span class="live"></span>${esc(line)}` : '연결된 계정이 없어요';
  $('#bellDot').hidden = !me.unread;
  renderShortcuts();
}

function hasStudio() { return (state.me?.links || []).some((l) => l.platform === 'STUDIO'); }
function hasSb() { return (state.me?.links || []).some((l) => l.platform === 'SELLERBRICKS'); }

function suggestions() {
  const studio = hasStudio() ? SUGGEST_ST : [];
  return [...(hasSb() ? SUGGEST_SB.slice(0, 6 - studio.length) : []), ...studio];
}

function renderShortcuts() {
  const list = suggestions();
  $('#shortcutPanel').hidden = !list.length;
  $('#shortcutList').innerHTML = list.map(([ic, q]) =>
    `<button type="button" data-q="${esc(q)}">${svg(ic)}<span>${esc(q)}</span></button>`).join('');
}

function renderWelcome() {
  const list = suggestions();
  const el = document.createElement('div');
  el.className = 'welcome';
  el.innerHTML = `
    <div class="welcome-hero">
      <img src="/sellerbricks-bot/assets/app-icon.svg" alt="" width="52" height="52">
      <div><h2>무엇을 도와드릴까요?</h2><p>${hasSb() ? `주문·정산·방송${hasStudio() ? '·스튜디오를' : '을'}` : '스튜디오 예약·주문을'} 물어보세요.</p></div>
    </div>
    <div class="suggest">${list.map(([ic, q, sub]) => `<button type="button" data-q="${esc(q)}"><span class="ico">${svg(ic)}</span><b>${esc(q)}</b><span>${esc(sub)}</span></button>`).join('')}</div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]');
    if (b) send(b.dataset.q);
  });
  $('#messages').append(el);
}

$('#shortcutList').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-q]');
  if (button) send(button.dataset.q);
});

async function loadHistory(older = false) {
  try {
    const r = await api('/history' + (older && state.oldest ? `?before=${encodeURIComponent(state.oldest)}` : ''));
    if (!r.items.length) return;
    const frag = document.createDocumentFragment();
    const box = $('#messages');
    const prevH = $('#scroller').scrollHeight;
    if (older) box.querySelector('.more-btn')?.remove();
    const saveDay = state.lastDay;
    state.lastDay = '';
    if (r.more) {
      const more = document.createElement('button');
      more.className = 'more-btn';
      more.type = 'button';
      more.textContent = '이전 대화 보기';
      more.addEventListener('click', () => loadHistory(true));
      frag.append(more);
    }
    for (const it of r.items) {
      daySep(it.at, frag);
      frag.append(userMsg(it.user, null, it.at));
      frag.append(botMsg(it.bot, it.at));
    }
    state.oldest = r.items[0].at;
    if (older) {
      box.prepend(frag);
      state.lastDay = saveDay;
      $('#scroller').style.scrollBehavior = 'auto';
      $('#scroller').scrollTop = $('#scroller').scrollHeight - prevH;
      $('#scroller').style.scrollBehavior = '';
    } else box.append(frag);
    if (!older) setQuick(r.items[r.items.length - 1].bot.quickReplies || []);
  } catch { /* 기록 없음 */ }
}

function daySep(at, parent) {
  const d = new Date(at);
  const key = d.toDateString();
  if (key === state.lastDay) return;
  state.lastDay = key;
  const today = new Date().toDateString();
  const y = new Date(Date.now() - 86400000).toDateString();
  const label = key === today ? '오늘' : key === y ? '어제' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const el = document.createElement('div');
  el.className = 'day-sep';
  el.textContent = label;
  parent.append(el);
}

const timeOf = (at) => new Date(at || Date.now()).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

function userMsg(text, imgUrl, at) {
  const el = document.createElement('div');
  el.className = 'msg user';
  const t = String(text || '').replace(/^\[사진 \d+장\]\s*/, (m) => (imgUrl ? '' : m));
  el.innerHTML = `<div class="msg-col">${imgUrl ? `<img class="photo" alt="보낸 사진" src="${esc(imgUrl)}">` : ''}${t ? `<div class="bubble">${esc(t)}</div>` : ''}<div class="meta"><time>${timeOf(at)}</time></div></div>`;
  return el;
}

function botMsg(r, at, isError = false) {
  const el = document.createElement('div');
  el.className = 'msg bot' + (isError ? ' error' : '');
  const col = document.createElement('div');
  col.className = 'msg-col';
  col.innerHTML = `<div class="bubble">${md(r.text)}</div>`;
  if (r.basicCard) col.append(basicCard(r.basicCard));
  else if (r.card && r.card.items?.length) col.append(listCard(r.card));
  if (r.link && !(r.card?.button && r.card.button.url === r.link.url)) col.append(resultCard(r.link));
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<time>${timeOf(at)}</time>`;
  const copy = iconBtn('copy', '답변 복사');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(r.text); toast('복사했어요'); } catch { toast('복사하지 못했어요'); }
  });
  meta.append(copy);
  if (r.canRate && r.id) {
    const up = iconBtn('up', '도움이 됐어요');
    const down = iconBtn('down', '아쉬워요');
    down.classList.add('down');
    const paint = (v) => { up.classList.toggle('on', v === 1); down.classList.toggle('on', v === -1); };
    paint(r.rated || 0);
    let cur = r.rated || 0;
    const rate = async (v) => {
      const next = cur === v ? 0 : v;
      paint(next);
      try { await api('/feedback', { method: 'POST', body: { id: r.id, value: next } }); cur = next; if (next) toast(next === 1 ? '고마워요! 반영할게요' : '알려주셔서 고마워요. 더 나아질게요'); } catch { paint(cur); }
    };
    up.addEventListener('click', () => rate(1));
    down.addEventListener('click', () => rate(-1));
    meta.append(up, down);
  }
  col.append(meta);
  el.innerHTML = '<img class="mini" src="/sellerbricks-bot/assets/app-icon.svg" alt="">';
  el.append(col);
  return el;
}

function iconBtn(icon, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = svg(icon);
  return b;
}

function listCard(c) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<div class="card-head">${esc(c.title)}</div><ul class="card-list">${c.items.slice(0, 10).map((i) => `<li><b>${esc(i.title)}</b><span>${esc(i.description)}</span></li>`).join('')}</ul>`;
  if (c.button) {
    const act = document.createElement('div');
    act.className = 'card-actions';
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = safeUrl(c.button.url);
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `${esc(c.button.label)} ${svg('ext')}`;
    if (isResultUrl(c.button.url)) {
      a.className = 'btn btn-primary';
      a.addEventListener('click', (e) => { e.preventDefault(); openResult(c.button.url); });
    }
    act.append(a);
    el.append(act);
  }
  return el;
}

function basicCard(b) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `${b.imageUrl ? `<img class="cover" alt="" src="${esc(safeUrl(b.imageUrl))}">` : ''}<div class="card-body"><h3>${esc(b.title)}</h3><p>${esc(b.description)}</p></div>`;
  const act = document.createElement('div');
  act.className = 'card-actions';
  (b.buttons || []).forEach((x, i) => {
    const btn = document.createElement(x.action === 'webLink' ? 'a' : 'button');
    btn.className = 'btn' + (i === 0 ? ' btn-primary' : '');
    btn.textContent = x.label;
    if (x.action === 'webLink') { btn.href = safeUrl(x.value); btn.target = '_blank'; btn.rel = 'noopener'; }
    else { btn.type = 'button'; btn.addEventListener('click', () => send(x.value)); }
    act.append(btn);
  });
  if (act.children.length) el.append(act);
  return el;
}

function resultCard(link) {
  const el = document.createElement('div');
  el.className = 'card result';
  el.innerHTML = `<span class="ico">${svg('file')}</span><div><b>결과물이 준비됐어요</b><span>표·차트·엑셀(CSV)·PDF로 볼 수 있어요</span></div>`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary btn-sm';
  btn.textContent = link.label || '열기';
  btn.addEventListener('click', () => openResult(link.url));
  el.append(btn);
  return el;
}

function isResultUrl(u) {
  try { const x = new URL(u, location.href); return x.origin === location.origin && x.pathname.startsWith('/r/'); } catch { return false; }
}

/** 결과물 열기 — 만료(30분)됐으면 같은 내용으로 새 링크를 받아서 연다 */
async function openResult(url) {
  const w = isApp() ? null : window.open('about:blank', '_blank');
  try {
    const r = await api('/artifact/reopen', { method: 'POST', body: { url } });
    if (r.renewed) toast('새 링크로 열었어요');
    if (w) w.location.href = r.url; else location.href = r.url;
  } catch (e) {
    if (w) w.close();
    toast(e.message);
  }
}

// 간단한 마크다운: **굵게**, `코드`, - 목록, 1. 목록, | 표 |
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  let para = [];
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(https:\/\/[^\s<]+[^\s<.,)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      flushPara(); flushList();
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      i--;
      const isNum = (c) => /^[-+]?[\d,.]+\s*(원|건|개|명|%)?$/.test(c);
      out.push(`<div class="tbl"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td${isNum(c) ? ' class="num"' : ''}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const ul = l.match(/^\s*(?:[-*·•])\s+(.*)$/);
    const ol = l.match(/^\s*(\d{1,2})[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(ul ? ul[1] : ol[2]);
      continue;
    }
    if (!l.trim()) { flushPara(); flushList(); continue; }
    if (list && /^\s{2,}\S/.test(l)) { list.items[list.items.length - 1] += ' ' + l.trim(); continue; }
    flushList();
    para.push(l.replace(/^#{1,6}\s+/, ''));
  }
  flushPara(); flushList();
  return out.join('');
}

function setQuick(items) {
  const q = $('#quick');
  q.innerHTML = '';
  for (const t of items.slice(0, 8)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.addEventListener('click', () => send(t));
    q.append(b);
  }
}

function scrollDown(smooth = true) {
  const s = $('#scroller');
  requestAnimationFrame(() => s.scrollTo({ top: s.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
}

function typing() {
  const el = document.createElement('div');
  el.className = 'msg bot typing';
  el.innerHTML = '<img class="mini" src="/sellerbricks-bot/assets/app-icon.svg" alt=""><div class="msg-col"><div class="bubble"><span class="dots"><i></i><i></i><i></i></span><span class="label">질문을 이해하고 있어요</span></div></div>';
  let k = 0;
  const timer = setInterval(() => { k = Math.min(k + 1, WORKING.length - 1); el.querySelector('.label').textContent = WORKING[k]; }, 2200);
  el.stop = () => { clearInterval(timer); el.remove(); };
  return el;
}

async function send(text) {
  text = String(text ?? $('#input').value).trim();
  const image = state.image;
  if ((!text && !image) || state.busy) return;
  if (!navigator.onLine) { toast('인터넷 연결을 확인해 주세요'); return; }
  state.busy = true;
  $('.welcome')?.remove();
  const box = $('#messages');
  daySep(new Date(), box);
  box.append(userMsg(text, image?.preview, new Date()));
  $('#input').value = '';
  autoGrow();
  clearImage();
  setQuick([]);
  updateSend();
  const t = typing();
  box.append(t);
  scrollDown();
  try {
    const r = await api('/message', { method: 'POST', body: { text, ...(image ? { image: { base64: image.base64, contentType: image.type } } : {}) } });
    t.stop();
    box.append(botMsg(r, new Date()));
    setQuick(r.quickReplies || []);
    if (/연결됐어요|연결을 해제했어요/.test(r.text)) { state.me = await api('/me'); renderAccount(); }
  } catch (e) {
    t.stop();
    box.append(botMsg({ text: e.message || '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.' }, new Date(), true));
    setQuick(text ? [text] : []);
  } finally {
    state.busy = false;
    updateSend();
    scrollDown();
  }
}

// ── 입력창 ────────────────────────────────────────
function autoGrow() {
  const ta = $('#input');
  ta.style.height = 'auto';
  ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
}
function updateSend() { $('#sendButton').disabled = state.busy || (!$('#input').value.trim() && !state.image); }

function clearImage() {
  state.image = null;
  $('#attachPreview').hidden = true;
  $('#fileInput').value = '';
}

/** 사진은 긴 변 1600px JPEG 로 줄여서 보낸다 (데이터 절약) */
async function pickImage(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { toast('JPG·PNG·WEBP·GIF 사진만 보낼 수 있어요'); return; }
  if (file.size > 20 * 1024 * 1024) { toast('사진이 너무 커요 (20MB 이하)'); return; }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const dataUrl = file.type === 'image/gif' ? await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(file); }) : c.toDataURL('image/jpeg', 0.86);
    const base64 = String(dataUrl).split(',')[1];
    if (base64.length > 11_000_000) { toast('사진이 너무 커요 (8MB 이하)'); return; }
    state.image = { base64, type: file.type === 'image/gif' ? 'image/gif' : 'image/jpeg', preview: dataUrl };
    $('#attachImg').src = dataUrl;
    $('#attachInfo').textContent = `${c.width}×${c.height} · 상품 등록은 "간편 상품 등록해줘 32000원"처럼 함께 보내세요`;
    $('#attachPreview').hidden = false;
    updateSend();
    $('#input').focus();
  } catch {
    toast('사진을 읽지 못했어요');
  }
}

function setupComposer() {
  const ta = $('#input');
  ta.addEventListener('input', () => { autoGrow(); updateSend(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); }
  });
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); send(); });
  $('#attachButton').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => pickImage(e.target.files[0]));
  $('#attachRemove').addEventListener('click', () => { clearImage(); updateSend(); });
  ta.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); pickImage(f); }
  });
  window.addEventListener('online', () => { $('#offline').hidden = true; });
  window.addEventListener('offline', () => { $('#offline').hidden = false; });
}

// ── 시트 (메뉴·알림) ──────────────────────────────
function openSheet(title, html) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  $('#backdrop').hidden = false;
  history.pushState({ sheet: true }, '');
}
function closeSheet(fromPop = false) {
  if ($('#sheet').hidden) return;
  $('#sheet').hidden = true;
  $('#backdrop').hidden = true;
  if (!fromPop && history.state?.sheet) history.back();
}

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });

async function openMenu() {
  const me = state.me || {};
  const links = me.links || [];
  const linked = new Set(links.map((l) => l.platform));
  const canAdd = [!linked.has('SELLERBRICKS') && ['SELLERBRICKS', '셀러브릭스'], !linked.has('STUDIO') && me.studioOpen && ['STUDIO', '스튜디오']].filter(Boolean);
  let prefs = { engine: false, kinds: [] };
  try { prefs = await api('/prefs'); } catch { /* 무시 */ }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const appRows = [];
  if (!isApp() && !standalone) {
    if (installEvt) appRows.push(`<button class="row" type="button" data-act="install"><span class="r-ico">${svg('plus')}</span><span class="r-main"><b>홈 화면에 추가</b><span>앱처럼 바로 열 수 있어요</span></span></button>`);
    if (me.app && !ios) appRows.push(`<a class="row" href="${esc(me.app.url)}"><span class="r-ico">${svg('phone')}</span><span class="r-main"><b>안드로이드 앱 받기</b><span>버전 ${esc(me.app.version || '최신')} · 알림을 앱으로 받아요</span></span></a>`);
    if (ios) appRows.push(`<div class="row"><span class="r-ico">${svg('phone')}</span><span class="r-main"><b>아이폰에서 앱처럼 쓰기</b><span>Safari 아래쪽 공유 버튼 → "홈 화면에 추가"</span></span></div>`);
  }
  if (me.kakao) appRows.push(`<a class="row" href="${esc(me.kakao.chat)}" target="_blank" rel="noopener"><span class="r-ico k">${svg('kakao')}</span><span class="r-main"><b>카카오톡 채널로 이용</b><span>카톡 채팅방에서 같은 비서를 써요</span></span></a>`);
  appRows.push(`<button class="row" type="button" data-act="copy"><span class="r-ico">${svg('link')}</span><span class="r-main"><b>웹챗 링크 복사</b><span>${esc(location.origin)}/chat</span></span></button>`);

  openSheet('메뉴', `
    <div class="group"><h3>연결 계정</h3>
      <div class="rows">${links.length ? links.map((l) => `<div class="row"><span class="r-ico">${svg(l.platform === 'STUDIO' ? 'studio' : 'orders')}</span><span class="r-main"><b>${esc(l.accountName)}</b><span>${esc(l.label)}</span></span><button class="btn btn-sm btn-ghost btn-danger" type="button" data-unlink="${l.platform}">해제</button></div>`).join('') : '<div class="row"><span class="r-main"><span>연결된 계정이 없어요</span></span></div>'}</div>
      ${canAdd.length ? `<form class="add-link" id="addLink">
        <b>${canAdd.length === 1 ? `${canAdd[0][1]} 계정 추가` : '계정 추가'}</b>
        ${canAdd.length > 1 ? `<div class="segment" id="addSeg">${canAdd.map(([k, n], i) => `<button type="button" data-platform="${k}" aria-checked="${i === 0}">${n}</button>`).join('')}</div>` : `<input type="hidden" id="addPlatform" value="${canAdd[0][0]}">`}
        <div class="inline"><input id="addCode" inputmode="numeric" maxlength="6" placeholder="000000" aria-label="연결 코드 6자리"><button class="btn btn-primary" type="submit">연결</button></div>
        <span class="note">해당 서비스 셀러 관리자 화면 → "AI 셀러 비서" 메뉴에서 코드를 받아요.</span>
      </form>` : ''}
    </div>
    ${prefs.engine && prefs.kinds.length ? `<div class="group"><h3>알림 받기</h3><div class="rows">${prefs.kinds.map((k) => `<div class="row"><span class="r-main"><b>${esc(k.label)}</b><span>${esc(k.desc)}</span></span><button class="switch" type="button" role="switch" aria-checked="${k.on}" aria-label="${esc(k.label)}" data-pref="${k.key}"></button></div>`).join('')}</div><p class="note">알림은 위쪽 종 모양에서 확인해요.</p></div>` : ''}
    <div class="group"><h3>다른 방법으로 쓰기</h3><div class="rows">${appRows.join('')}</div></div>
    <div class="group"><div class="rows">
      <button class="row" type="button" data-act="help"><span class="r-ico">${svg('help')}</span><span class="r-main"><b>도움말</b><span>이렇게 물어보세요</span></span></button>
      <button class="row" type="button" data-act="logout"><span class="r-ico">${svg('out')}</span><span class="r-main"><b>로그아웃</b><span>이 기기에서 로그아웃해요</span></span></button>
    </div></div>`);

  const body = $('#sheetBody');
  body.querySelector('#addSeg')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-platform]');
    if (b) for (const x of b.parentElement.children) x.setAttribute('aria-checked', String(x === b));
  });
  body.querySelector('#addLink')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const platform = body.querySelector('#addSeg [aria-checked="true"]')?.dataset.platform || body.querySelector('#addPlatform')?.value;
    const code = body.querySelector('#addCode').value.replace(/\D/g, '');
    try {
      const r = await api('/link', { method: 'POST', body: { platform, code } });
      state.me = await api('/me');
      renderAccount();
      toast(`${r.accountName} 계정을 연결했어요`);
      closeSheet();
    } catch (ex) { toast(ex.message); }
  });
  body.addEventListener('click', async (e) => {
    const un = e.target.closest('[data-unlink]');
    if (un) {
      if (!confirmLike(un, '한 번 더 누르면 해제돼요')) return;
      try {
        const r = await api('/unlink', { method: 'POST', body: { platform: un.dataset.unlink } });
        closeSheet();
        if (r.loggedOut) { toast('모든 계정을 해제해서 로그아웃했어요'); state.me = await api('/me'); showLogin(); return; }
        state.me = await api('/me');
        renderAccount();
        toast('연결을 해제했어요');
      } catch (ex) { toast(ex.message); }
      return;
    }
    const sw = e.target.closest('[data-pref]');
    if (sw) {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      try { await api('/prefs', { method: 'POST', body: { key: sw.dataset.pref, on } }); } catch (ex) { sw.setAttribute('aria-checked', String(!on)); toast(ex.message); }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'logout') {
      await api('/logout', { method: 'POST' }).catch(() => {});
      closeSheet();
      state.me = await api('/me').catch(() => ({ loggedIn: false, webEnabled: true }));
      showLogin();
    } else if (act === 'copy') {
      try { await navigator.clipboard.writeText(`${location.origin}/sellerbricks-bot/chat/`); toast('웹챗 링크를 복사했어요'); } catch { toast('복사하지 못했어요'); }
    } else if (act === 'install' && installEvt) {
      installEvt.prompt();
      installEvt = null;
      closeSheet();
    } else if (act === 'help') {
      closeSheet();
      send('도움말');
    }
  });
}

function confirmLike(btn, msg) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1';
  const old = btn.textContent;
  btn.textContent = '정말 해제';
  toast(msg);
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3000);
  return false;
}

async function openBell() {
  let list = [];
  try { list = await api('/notifications'); } catch (e) { toast(e.message); return; }
  const label = { MORNING: '아침 요약', LIVE_REPORT: '방송 리포트', UNPAID: '미입금', UNSHIPPED: '송장 지연', CANCEL: '취소 요청', SYSTEM: '안내' };
  openSheet('알림', list.length
    ? list.map((n) => `<article class="noti"><div class="n-top"><span class="tag">${esc(label[n.kind] || '알림')}</span>${n.read ? '' : '<span class="new" aria-label="새 알림"></span>'}<time>${esc(new Date(n.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</time></div><b>${esc(n.title)}</b><p>${esc(n.body)}</p>${n.linkUrl ? `<a class="btn btn-sm" href="${esc(safeUrl(n.linkUrl))}" target="_blank" rel="noopener">관리자 화면에서 보기 ${svg('ext')}</a>` : ''}</article>`).join('')
    : `<div class="empty">${svg('bell')}<p>아직 알림이 없어요.<br>메뉴에서 받을 알림을 고를 수 있어요.</p></div>`);
  if (list.some((n) => !n.read)) {
    api('/notifications/read', { method: 'POST' }).catch(() => {});
    if (state.me) state.me.unread = 0;
    renderAccount();
  }
}

// ── 시작 ──────────────────────────────────────────
function setup() {
  setupLogin();
  setupComposer();
  $('#menuButton').addEventListener('click', openMenu);
  $('#bellButton').addEventListener('click', openBell);
  $('#sheetClose').addEventListener('click', () => closeSheet());
  $('#backdrop').addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('popstate', () => closeSheet(true));
  if (!navigator.onLine) $('#offline').hidden = false;
  // 안드로이드 앱: 뒤로 가기 버튼 — 시트 닫기 → 이전 페이지 → 앱 종료
  const capApp = window.Capacitor?.Plugins?.App;
  if (capApp) capApp.addListener('backButton', ({ canGoBack }) => {
    if (!$('#sheet').hidden) return closeSheet();
    if (canGoBack) history.back(); else capApp.exitApp();
  });
  // 다른 탭에서 돌아오면 새 알림 확인
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !state.me?.loggedIn) return;
    try { const me = await api('/me'); if (!me.loggedIn) return showLogin(); state.me = me; renderAccount(); } catch { /* 무시 */ }
  });
  boot();
}

$('#demoStart').addEventListener('click', async () => {
  await previewApi('/login');
  state.me = await previewApi('/me');
  await showChat();
});
setup();
