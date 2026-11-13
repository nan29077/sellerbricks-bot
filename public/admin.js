const $ = (selector, root = document) => root.querySelector(selector);
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chat: '<path d="M21 11.5a8 8 0 0 1-8 8H9l-5 2v-5a8 8 0 0 1 7-13h2a8 8 0 0 1 8 8Z"/><path d="M8 10h8m-8 4h5"/>',
  sliders: '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  link: '<path d="m10 13 4-4m-6 7-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 8a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-1 1" transform="translate(1 0) scale(.92 1)"/>',
  list: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m4-12 4 4-4 4m-5-4h9"/>',
  spark: '<path d="M12 3c1.1 5.4 3.6 7.9 9 9-5.4 1.1-7.9 3.6-9 9-1.1-5.4-3.6-7.9-9-9 5.4-1.1 7.9-3.6 9-9Z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m2-15a3 3 0 0 1 0 6m4 9v-2a4 4 0 0 0-3-4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2m-5 1 2 2"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 18v-9m-8-4.5 8 4.5 8-4.5M8 5.25l8 4.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M20 7v4h-4m4 0a8 8 0 1 0-.8 5.6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
  eye: '<path d="M2 12s3.7-6 10-6 10 6 10 6-3.7 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m3 3 18 18M7 7c1.5-.7 3.1-1 5-1 6.3 0 10 6 10 6a15 15 0 0 1-3 3m-3 2c-1.2.6-2.6 1-4 1-6.3 0-10-6-10-6a15 15 0 0 1 3-3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  alert: '<path d="m12 3 10 17H2L12 3Zm0 6v4m0 3h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m21 16-5-5-7 9"/>',
  book: '<path d="M12 5v15M4 4h4a4 4 0 0 1 4 2 4 4 0 0 1 4-2h4v14h-4a4 4 0 0 0-4 2 4 4 0 0 0-4-2H4Z"/>',
  file: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7m-12 4h8m-8 3h6"/>',
  like: '<path d="M7 10v10H3V10Zm0 8 3 2h7a2 2 0 0 0 2-1.6l1.4-6.5A1.6 1.6 0 0 0 19 10h-5l.4-4a2 2 0 0 0-2-2L7 10"/>',
  dislike: '<path d="M7 14V4H3v10Zm0-8 3-2h7a2 2 0 0 1 2 1.6l1.4 6.5A1.6 1.6 0 0 1 19 14h-5l.4 4a2 2 0 0 1-2 2L7 14"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = new Intl.NumberFormat('ko-KR');
const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' });
const time = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
const samples = ['오늘 주문 정리해줘', '어제 방송 주문 몇 건이야?', '입금 안 된 주문 알려줘', '송장 안 넣은 주문', '취소 요청 어떻게 됐어?', '이번 달 정산 얼마야?', '이번 주 많이 팔린 상품', '품절 임박 상품', '이번 달 매출 리포트 만들어줘', '정산 언제 들어와요?', '연결 상태', '도움말'];
const providerNames = { SYSTEM: '챗봇 안내', MOCK: '기본 응답', CLAUDE: 'Claude', GPT: 'GPT' };
const platformModes = { MOCK: ['b-warn', '샘플 데이터', 'info'], LIVE: ['b-ok', '실제 API', 'check'], OFF: ['b-off', '꺼짐', 'info'] };
let signedIn = false;
let sessionVersion = 0;
let pending = false;
let issuing = false;
let faqRows = [];
let lastDate = '';
let noticeTimer;

document.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });

async function api(path, { method = 'GET', body } = {}) {
  const version = sessionVersion;
  const response = await fetch('/admin/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 && path !== '/login' && version === sessionVersion) showLogin();
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status >= 500 ? '서버 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.' : result.error || '요청을 완료하지 못했습니다.');
  return result;
}

function notice(message) {
  const element = $('#appNotice');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { element.hidden = true; }, 4500);
}

