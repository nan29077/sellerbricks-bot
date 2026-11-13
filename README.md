# sellerbricks-bot

셀러브릭스 + 셀러브릭스 스튜디오 공용 카카오 채널 챗봇·MCP 서버.

**처음 작업하는 경우 `docs/00_인수인계서.md` 부터 읽을 것.**

- 현재: 1차 + 2-1차 고도화 완료 — 범용 조회·리포트/엑셀·문구 작성·FAQ·사진 상품 등록. 가짜 데이터·가짜 응답 모드로 전체 동작. 셀러브릭스 실제 연동 전.
- 실행: `0_preview.bat` (또는 `1_setup.bat` → `2_start_dev.bat`) → http://localhost:3071/admin (자세히: `docs/05_실행방법.md`). 서버를 켤 때 DB 구조가 자동으로 맞춰짐(`predev`).
- 점검: `3_selftest.bat`

## 카카오톡 테스트와 공유

- 관리자 화면 하단 **테스트 채팅**에서 샘플 셀러 연결 코드를 발급하고 채팅으로 보내세요. ‘오늘 주문 정리해줘’를 보내면 챗봇 서버가 처리한 카카오 응답을 확인할 수 있습니다.
- 카카오톡 앱에서 테스트하려면 서버를 공개 HTTPS 주소로 배포하고, 관리자 화면의 **카카오 스킬 주소**를 카카오 챗봇 관리자센터의 스킬 URL에 등록하세요. 해당 스킬을 테스트할 블록에 연결한 뒤 관리자센터의 봇 테스트 또는 연결된 카카오톡 채널에서 메시지를 보내세요.
- 배포 환경의 `PUBLIC_BASE_URL`에 공개 주소를 설정하세요. **공유 링크**로 복사한 `/admin` 주소를 카카오톡에 붙여넣으면 공유 이미지와 슬로건이 미리보기로 표시됩니다.

## 구조
```
src/
  server.ts              Fastify 서버 (포트 3071)
  bot.ts                 메시지 처리 핵심 (명령·AI·로그·속도 제한·대화 기억)
  admin/routes.ts        관리자 API
  kakao/                 오픈빌더 스킬·콜백·응답 JSON
  agent/                 AI 에이전트 + Claude / GPT / 가짜 응답 어댑터
  tools/                 MCP 형식 도구 19개 (셀러 정보는 인자로 받지 않음)
                         sellerbricks.ts(자주 묻는 질문) · query.ts(범용 조회·리포트·설정) · content.ts(문구 작성·FAQ 검색)
  product/draft.ts       사진 상품 등록 비서
  web/routes.ts          결과 페이지(/r/…) · CSV · 사진(/img/…)
  platforms/sellerbricks types.ts(API 계약) · http.ts(실제) · mock.ts(가짜)
  link/                  계정 연결 (6자리 코드 → 연결 토큰)
  lib/                   설정·암호화·DB·한국 시간·개인정보 가림·결과물·FAQ 초안·광고 문구 점검
public/                  관리자 화면·로고·공유 이미지
prisma/schema.prisma     봇 전용 DB (SQLite)
scripts/selftest.ts      자체 점검
docs/                    인수인계·계획·API 명세·실행 방법
```
