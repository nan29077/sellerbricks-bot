// 봇 서버 주소(../.env 의 PUBLIC_BASE_URL 또는 실행 인자)로 capacitor.config.json 을 만든다.
// 사용: node scripts/configure.mjs [https://bot.sellerbricks.co.kr]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

let base = (process.argv[2] || '').trim();
if (!base) {
  const env = resolve(process.cwd(), '..', '.env');
  if (existsSync(env)) {
    const m = readFileSync(env, 'utf8').match(/^\s*APP_SERVER_URL\s*=\s*"?([^"\r\n]+)"?/m) || readFileSync(env, 'utf8').match(/^\s*PUBLIC_BASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) base = m[1].trim();
  }
}
base = base.replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+/.test(base)) {
  console.error('봇 서버 주소를 찾지 못했습니다. .env 에 PUBLIC_BASE_URL(또는 APP_SERVER_URL)을 넣거나, 주소를 인자로 주세요.');
  process.exit(1);
}
const url = new URL(base);
if (/^(localhost|127\.)/.test(url.hostname)) {
  console.warn('');
  console.warn('[주의] 서버 주소가 localhost 입니다. 휴대폰에서는 접속할 수 없어요.');
  console.warn('       에뮬레이터 시험은 http://10.0.2.2:3071 , 실제 휴대폰은 PC의 내부 IP(예: http://192.168.0.10:3071)');
  console.warn('       또는 배포 주소(https://bot.도메인)를 .env 의 APP_SERVER_URL 에 넣으세요.');
  console.warn('');
}
const config = {
  appId: 'kr.co.sellerbricks.aibot',
  appName: 'AI 셀러 비서',
  webDir: 'www',
  appendUserAgent: 'SellerbricksBotApp/1.0',
  backgroundColor: '#f4f7f6',
  server: {
    url: `${base}/chat`,
    cleartext: url.protocol === 'http:',
    allowNavigation: [url.host],
    errorPath: 'index.html',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    App: {},
  },
};
writeFileSync(resolve(process.cwd(), 'capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`capacitor.config.json 작성 완료 → ${config.server.url}`);