function showLogin() {
  if (signedIn) {
    sessionVersion++;
    resetConversation();
    for (const id of ['skillPath', 'sbKey', 'anthropicKey', 'openaiKey']) $('#' + id).value = '';
    for (const id of ['users', 'logs', 'faqList', 'artifacts', 'codeOut']) $('#' + id).replaceChildren();
    for (const id of ['usersPanel', 'logsPanel', 'faqPanel', 'artifactsPanel']) $('#' + id).open = false;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    faqRows = [];
    $('#testUser').value = 'admin-test-user';
    $('#appNotice').hidden = true;
  }
  signedIn = false;
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  setPasswordVisible(false);
  $('#pw').focus();
}

function setPasswordVisible(visible) {
  $('#pw').type = visible ? 'text' : 'password';
  const toggle = $('#showPassword');
  toggle.setAttribute('aria-label', visible ? '비밀번호 숨기기' : '비밀번호 표시');
  toggle.innerHTML = icon(visible ? 'eyeOff' : 'eye');
}

function badge(element, [style, label, symbol]) {
  element.className = 'badge ' + style;
  element.innerHTML = icon(symbol);
  element.append(label);
}

function feedback(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle('error', error);
}

function renderKey(name, info) {
  const states = {
    NONE: ['b-off', '미입력', 'info'],
    UNTESTED: ['b-warn', '확인 전', 'info'],
    OK: ['b-ok', '연결 확인됨', 'check'],
    FAIL: ['b-bad', '연결 실패', 'alert'],
  };
  const box = $('#key-' + name);
  badge($('[data-k=badge]', box), states[info.status]);
  $('[data-k=cur]', box).textContent = info.masked ? `현재 키 ${info.masked}${info.source === 'ENV' ? ' · 환경 변수' : ''}` : '등록된 키가 없습니다.';
  const tested = info.testedAt ? ' · ' + new Date(info.testedAt).toLocaleString('ko-KR') : '';
  feedback($('[data-k=msg]', box), info.message ? info.message + tested : '', info.status === 'FAIL');
}

function renderUsage(usage) {
  for (const id of ['totalCount', 'aiCount', 'userCount', 'linkCount']) $('#' + id).textContent = number.format(usage[id]);
  $('#usageDetail').textContent = `이번 달 피드백 · 도움 됨 ${number.format(usage.feedbackUp)}건 · 아쉬워요 ${number.format(usage.feedbackDown)}건 · 숫자 검증 경고 ${number.format(usage.numberWarnings)}건`;
}

function selectRadio(name, value) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => { input.checked = input.value === value; });
}

function render(state) {
  const { llm, platforms: { sellerbricks: sb } } = state;
  $('#warns').innerHTML = state.warnings.map((warning) => `<div class="warn">${icon('alert')}${escapeHtml(warning)}</div>`).join('');
  const aiMode = llm.effective === 'MOCK' ? ['b-warn', '기본 응답 모드', 'info'] : ['b-ok', providerNames[llm.effective] + ' 사용 중', 'check'];
  badge($('#hdrMode'), aiMode);
  badge($('#testAiMode'), aiMode);
  $('#hdrMode').title = llm.reason;
  $('#testAiMode').title = llm.reason;
  badge($('#sbBadge'), platformModes[sb.mode]);
  badge($('#testDataMode'), platformModes[sb.mode]);
  renderUsage(state.usage);
  for (const name of ['anthropic', 'openai']) renderKey(name, state.keys[name]);
  selectRadio('prov', llm.selected);
  selectRadio('sbm', sb.mode);
  $('#claudeModel').value = llm.claudeModel;
  $('#gptModel').value = llm.gptModel;
  $('#monthlyLimit').value = llm.monthlyLimit;
  for (const [selector, values] of [['#claudePresets', llm.presets.CLAUDE], ['#gptPresets', llm.presets.GPT]]) {
    $(selector).replaceChildren(...values.map((value) => new Option(value, value)));
  }
  $('#sbUrl').value = sb.baseUrl || '';
  $('#sbKeyCur').textContent = sb.signingKey ? `(현재 ${sb.signingKey})` : '';
  $('#skillPath').value = state.kakao.exampleUrl;
  $('#mockConnection').hidden = sb.mode !== 'MOCK';
  $('#liveConnection').hidden = sb.mode === 'MOCK';
  $('#liveConnection').textContent = sb.mode === 'LIVE'
    ? '셀러 관리자 화면에서 발급받은 코드를 채팅에 ‘연결 123456’ 형식으로 보내세요.'
    : '주문과 상품을 조회하려면 플랫폼 연결을 켜세요.';
  const seller = $('#mockSeller');
  const selection = seller.value;
  const sbGroup = document.createElement('optgroup');
  sbGroup.label = '셀러브릭스';
  sbGroup.append(...state.mockSellers.map((item) => new Option(item.name, item.id)));
  const groups = [sbGroup];
  if (state.platforms?.studio?.mode === 'MOCK' && state.mockStudioSellers?.length) {
    const stGroup = document.createElement('optgroup');
    stGroup.label = '스튜디오';
    stGroup.append(...state.mockStudioSellers.map((item) => { const o = new Option(item.name + ' (스튜디오)', item.id); o.dataset.platform = 'STUDIO'; return o; }));
    groups.push(stGroup);
  }
  seller.replaceChildren(...groups);
  if (state.mockSellers.some((item) => item.id === selection)) seller.value = selection;
  $('#tools').innerHTML = table(['도구', '설명', '권한'], state.tools.map((tool) => [
    `<b>${escapeHtml(tool.title)}</b><div class="mono">${escapeHtml(tool.name)}</div>`, escapeHtml(tool.description), tool.annotations?.readOnlyHint ? '조회' : '변경 가능',
  ]));
}

