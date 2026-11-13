// AI 셀러 비서 웹챗 — 홈 화면 설치(PWA)용 서비스 워커
// 화면 파일(css·js·아이콘)만 저장해 두고, 대화·로그인 API 는 항상 서버에서 받는다.
const CACHE = 'sb-chat-v2';
const SHELL = ['/chat', '/assets/chat.css', '/assets/auth.css', '/assets/chat.js', '/assets/app-icon.svg', '/assets/icon-192.png', '/assets/seller-login.webp'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sb-chat-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/chat/api')) return;
  if (e.request.mode === 'navigate') {
    // 화면: 서버 우선, 오프라인이면 저장해 둔 화면
    e.respondWith(fetch(e.request).catch(() => caches.match('/chat')));
    return;
  }
  if (SHELL.includes(url.pathname)) {
    // css·js: 저장본을 바로 쓰고 뒤에서 새로 받아 둔다
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const net = fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        });
        return hit || net;
      }),
    );
  }
});
