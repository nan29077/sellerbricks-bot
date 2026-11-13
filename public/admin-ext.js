// 관리자 화면 추가 기능 — 채널·앱 · 스토리지 마켓 연결 · 운영·알림 · 외부 AI(MCP)
// admin.js 의 api(), table(), escapeHtml(), feedback(), $ 를 그대로 쓴다. (admin.js 다음에 로드)
(() => {
  'use strict';
  const esc = (s) => escapeHtml(String(s ?? ''));
  const dt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmt = (v) => (v ? dt.format(new Date(v)) : '—');
  const num = (n) => Number(n || 0).toLocaleString('ko-KR');
  const KIND = { MORNING: '아침 요약', LIVE_REPORT: '방송 리포트', UNPAID: '미입금', UNSHIPPED: '송장 지연', CANCEL: '취소 요청' };
  const STATUS = { SENT: ['b-ok', '알림함'], MOCK_SENT: ['b-warn', '가짜 발송'], FAILED: ['b-bad', '실패'] };
  const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;
  let loaded = false;

  async function copy(text, msgEl) {
    try { await navigator.clipboard.writeText(text); feedback(msgEl, '복사했습니다.'); } catch { feedback(msgEl, '복사하지 못했습니다. 직접 선택해 복사하세요.', true); }
  }

  // ── 스토리지 마켓(옛 스튜디오) 연결 ───────────────────────────────
  async function loadStudio() {
    const s = await api('/state');
    const st = s.platforms.studio;
    for (const r of document.querySelectorAll('input[name="stm"]')) r.checked = r.value === st.mode;
    $('#stUrl').value = st.baseUrl || '';
    $('#stKeyCur').textContent = st.signingKey ? `(저장됨 ${st.signingKey})` : '';
    const m = { MOCK: ['b-warn', '샘플 데이터'], LIVE: ['b-ok', '실제 API'], OFF: ['b-off', '꺼짐'] }[st.mode] || ['b-off', st.mode];
    $('#stBadge').className = `badge ${m[0]}`;
    $('#stBadge').textContent = m[1];
  }
  $('#studioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = document.querySelector('input[name="stm"]:checked')?.value;
    try {
      await api('/platform/studio', { method: 'POST', body: { mode, baseUrl: $('#stUrl').value, signingKey: $('#stKey').value } });
      $('#stKey').value = '';
      feedback($('#stMsg'), '저장했습니다.');
      await loadStudio();
      if (typeof render === 'function') render(await api('/state'));
    } catch (err) { feedback($('#stMsg'), err.message, true); }
  });

  // ── 채널 · 앱 ───────────────────────────────────
  async function loadChannels() {
    const c = await api('/channels');
    $('#startUrl').value = c.startUrl;
    $('#openStart').href = c.startUrl;
    $('#chKakao').checked = c.kakao.enabled;
    $('#chWeb').checked = c.web.enabled;
    $('#chApp').checked = c.app.enabled;
    $('#kakaoUrl').value = c.kakao.channelUrl || '';
    $('#startNotice').value = c.notice || '';
    $('#webUrlNote').textContent = `${c.webUrl} · 로그인 세션 ${num(c.sessions)}개`;
    $('#apkExternal').value = c.app.externalUrl || '';
    const st = [];
    if (c.apkExists) st.push(`현재 버전 <b>${esc(c.app.version || '-')}</b> · ${(c.app.fileSize / 1048576).toFixed(1)}MB · ${fmt(c.app.updatedAt)} 올림`);
    else st.push('올린 APK가 없습니다. 5_build_apk.bat 로 만든 파일을 올리세요.');
    if (c.app.externalUrl) st.push(`외부 주소로 배포 중: <span class="mono">${esc(c.app.externalUrl)}</span>`);
    st.push(`내려받기 주소: <span class="mono">${esc(c.apkUrl)}</span>`);
    if (c.app.enabled && !c.start.app) st.push('<span class="danger">앱이 켜져 있지만 파일이 없어 시작 페이지에 버튼이 보이지 않습니다.</span>');
    if (c.kakao.enabled && !c.kakaoLinks) st.push('<span class="danger">카카오 채널 주소를 넣어야 시작 페이지에 카카오 버튼이 보입니다.</span>');
    $('#apkState').innerHTML = st.join('<br>');
  }
  $('#copyStart').addEventListener('click', () => copy($('#startUrl').value, $('#channelMsg')));
  $('#channelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/channels', { method: 'POST', body: { kakaoEnabled: $('#chKakao').checked, webEnabled: $('#chWeb').checked, appEnabled: $('#chApp').checked, kakaoUrl: $('#kakaoUrl').value, notice: $('#startNotice').value } });
      feedback($('#channelMsg'), '저장했습니다.');
      loadChannels();
    } catch (err) { feedback($('#channelMsg'), err.message, true); }
  });
  $('#saveExternal').addEventListener('click', async () => {
    try { await api('/channels', { method: 'POST', body: { appExternalUrl: $('#apkExternal').value } }); feedback($('#apkMsg'), '저장했습니다.'); loadChannels(); } catch (err) { feedback($('#apkMsg'), err.message, true); }
  });
  $('#apkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = $('#apkFile').files[0];
    if (!f) return feedback($('#apkMsg'), 'APK 파일을 고르세요.', true);
    const btn = e.submitter;
    btn.disabled = true;
    feedback($('#apkMsg'), `올리는 중… (${(f.size / 1048576).toFixed(1)}MB)`);
    try {
      const q = new URLSearchParams({ version: $('#apkVersion').value.trim(), note: $('#apkNote').value.trim() });
      const res = await fetch(`/admin/api/channels/apk?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/vnd.android.package-archive' }, body: f, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '올리지 못했습니다.');
      feedback($('#apkMsg'), `올렸습니다. 버전 ${data.version}`);
      $('#apkFile').value = '';
      if (!$('#chApp').checked) feedback($('#apkMsg'), `올렸습니다. 버전 ${data.version} — 위에서 "안드로이드 앱"을 켜야 시작 페이지에 보여요.`);
      loadChannels();
    } catch (err) { feedback($('#apkMsg'), err.message, true); } finally { btn.disabled = false; }
  });

  async function loadSessions() {
    const rows = await api('/sessions');
    $('#sessions').innerHTML = rows.length ? table(['계정', '기기', '마지막 사용', '만료', ''], rows.map((r) => [esc(r.accounts), `${esc(r.device)} ${r.client === 'APP' ? badge('b-ok', '앱') : ''}`, fmt(r.lastSeenAt), fmt(r.expiresAt), `<button type="button" class="danger" data-revoke="${esc(r.id)}">로그아웃</button>`])) : '<p class="muted">로그인한 웹챗·앱 세션이 없습니다.</p>';
  }
  $('#refreshSessions').addEventListener('click', loadSessions);
  $('#sessionsPanel').addEventListener('toggle', (e) => { if (e.target.open) loadSessions(); });
  $('#sessions').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-revoke]');
    if (!b) return;
    await api(`/sessions/${b.dataset.revoke}/revoke`, { method: 'POST' });
    loadSessions();
  });

  // ── 운영 ───────────────────────────────────────
  async function loadOps() {
    const o = await api('/ops');
    $('#channelStats').innerHTML = o.channels.filter((c) => c.channel !== 'TEST' || c.month).map((c) => `<div class="stat"><div>${esc(c.label)} · 이번 달<strong>${num(c.month)}</strong><small class="muted">오늘 ${num(c.today)} · 평균 ${(c.avgMs / 1000).toFixed(1)}초</small></div></div>`).join('');
    $('#opsDetail').textContent = `오늘 사용한 셀러 ${num(o.activeToday)}명 · 이번 달 오류 ${num(o.errors)}건 · 차단 ${num(o.blocked)}명 · AI 토큰 입력 ${num(o.tokensIn)} / 출력 ${num(o.tokensOut)}`;
    const c = o.cost;
    $('#dailyPerUser').value = c.dailyPerUser;
    $('#autoModel').checked = c.autoModel;
    $('#claudeLight').value = c.claudeLight;
    $('#gptLight').value = c.gptLight;
    $('#maxConcurrent').value = c.maxConcurrent;
    const cl = o.cleanup;
    $('#cleanupState').innerHTML = `대화 로그·알림 ${o.retentionDays}일, 만료 결과물 7일, 사진 30일이 지나면 하루 한 번 자동 삭제합니다.<br>${cl ? `마지막 정리 ${fmt(cl.at)} — 로그 ${num(cl.chatLogs)} · 결과물 ${num(cl.artifacts)} · 사진 ${num(cl.images)} · 세션 ${num(cl.sessions)}건` : '아직 정리한 적이 없습니다.'}`;
    $('#pwMsg').textContent = o.customPassword ? '관리자 화면에서 바꾼 비밀번호를 사용 중입니다.' : '.env 의 ADMIN_PASSWORD 를 사용 중입니다.';
    $('#auditList').innerHTML = o.audits.length ? table(['시각', '내용', 'IP'], o.audits.map((a) => [fmt(a.createdAt), esc(a.action), esc(a.ip || '')])) : '<p class="muted">기록이 없습니다.</p>';
  }
  $('#costForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/cost', { method: 'POST', body: { dailyPerUser: Number($('#dailyPerUser').value), autoModel: $('#autoModel').checked, claudeLight: $('#claudeLight').value, gptLight: $('#gptLight').value, maxConcurrent: Number($('#maxConcurrent').value) } });
      feedback($('#costMsg'), '저장했습니다.');
    } catch (err) { feedback($('#costMsg'), err.message, true); }
  });
  $('#runCleanup').addEventListener('click', async () => {
    try { const r = await api('/ops/cleanup', { method: 'POST' }); feedback($('#cleanupMsg'), `정리했습니다. 로그 ${r.chatLogs} · 결과물 ${r.artifacts} · 사진 ${r.images} · 세션 ${r.sessions}`); loadOps(); } catch (err) { feedback($('#cleanupMsg'), err.message, true); }
  });
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/password', { method: 'POST', body: { current: $('#pwCur').value, next: $('#pwNew').value } });
      feedback($('#pwMsg'), '변경했습니다. 새 비밀번호로 다시 로그인하세요.');
      setTimeout(() => location.reload(), 1500);
    } catch (err) { feedback($('#pwMsg'), err.message, true); }
  });
  document.querySelectorAll('#qualityPanel [data-q]').forEach((b) => b.addEventListener('click', () => loadQuality(b.dataset.q)));
  $('#qualityPanel').addEventListener('toggle', (e) => { if (e.target.open) loadQuality('down'); });
  async function loadQuality(type) {
    document.querySelectorAll('#qualityPanel [data-q]').forEach((b) => b.classList.toggle('primary', b.dataset.q === type));
    const rows = await api(`/quality?type=${type}`);
    $('#qualityList').innerHTML = rows.length ? table(['시각', '채널', '질문', '답변', '비고'], rows.map((r) => [fmt(r.at), esc(r.channel), esc(r.userText), esc(r.replyText), esc(r.checkWarn || r.error || r.tools || '')])) : '<p class="muted">해당하는 대화가 없습니다.</p>';
  }

  // 셀러 차단 — 사용자 · 로그 영역 위에 패널 추가
  const blockPanel = document.createElement('details');
  blockPanel.className = 'card disclosure-card';
  blockPanel.innerHTML = '<summary><span data-icon="users"></span>셀러 차단 관리<span class="chevron" data-icon="chevron"></span></summary><div class="disclosure-body"><p class="muted">차단하면 카카오·웹챗·앱·MCP 모두 쓸 수 없고, 웹 로그인과 MCP 토큰이 끊깁니다.</p><div id="blockList" class="table-wrap"></div></div>';
  $('#auditPanel').before(blockPanel);
  blockPanel.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  blockPanel.addEventListener('toggle', () => { if (blockPanel.open) loadBlock(); });
  async function loadBlock() {
    const rows = await api('/users');
    const ch = { KAKAO: '카카오', WEB: '웹챗·앱', TEST: '테스트' };
    $('#blockList').innerHTML = rows.length ? table(['사용자', '채널', '연결 계정', '상태', ''], rows.map((u) => [esc(u.botUserKey), esc(ch[u.channel] || u.channel), esc(u.links.map((l) => l.accountName).join(', ') || '—'), u.blockedAt ? badge('b-bad', `차단 ${fmt(u.blockedAt)}`) + (u.blockReason ? ` <span class="muted">${esc(u.blockReason)}</span>` : '') : badge('b-ok', '정상'), u.blockedAt ? `<button type="button" data-unblock="${esc(u.id)}">차단 해제</button>` : `<button type="button" class="danger" data-block="${esc(u.id)}">차단</button>`])) : '<p class="muted">사용자가 없습니다.</p>';
  }
  $('#blockList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-block]');
    const u = e.target.closest('[data-unblock]');
    if (b) {
      const reason = window.prompt('차단 사유 (셀러에게는 보이지 않음)', '') ?? null;
      if (reason === null) return;
      await api(`/users/${b.dataset.block}/block`, { method: 'POST', body: { reason } });
    } else if (u) await api(`/users/${u.dataset.unblock}/unblock`, { method: 'POST' });
    else return;
    loadBlock();
  });

  // ── 알림 ───────────────────────────────────────
  async function loadNotify() {
    const n = await api('/notify');
    const s = n.settings;
    $('#nfEnabled').checked = s.enabled;
    $('#nfHour').value = s.morningHour;
    $('#nfKakao').value = s.kakaoMode;
    $('#nfKinds').innerHTML = Object.entries(n.labels).map(([k, label]) => `<label class="toggle compact"><input type="checkbox" data-kind="${k}" ${s.kinds[k] ? 'checked' : ''}><span><b>${esc(label)}</b></span></label>`).join('');
    $('#nfPreviewKind').innerHTML = Object.entries(n.labels).map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('');
    const last = n.lastRun ? `마지막 자동 실행 ${fmt(n.lastRun.at)} — ${n.lastRun.result.created}건 생성` : '';
    $('#notifyList').innerHTML = (last ? `<p class="muted">${esc(last)}</p>` : '') + (n.recent.length ? table(['시각', '종류', '계정', '제목', '채널', '상태'], n.recent.map((r) => [fmt(r.at), esc(KIND[r.kind] || r.kind), esc(r.account), esc(r.title), r.channel === 'WEB' ? '웹·앱' : '카카오', badge(...(STATUS[r.status] || ['b-off', r.status])) + (r.read ? ' <span class="muted">읽음</span>' : '')])) : '<p class="muted">아직 만든 알림이 없습니다.</p>');
  }
  $('#notifyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const kinds = {};
    document.querySelectorAll('#nfKinds [data-kind]').forEach((c) => { kinds[c.dataset.kind] = c.checked; });
    try {
      await api('/notify', { method: 'POST', body: { enabled: $('#nfEnabled').checked, morningHour: Number($('#nfHour').value), kinds, kakaoMode: $('#nfKakao').value } });
      feedback($('#nfMsg'), '저장했습니다.');
    } catch (err) { feedback($('#nfMsg'), err.message, true); }
  });
  $('#nfRun').addEventListener('click', async () => {
    try { const r = await api('/notify/run', { method: 'POST', body: {} }); feedback($('#nfMsg'), `셀러 ${r.users}명 확인 · 새 알림 ${r.created}건${r.errors ? ` · 오류 ${r.errors}` : ''} (같은 알림은 하루 1번)`); loadNotify(); } catch (err) { feedback($('#nfMsg'), err.message, true); }
  });
  $('#nfPreview').addEventListener('click', async () => {
    const out = $('#nfPreviewOut');
    try {
      const r = await api('/notify/preview', { method: 'POST', body: { kind: $('#nfPreviewKind').value, botUserKey: $('#testUser')?.value || 'admin-test-user' } });
      out.textContent = r.empty ? r.message : `${r.title}\n\n${r.body}`;
    } catch (err) { out.textContent = err.message; }
    out.hidden = false;
  });

  // ── MCP ────────────────────────────────────────
  async function loadMcp() {
    const m = await api('/mcp');
    $('#mcpEnabled').checked = m.enabled;
    $('#mcpEndpoint').value = m.endpoint;
    $('#mcpUser').innerHTML = m.users.length ? m.users.map((u) => `<option value="${esc(u.id)}">${esc(u.accounts)} · ${u.channel === 'WEB' ? '웹챗' : u.channel === 'KAKAO' ? '카카오' : '테스트'}</option>`).join('') : '<option value="">계정이 연결된 사용자가 없습니다</option>';
    $('#mcpTokens').innerHTML = m.tokens.length ? table(['토큰', '메모', '계정', '발급', '마지막 사용', '상태'], m.tokens.map((t) => [`<span class="mono">${esc(t.prefix)}…</span>`, esc(t.label), esc(t.accounts), fmt(t.createdAt), fmt(t.lastUsedAt), t.revokedAt ? badge('b-off', '폐기됨') : `${badge('b-ok', '사용 중')} <button type="button" class="danger" data-mcp-revoke="${esc(t.id)}">폐기</button>`])) : '<p class="muted">발급한 토큰이 없습니다.</p>';
  }
  $('#mcpEnabled').addEventListener('change', async (e) => { await api('/mcp', { method: 'POST', body: { enabled: e.target.checked } }); });
  $('#copyMcp').addEventListener('click', () => copy($('#mcpEndpoint').value, $('#mcpMsg')));
  $('#mcpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/mcp/tokens', { method: 'POST', body: { userId: $('#mcpUser').value, label: $('#mcpLabel').value } });
      $('#mcpTokenOut').innerHTML = `<div class="code"><span class="muted">${esc(r.note)}</span><strong class="mono token">${esc(r.token)}</strong></div>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '토큰 복사';
      b.addEventListener('click', () => copy(r.token, $('#mcpMsg')));
      $('#mcpTokenOut .code').append(b);
      $('#mcpLabel').value = '';
      loadMcp();
    } catch (err) { feedback($('#mcpMsg'), err.message, true); }
  });
  $('#mcpTokens').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mcp-revoke]');
    if (!b) return;
    await api(`/mcp/tokens/${b.dataset.mcpRevoke}/revoke`, { method: 'POST' });
    loadMcp();
  });

  // ── 로그인 후 불러오기 ──────────────────────────
  async function loadAll() {
    if (loaded) return;
    loaded = true;
    try { await Promise.all([loadStudio(), loadChannels(), loadOps(), loadNotify(), loadMcp()]); } catch { loaded = false; }
  }
  const app = $('#app');
  new MutationObserver(() => { if (!app.classList.contains('hidden')) loadAll(); else loaded = false; }).observe(app, { attributes: true, attributeFilter: ['class'] });
  if (!app.classList.contains('hidden')) loadAll();
  $('#notifyPanel').addEventListener('toggle', (e) => { if (e.target.open) loadNotify(); });
})();