async function boot() {
  try {
    render(await api('/state'));
    if (!signedIn) sessionVersion++;
    signedIn = true;
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    if (!$('#chat').hasChildNodes()) resetConversation();
    updateNavigation();
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch (error) {
    showLogin();
    if (error.message !== '로그인이 필요합니다.') feedback($('#loginErr'), error.message, true);
  }
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#loginButton');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = '로그인 중…';
  feedback($('#loginErr'), '');
  try {
    await api('/login', { method: 'POST', body: { password: $('#pw').value } });
    $('#pw').value = '';
    setPasswordVisible(false);
    await boot();
    if (signedIn) {
      $('#overviewTitle').setAttribute('tabindex', '-1');
      $('#overviewTitle').focus({ preventScroll: true });
    }
  } catch (error) {
    feedback($('#loginErr'), error.message, true);
    $('#pw').focus();
  } finally {
    button.disabled = false;
    button.textContent = '로그인';
  }
});

$('#showPassword').addEventListener('click', () => setPasswordVisible($('#pw').type === 'password'));
document.querySelectorAll('[data-action=logout]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await api('/logout', { method: 'POST', body: {} });
      history.replaceState(null, '', location.pathname + location.search);
      showLogin();
    } catch (error) {
      notice(error.message);
    }
  });
});

