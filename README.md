# sellerbricks-bot — AI 셀러 비서

셀러브릭스 + 셀러브릭스 스튜디오 공용 AI 셀러 비서 서버. 셀러는 **카카오 채널 · 웹챗 · 안드로이드 앱** 중 골라 쓰고, 외부 AI(Claude·ChatGPT 등)는 **MCP** 로 같은 도구를 쓴다.

**처음 작업하는 경우 `docs/00_인수인계서.md` 부터 읽을 것.**

- 현재: 1차 + 2-1차 + 3차 완료 — 범용 조회·리포트/엑셀·문구 작성·FAQ·사진 상품 등록 / 시작 페이지·웹챗·앱·채널 선택 / 비용·알림·운영 / 스튜디오(가짜) / MCP. 가짜 데이터·가짜 응답 모드로 전체 동작, 실제 API 연동 전.
- 실행: `0_preview.bat` → http://localhost:3071/ (시작 페이지) · `/chat` (웹챗) · `/admin` (관리자) — 자세히 `docs/05_실행방법.md`
- 점검: `3_selftest.bat` · 앱 빌드: `5_build_apk.bat` (`docs/07_웹챗_앱.md`)

## 문서
| 문서 | 내용 |
|---|---|
| 00 인수인계서 | 현재 상태·결정·작업 규칙 |
| 03 개발계획 v2 | 차수별 진행·다음 할 일 |
| 04 플랫폼 API 명세 | 셀러브릭스·스튜디오가 만들 내부 봇 API |
| 05 실행 방법 | Windows 실행·시험 |
| 06 관리자 화면 연동 메모 | 새 관리자 화면에 붙은 기능·API |
| 07 웹챗·앱 | 시작 페이지·웹챗·APK 만들기·배포 |
| 08 배포 가이드 | EC2·pm2·nginx·HTTPS·백업 |
| 09 카카오 설정 매뉴얼 | 채널·오픈빌더·스킬·사진·콜백 신청 |
| 10 MCP 연동 | 외부 AI 연결·OAuth 설계 |

## 구조
```
src/
  server.ts              Fastify 서버 (포트 3071) + 알림·기록 정리 자동 작업
  bot.ts                 대화 처리 핵심 (카카오·웹챗·앱·테스트 공용 — 명령·AI·로그·속도 제한·대화 기억)
  channels/profile.ts    채널별 차이 (글자 수·마크다운·긴 답변·속도 제한)
  kakao/                 오픈빌더 스킬·콜백·응답 JSON
  webchat/               웹챗·앱 API(routes) · 세션 · 시작 페이지·QR·APK 내려받기(start)
  mcp/routes.ts          외부 AI용 MCP 서버 (POST /mcp)
  agent/                 AI 에이전트 + Claude / GPT / 가짜 응답 (모델 자동 선택·하루 한도·대기열)
  tools/                 MCP 형식 도구 23개 (셀러브릭스 19 + 스튜디오 4, 셀러 정보는 인자로 받지 않음)
  notify/engine.ts       알림 (아침 요약·방송 리포트·미입금·송장 지연·취소)
  ops/maintenance.ts     기록 정리·관리자 비밀번호·변경 이력
  admin/                 관리자 API (routes.ts + ext.ts)
  product/draft.ts       사진 상품 등록 비서
  web/routes.ts          결과 페이지(/r/…) · CSV · 사진(/img/…)
  platforms/             sellerbricks/ · studio/  (types=API 계약, http=실제, mock=가짜)
  link/                  계정 연결 (6자리 코드 → 연결 토큰)
  lib/                   설정·암호화·DB·한국 시간·개인정보 가림·결과물·FAQ·광고 문구 점검
public/                  시작 페이지(start.*) · 웹챗(chat.*, chat-sw.js) · 관리자(admin*) · 아이콘
app-android/             안드로이드 앱 (Capacitor 8 — 웹챗을 감싼 껍데기)
prisma/schema.prisma     봇 전용 DB (SQLite)
scripts/selftest.ts      자체 점검 (158개)
```
