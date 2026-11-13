# sellerbricks-bot

셀러브릭스 + 셀러브릭스 스튜디오 공용 카카오 채널 챗봇·MCP 서버.

**처음 작업하는 경우 `docs/00_인수인계서.md` 부터 읽을 것.**

- 현재: 1차 개발(1~7단계) 완료 — 가짜 데이터·가짜 응답 모드로 전체 동작. 셀러브릭스 실제 연동 전.
- 실행: `1_setup.bat` → `2_start_dev.bat` → http://localhost:3071/admin (자세히: `docs/05_실행방법.md`)
- 점검: `3_selftest.bat`

## 구조
```
src/
  server.ts              Fastify 서버 (포트 3071)
  bot.ts                 메시지 처리 핵심 (명령·AI·로그·속도 제한·대화 기억)
  admin/routes.ts        관리자 API
  kakao/                 오픈빌더 스킬·콜백·응답 JSON
  agent/                 AI 에이전트 + Claude / GPT / 가짜 응답 어댑터
  tools/                 MCP 형식 도구 (셀러 정보는 인자로 받지 않음)
  platforms/sellerbricks types.ts(API 계약) · http.ts(실제) · mock.ts(가짜)
  link/                  계정 연결 (6자리 코드 → 연결 토큰)
  lib/                   설정·암호화·DB·한국 시간·개인정보 가림
public/admin.html        관리자 화면
prisma/schema.prisma     봇 전용 DB (SQLite)
scripts/selftest.ts      자체 점검
docs/                    인수인계·계획·API 명세·실행 방법
```
