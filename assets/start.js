// 시작 페이지 — 관리자 설정에 따라 카카오 / 웹챗 / 앱 버튼을 보여준다
'use strict';
const $ = (s) => document.querySelector(s);
let cfg = {};
try { cfg = JSON.parse(document.body.dataset.config || '{}'); } catch { cfg = {}; }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

if (cfg.notice) { $('#notice').textContent = cfg.notice; $('#notice').hidden = false; }
if (cfg.kakao) {
  $('#optKakao').hidden = false;
  $('#kakaoChat').href = cfg.kakao.chat;
  $('#kakaoAdd').href = cfg.kakao.add;
}
if (cfg.web) {
  $('#optWeb').hidden = false;
  $('#webOpen').href = cfg.web;
  $('#navChat').hidden = false;
}
if (cfg.app && !isIOS) {
  $('#optApp').hidden = false;
  $('#appDownload').href = cfg.app.url;
  const mb = cfg.app.size ? ` · ${(cfg.app.size / 1048576).toFixed(1)}MB` : '';
  $('#appVer').textContent = `v${cfg.app.version || '최신'}${mb}`;
}
$('#iosTip').hidden = !cfg.web || (isMobile && !isIOS);

$('#webCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(cfg.web); toast('웹챗 링크를 복사했어요'); } catch { prompt('링크를 복사하세요', cfg.web); }
});

const qrLabel = { web: '웹챗', app: '안드로이드 앱', kakao: '카카오톡 채널' };
const qrUrl = { web: () => cfg.web, app: () => cfg.app?.url, kakao: () => cfg.kakao?.chat };
document.querySelectorAll('.qr-toggle').forEach((b) => {
  if (isMobile) { b.hidden = true; return; }
  b.addEventListener('click', () => {
    const k = b.dataset.qr;
    $('#qrTitle').textContent = `${qrLabel[k]} — 휴대폰 카메라로 찍어 보세요`;
    $('#qrImg').src = `/sellerbricks-bot/qr.svg`;
    $('#qrUrl').textContent = qrUrl[k]() || '';
    $('#qrDialog').showModal();
  });
});
$('#qrDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

// 아무 채널도 없을 때
if (!cfg.kakao && !cfg.web && !(cfg.app && !isIOS)) {
  $('.options').innerHTML = '<p class="choose-sub">지금은 준비 중이에요. 잠시 후 다시 들러 주세요.</p>';
}