function updateNavigation() {
  const hash = location.hash || '#overview';
  document.querySelectorAll('.sidebar nav a').forEach((link) => {
    if (link.hash === hash) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', updateNavigation);

async function updateKey(box, action) {
  const name = box.id.slice(4);
  const input = $('[data-k=input]', box);
  const status = $('[data-k=msg]', box);
  const buttons = [...box.querySelectorAll('button')];
  if (buttons.some((button) => button.disabled)) return;
  if (action === 'delete' && !confirm('저장된 키를 삭제할까요? 환경 변수의 키는 서버 설정에서 삭제할 수 있습니다.')) return;
  buttons.forEach((button) => { button.disabled = true; });
  feedback(status, action === 'delete' ? '삭제 중…' : '연결 확인 중…');
  try {
    const path = '/keys/' + name;
    const result = action === 'delete'
      ? await api(path, { method: 'DELETE' })
      : await api(path + (action === 'test' ? '/test' : ''), { method: 'POST', body: action === 'test' ? {} : { key: input.value } });
    if (action !== 'test') input.value = '';
    render(await api('/state'));
    if (action === 'delete') feedback(status, '저장된 키를 삭제했습니다.');
    else feedback(status, result.test.message, result.test.status !== 'OK');
  } catch (error) {
    feedback(status, error.message, true);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

document.querySelectorAll('.key-form').forEach((form) => form.addEventListener('submit', (event) => {
  event.preventDefault();
  updateKey(form.closest('.provider'), 'save');
}));
document.querySelectorAll('[data-key-action]').forEach((button) => button.addEventListener('click', () => updateKey(button.closest('.provider'), button.dataset.keyAction)));

function saveSettings(formId, messageId, path, fields, onSaved) {
  $('#' + formId).addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type=submit]', event.currentTarget);
    if (button.disabled) return;
    const status = $('#' + messageId);
    button.disabled = true;
    feedback(status, '저장 중…');
    try {
      await api(path, { method: 'POST', body: fields() });
      onSaved?.();
      render(await api('/state'));
      feedback(status, '저장했습니다.');
    } catch (error) {
      feedback(status, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

saveSettings('llmForm', 'llmMsg', '/llm', () => ({
  provider: $('input[name=prov]:checked').value,
  claudeModel: $('#claudeModel').value,
  gptModel: $('#gptModel').value,
  monthlyLimit: Number($('#monthlyLimit').value),
}));
saveSettings('platformForm', 'sbMsg', '/platform/sellerbricks', () => ({
  mode: $('input[name=sbm]:checked').value,
  baseUrl: $('#sbUrl').value,
  signingKey: $('#sbKey').value,
}), () => { $('#sbKey').value = ''; $('#codeOut').replaceChildren(); });

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  try {
    if (!document.execCommand('copy')) throw new Error('복사하지 못했습니다.');
  } finally {
    field.remove();
  }
}

$('#copySkill').addEventListener('click', async () => {
  const field = $('#skillPath');
  try {
    await copyText(field.value);
    feedback($('#skillMsg'), '스킬 주소를 복사했습니다.');
  } catch {
    field.select();
    feedback($('#skillMsg'), '선택된 주소를 복사해 주세요.', true);
  }
});

$('#shareLink').addEventListener('click', async () => {
  const url = $('meta[property="og:url"]').content;
  try {
    if (navigator.share) await navigator.share({ title: '셀러브릭스 봇', url });
    else {
      await copyText(url);
      feedback($('#shareMsg'), '공유 링크를 복사했습니다. 카카오톡 대화방에 붙여넣으세요.');
    }
  } catch (error) {
    if (error.name !== 'AbortError') feedback($('#shareMsg'), '주소창의 링크를 복사해 공유해 주세요.', true);
  }
});

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((name) => `<th scope="col">${name}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((content) => `<td>${content}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

async function loadUsers() {
  const version = sessionVersion;
  const rows = await api('/users');
  if (version !== sessionVersion) return;
  $('#users').innerHTML = rows.length ? table(['사용자 키', '연결', '마지막 대화', '관리'], rows.map((user) => [
    `<span class="mono">${escapeHtml(user.botUserKey)}</span>`,
    user.links.map((link) => `${link.platform === 'SELLERBRICKS' ? '셀러브릭스' : '스튜디오'} · ${escapeHtml(link.accountName)}`).join('<br>') || '없음',
    escapeHtml(new Date(user.lastSeenAt).toLocaleString('ko-KR')),
    user.links.length ? `<button type="button" class="danger" data-unlink="${escapeHtml(user.id)}">연결 해제</button>` : '',
  ])) : '<p class="muted">아직 사용자가 없습니다.</p>';
}

async function loadLogs() {
  const version = sessionVersion;
  const rows = await api('/logs?limit=50');
  if (version !== sessionVersion) return;
  $('#logs').innerHTML = rows.length ? table(['시간', '채널', '질문', '답변', '응답 방식', '도구', '응답 시간'], rows.map((row) => [
    escapeHtml(new Date(row.createdAt).toLocaleString('ko-KR')),
    row.channel === 'KAKAO' ? '카카오' : '테스트',
    escapeHtml(row.userText),
    `<div class="log-reply">${escapeHtml(row.replyText.length > 160 ? row.replyText.slice(0, 160) + '…' : row.replyText)}${row.error ? `<div class="danger">${escapeHtml(row.error)}</div>` : ''}${row.checkWarn ? `<div class="danger">${escapeHtml(row.checkWarn)}</div>` : ''}${row.feedback ? `<div class="muted">${row.feedback > 0 ? '도움 됨' : '아쉬워요'}</div>` : ''}</div>`,
    escapeHtml(providerNames[row.provider] || row.provider) + (row.model ? `<div class="muted">${escapeHtml(row.model)}</div>` : '') + (row.tokensIn ? `<div class="muted">${escapeHtml(row.tokensIn)}/${escapeHtml(row.tokensOut)} tok</div>` : ''),
    row.tools.map((tool) => escapeHtml(tool.tool) + (tool.ok ? '' : ' (실패)')).join('<br>'),
    escapeHtml(row.latencyMs) + ' ms',
  ])) : '<p class="muted">아직 대화가 없습니다.</p>';
}

async function loadFaq() {
  const version = sessionVersion;
  const rows = await api('/faq');
  if (version !== sessionVersion) return;
  faqRows = rows;
  $('#faqList').innerHTML = rows.length ? table(['분류', '질문', '상태', '관리'], rows.map((row) => [
    escapeHtml(row.category),
    `<b>${escapeHtml(row.question)}</b><div class="log-reply">${escapeHtml(row.answer.length > 140 ? row.answer.slice(0, 140) + '…' : row.answer)}</div>`,
    row.isActive ? '사용 중' : '숨김',
    `<div class="actions"><button type="button" data-faq-edit="${escapeHtml(row.id)}">수정</button>${row.isActive ? `<button type="button" class="danger" data-faq-hide="${escapeHtml(row.id)}">숨기기</button>` : ''}</div>`,
  ])) : '<p class="muted">등록된 FAQ가 없습니다.</p>';
}

async function loadArtifacts() {
  const version = sessionVersion;
  const rows = await api('/artifacts');
  if (version !== sessionVersion) return;
  $('#artifacts').innerHTML = rows.length ? table(['만든 시각', '종류', '제목', '사용자', '열람', '만료 시각'], rows.map((row) => {
    const url = new Date(row.expiresAt) > new Date() && safeWebUrl(row.url);
    return [
      escapeHtml(new Date(row.createdAt).toLocaleString('ko-KR')), escapeHtml(row.kind),
      url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.title)}</a>` : escapeHtml(row.title),
      escapeHtml(row.botUserKey), number.format(row.views), escapeHtml(new Date(row.expiresAt).toLocaleString('ko-KR')),
    ];
  })) : '<p class="muted">아직 결과물이 없습니다.</p>';
}

for (const [panelId, buttonId, load] of [
  ['usersPanel', 'refreshUsers', loadUsers], ['logsPanel', 'refreshLogs', loadLogs],
  ['faqPanel', null, loadFaq], ['artifactsPanel', 'refreshArtifacts', loadArtifacts],
]) {
  const panel = $('#' + panelId);
  panel.addEventListener('toggle', () => { if (panel.open && signedIn) load().catch((error) => notice(error.message)); });
  if (buttonId) $('#' + buttonId).addEventListener('click', () => load().catch((error) => notice(error.message)));
}

function editFaq(row = {}) {
  for (const field of ['id', 'category', 'question', 'answer', 'keywords']) {
    $('#faq' + field[0].toUpperCase() + field.slice(1)).value = row[field] || '';
  }
  $('#faqEditorTitle').textContent = row.id ? 'FAQ 편집' : '새 FAQ';
  feedback($('#faqEditorMsg'), '');
  $('#faqEditor').showModal();
}

$('#newFaq').addEventListener('click', () => editFaq());
$('#closeFaq').addEventListener('click', () => $('#faqEditor').close());
$('#faqList').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-faq-edit]');
  if (edit) {
    const row = faqRows.find((item) => item.id === edit.dataset.faqEdit);
    if (row) editFaq(row);
    return;
  }
  const hide = event.target.closest('[data-faq-hide]');
  if (!hide || !confirm('이 FAQ를 숨길까요?')) return;
  try {
    await api('/faq/' + encodeURIComponent(hide.dataset.faqHide), { method: 'DELETE' });
    await loadFaq();
  } catch (error) {
    feedback($('#faqMsg'), error.message, true);
  }
});
$('#faqForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('button[type=submit]', event.currentTarget);
  if (button.disabled) return;
  button.disabled = true;
  try {
    await api('/faq', { method: 'POST', body: {
      id: $('#faqId').value || undefined, category: $('#faqCategory').value, question: $('#faqQuestion').value,
      answer: $('#faqAnswer').value, keywords: $('#faqKeywords').value, isActive: true,
    } });
    $('#faqEditor').close();
    await loadFaq();
  } catch (error) {
    feedback($('#faqEditor').open ? $('#faqEditorMsg') : $('#faqMsg'), error.message, true);
  } finally {
    button.disabled = false;
  }
});
$('#faqSearch').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const rows = await api('/faq/search', { method: 'POST', body: { query: $('#faqQuery').value } });
    feedback($('#faqMsg'), rows.length ? rows.map((row) => row.question).join(' · ') : '검색 결과가 없습니다.');
  } catch (error) {
    feedback($('#faqMsg'), error.message, true);
  }
});
$('#users').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-unlink]');
  if (!button || !confirm('이 사용자의 연결을 모두 해제할까요?')) return;
  try {
    const result = await api('/users/' + encodeURIComponent(button.dataset.unlink) + '/unlink', { method: 'POST', body: {} });
    await Promise.all([loadUsers(), refreshUsage()]);
    notice(result.message);
  } catch (error) {
    notice(error.message);
  }
});

async function refreshUsage() {
  const version = sessionVersion;
  const { usage } = await api('/state');
  if (version === sessionVersion) renderUsage(usage);
}

function messageRow(from, at = new Date()) {
  const day = date.format(at);
  const chat = $('#chat');
  if (lastDate !== day) {
    const divider = document.createElement('div');
    divider.className = 'date-divider';
    divider.textContent = day;
    chat.append(divider);
    lastDate = day;
  }
  const row = document.createElement('div');
  row.className = 'message ' + from;
  row.innerHTML = from === 'bot'
    ? '<img class="message-profile" src="/assets/logo.svg" alt=""><div class="message-content"><strong class="sender">셀러브릭스 챗봇</strong></div>'
    : '<div class="message-content"></div>';
  chat.append(row);
  return row;
}

function addLine(row, body, at) {
  const line = document.createElement('div');
  line.className = 'message-line';
  if (at && row.classList.contains('me')) line.append(makeTime(at));
  line.append(body);
  if (at && !row.classList.contains('me')) line.append(makeTime(at));
  $('.message-content', row).append(line);
}

function makeTime(at) {
  const element = document.createElement('time');
  element.dateTime = at.toISOString();
  element.textContent = time.format(at);
  return element;
}

function textBubble(text, canExpand = false) {
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const chars = Array.from(text);
  if (canExpand && chars.length > 500) {
    bubble.textContent = chars.slice(0, 500).join('') + '…';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'read-more';
    button.textContent = '전체 보기';
    button.addEventListener('click', () => {
      $('#fullMessageText').textContent = text;
      $('#fullMessage').showModal();
    });
    bubble.append(button);
  } else {
    bubble.textContent = text;
  }
  return bubble;
}

function safeWebUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function talkAction(action) {
  if (action.action === 'message') {
    const button = questionButton(action.label, action.messageText);
    if (action.messageText === '도움 됨' || action.messageText === '아쉬워요') {
      button.insertAdjacentHTML('afterbegin', icon(action.messageText === '도움 됨' ? 'like' : 'dislike'));
    }
    return button;
  }
  const url = action.action === 'webLink' && safeWebUrl(action.webLinkUrl);
  if (!url) return null;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = action.label;
  return link;
}

function renderCard(card, isList) {
  const element = document.createElement('div');
  element.className = 'talk-card';
  if (isList) {
    element.innerHTML = `<h4>${escapeHtml(card.header.title)}</h4>${card.items.map((item) => `<div class="talk-card-item"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.description)}</span></div>`).join('')}`;
  } else {
    const imageUrl = safeWebUrl(card.thumbnail?.imageUrl);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '카드 이미지';
      image.addEventListener('load', scrollChat, { once: true });
      element.append(image);
    }
    element.insertAdjacentHTML('beforeend', `<h4>${escapeHtml(card.title)}</h4><div class="talk-card-description">${escapeHtml(card.description)}</div>`);
  }
  const buttons = (card.buttons || []).map(talkAction).filter(Boolean);
  if (buttons.length) {
    const actions = document.createElement('div');
    actions.className = 'talk-card-actions';
    actions.append(...buttons);
    element.append(actions);
  }
  return element;
}

function questionButton(label, text = label, file) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => sendText(text, file));
  return button;
}

function scrollChat() {
  const chat = $('#chat');
  chat.scrollTop = chat.scrollHeight;
}

function updateComposer() {
  $('#sendButton').disabled = pending || (!$('#chatInput').value.trim() && !$('#chatImage').files.length);
  $('#testUser').disabled = pending;
  $('#attachButton').disabled = pending;
  $('#issueCode').disabled = pending || issuing;
  document.querySelectorAll('#samples button, #quickReplies button, #codeOut button, .talk-card-actions button').forEach((button) => { button.disabled = pending; });
}

function showQuickReplies(replies = []) {
  const container = $('#quickReplies');
  const buttons = replies.map(talkAction).filter(Boolean);
  container.replaceChildren(...buttons);
  container.hidden = !buttons.length;
  container.scrollLeft = 0;
}

function resetConversation() {
  $('#chat').replaceChildren();
  $('#chatInput').value = '';
  resetAttachment();
  $('#lastMeta').textContent = '메시지를 보내면 응답 정보가 표시됩니다.';
  $('#lastJson').textContent = '';
  $('#lastJson').hidden = true;
  lastDate = '';
  showQuickReplies();
  const at = new Date();
  addLine(messageRow('bot', at), textBubble('안녕하세요! 셀러브릭스 챗봇입니다.\n도움말을 보내거나 셀러 계정을 연결해 주문, 상품, 정산을 확인해 보세요.'), at);
  updateComposer();
}

function resetAttachment() {
  $('#chatImage').value = '';
  $('#attachment').hidden = true;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('첨부 사진을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function sendText(value, file) {
  const text = value.trim();
  if ((!text && !file) || pending || !signedIn) return;
  const version = sessionVersion;
  const at = new Date();
  pending = true;
  if ($('#chatInput').value.trim() === text) $('#chatInput').value = '';
  if (file) resetAttachment();
  showQuickReplies();
  updateComposer();
  const outgoing = messageRow('me', at);
  if (text) addLine(outgoing, textBubble(text), file ? undefined : at);
  const waiting = messageRow('bot', at);
  const typing = document.createElement('div');
  typing.className = 'bubble typing';
  typing.setAttribute('aria-label', '답변 작성 중');
  typing.innerHTML = '<i></i><i></i><i></i>';
  addLine(waiting, typing);
  scrollChat();
  try {
    let image;
    if (file) {
      const preview = await readImage(file);
      if (version !== sessionVersion) return;
      image = { base64: preview.split(',')[1], contentType: file.type };
      const thumbnail = document.createElement('img');
      thumbnail.className = 'sent-image';
      thumbnail.src = preview;
      thumbnail.alt = '첨부한 사진';
      thumbnail.addEventListener('load', scrollChat, { once: true });
      addLine(outgoing, thumbnail, at);
    }
    const { reply, kakao } = await api('/chat', { method: 'POST', body: { botUserKey: $('#testUser').value.trim(), text, image, view: $('#testView')?.value || 'KAKAO' } });
    if (waiting.isConnected) {
      $('.message-line', waiting).remove();
      const { outputs, quickReplies } = kakao.template;
      const rendered = outputs.flatMap((output) => {
        if (output.simpleText) return [textBubble(output.simpleText.text, true)];
        if (output.listCard) return [renderCard(output.listCard, true)];
        if (output.basicCard || output.textCard) return [renderCard(output.basicCard || output.textCard, false)];
        return [];
      });
      const repliedAt = new Date();
      rendered.forEach((body, index) => addLine(waiting, body, index === rendered.length - 1 ? repliedAt : undefined));
      showQuickReplies(quickReplies);
      const tools = reply.toolLogs.map((log) => log.tool + (log.ok ? '' : ' (실패)'));
      $('#lastMeta').textContent = [providerNames[reply.provider], reply.model, reply.latencyMs + ' ms', tools.join(', '), reply.checkWarn, reply.error && (reply.provider === 'MOCK' ? 'AI 호출 실패로 기본 응답 사용' : '처리 오류')].filter(Boolean).join(' · ');
      $('#lastJson').textContent = JSON.stringify(kakao, null, 2);
      $('#lastJson').hidden = false;
    }
    if (version === sessionVersion) {
      refreshUsage().catch(() => {});
      if ($('#usersPanel').open) loadUsers().catch(() => {});
      if ($('#logsPanel').open) loadLogs().catch(() => {});
      if ($('#artifactsPanel').open) loadArtifacts().catch(() => {});
    }
  } catch (error) {
    if (waiting.isConnected) {
      $('.message-line', waiting).remove();
      addLine(waiting, textBubble(error.message), new Date());
      if (file) {
        const retry = questionButton('다시 보내기', text, file);
        $('#quickReplies').replaceChildren(retry);
        $('#quickReplies').hidden = false;
      } else showQuickReplies([{ action: 'message', label: '다시 보내기', messageText: text }]);
    }
  } finally {
    pending = false;
    updateComposer();
    if (waiting.isConnected) scrollChat();
  }
}

$('#samples').append(...samples.map((text) => questionButton(text)));
$('#chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  sendText($('#chatInput').value, $('#chatImage').files[0]);
});
$('#attachButton').addEventListener('click', () => $('#chatImage').click());
$('#removeAttachment').addEventListener('click', () => { resetAttachment(); updateComposer(); $('#attachButton').focus(); });
$('#chatImage').addEventListener('change', (event) => {
  const file = event.currentTarget.files[0];
  if (file && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 8 * 1024 * 1024)) {
    resetAttachment();
    notice('8MB 이하의 JPG, PNG, WebP, GIF 사진을 첨부해 주세요.');
  } else {
    $('#attachmentName').textContent = file?.name || '';
    $('#attachment').hidden = !file;
  }
  updateComposer();
});
$('#chatInput').addEventListener('input', updateComposer);
$('#chatInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
});
$('#clearChat').addEventListener('click', () => {
  resetConversation();
  $('#chatInput').focus();
});
$('#testUser').addEventListener('change', () => {
  $('#codeOut').replaceChildren();
  const draft = $('#chatInput').value;
  resetConversation();
  $('#chatInput').value = draft;
  updateComposer();
});
$('#issueCode').addEventListener('click', async () => {
  const output = $('#codeOut');
  const version = sessionVersion;
  const userKey = $('#testUser').value;
  output.textContent = '연결 코드 발급 중…';
  issuing = true;
  updateComposer();
  try {
    const result = await api('/mock/link-code', { method: 'POST', body: { accountId: $('#mockSeller').value, platform: $('#mockSeller').selectedOptions[0]?.dataset.platform || 'SELLERBRICKS' } });
    if (version !== sessionVersion || userKey !== $('#testUser').value) return;
    output.innerHTML = `<div class="code"><strong>${escapeHtml(result.code)}</strong><div class="muted">${escapeHtml(result.accountName)} · ${time.format(new Date(result.expiresAt))}까지</div></div>`;
    $('.code', output).append(questionButton('연결 코드 보내기', '연결 ' + result.code));
  } catch (error) {
    if (version === sessionVersion) output.textContent = error.message;
  } finally {
    issuing = false;
    updateComposer();
  }
});

boot();
