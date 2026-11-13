# 플랫폼 내부 봇 API 명세 v2 (2026-11-13)

> v1(기본 조회 11개) + **v2(범용 조회 7개 · 쓰기 4개)**. 셀러브릭스 쪽은 v1 → v2 순서로 만들어도 되고 한 번에 만들어도 된다.

> sellerbricks-bot 이 셀러브릭스(그리고 나중에 스튜디오)에 붙을 때 쓰는 **약속 문서**.
> 셀러브릭스 쪽 개발(별도 브랜치)은 이 문서대로 만들면 봇에 바로 연결된다.
> 봇 쪽 구현: `src/platforms/sellerbricks/http.ts`(호출), `src/platforms/sellerbricks/types.ts`(응답 타입 — **이 파일이 정답**), `src/platforms/sellerbricks/mock.ts`(가짜 구현 = 동작 예시).

## 1. 기본 규칙
| 항목 | 내용 |
|---|---|
| 주소 | `{셀러브릭스 주소}/api/bot/v1/...` (Next.js App Router: `app/api/bot/v1/.../route.ts`) |
| 형식 | JSON, UTF-8 |
| 시간 | 요청의 `from`/`to` 는 ISO 8601(UTC). 기간 경계는 봇이 **한국 시간 0시 기준**으로 계산해 보냄. 응답 날짜도 ISO 8601 |
| 성공 응답 | `{ "ok": true, "data": { ... } }` |
| 실패 응답 | `{ "ok": false, "error": { "code": "LINK_INVALID", "message": "사람이 읽는 설명" } }` + 알맞은 HTTP 상태 |
| 제한 시간 | 봇은 8초 기다림. 목록은 최대 30건까지만 돌려주고 전체 건수·금액은 따로 |

### 에러 코드
| code | HTTP | 뜻 |
|---|---|---|
| `LINK_INVALID` | 400 | 연결 코드가 없거나 틀림 |
| `LINK_EXPIRED` | 400 | 연결 코드 5분 지남 |
| `UNAUTHORIZED` | 401 | 서명 불일치 / 연결 토큰 없음·폐기됨 |
| `NOT_FOUND` | 404 | 대상 없음 |
| `BAD_REQUEST` | 400 | 파라미터 오류 |
| `UNAVAILABLE` | 503 | 일시 장애 |

## 2. 인증 (두 겹)
### ① 서버 서명 — 모든 요청
봇과 셀러브릭스가 같은 **서명 키**(긴 랜덤 문자열, `.env` 에 `BOT_API_SIGNING_KEY`)를 나눠 갖는다.
```
X-Bot-Timestamp: 1763012345            (유닉스 초)
X-Bot-Signature: hex( HMAC-SHA256( 서명키, 메시지 ) )
메시지 = `${timestamp}\n${METHOD}\n${경로+쿼리}\n${sha256hex(본문)}`
         경로+쿼리 예: /api/bot/v1/orders/summary?from=...&to=...   (본문 없으면 빈 문자열의 sha256)
```
셀러브릭스 검증: ① 타임스탬프가 현재 ±300초 이내 ② 같은 방식으로 계산한 서명과 **timingSafeEqual** 비교. 실패 시 401.
(봇 쪽 서명 함수: `signRequest()` in `http.ts` — 그대로 옮겨 쓰면 됨)

### ② 셀러 연결 토큰 — 조회 요청
`Authorization: Bearer <linkToken>`
- 연결 검증(`/link/verify`) 때 셀러브릭스가 **셀러별로 발급**하는 랜덤 토큰(32바이트 이상).
- 셀러브릭스는 토큰 → sellerId 를 찾아 **그 셀러 데이터만** 돌려준다. 봇은 sellerId 를 보내지 않는다. (서명 키가 새도 토큰 없이는 셀러 데이터 접근 불가)
- DB 에는 토큰 **해시(sha256)** 만 저장 권장.

## 3. 셀러브릭스에 추가할 것 (신규 테이블만, 기존 테이블 변경 없음)
```prisma
model BotLinkCode {            // 셀러 관리자 화면에서 발급하는 6자리 코드
  id        String   @id @default(cuid())
  code      String   @unique @db.VarChar(6)
  sellerId  String              // SellerProfile.id
  expiresAt DateTime            // 발급 + 5분
  usedAt    DateTime?
  createdAt DateTime @default(now())
  @@map("bot_link_codes")
}
model BotLink {                // 연결된 챗봇 사용자
  id          String   @id @default(cuid())
  sellerId    String              // SellerProfile.id
  botUserKey  String   @db.VarChar(191)
  tokenHash   String   @unique @db.VarChar(64)   // sha256(linkToken)
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())
  @@index([sellerId])
  @@map("bot_links")
}
```
⚠️ 운영 RDS 직결 — 인수인계서 5장의 안전 절차(diff 로 DROP 없음 확인 → `db push --skip-generate` → `generate`)를 반드시 지킬 것.

셀러 관리자 화면: **"AI 셀러 비서"** 메뉴 (3차에서 이름 변경 — 카카오·웹챗·앱 공용)
- [코드 발급] 버튼 → 6자리 숫자 + 남은 시간 표시 (이 코드를 카카오 채팅방에 "연결 123456" 또는 웹챗·앱 첫 화면에 입력)
- 연결된 챗봇 목록 + [연결 해제] (botUserKey 가 `web:` 로 시작하면 "웹챗·앱", 아니면 "카카오"로 표시)
- **[AI 셀러 비서 열기]** 링크 → 봇 시작 페이지 `{봇 주소}/` (새 창). 셀러브릭스 `.env` 에 `BOT_PUBLIC_URL` 추가 권장
- 같은 셀러가 여러 기기에서 연결하면 BotLink 가 여러 개 생길 수 있음(정상). 봇은 같은 계정의 옛 토큰을 `/link/revoke` 로 해제한다

## 4. 엔드포인트
응답 필드 상세는 `types.ts` 의 같은 이름 타입 참고.

| # | 메서드·경로 | 요청 | 응답 타입 | 설명 |
|---|---|---|---|---|
| 1 | `POST /link/verify` | body `{ code, botUserKey }` (토큰 없음) | `LinkVerifyResult` | 코드 검증(5분·1회용) → 토큰 발급, `accountId`=SellerProfile.id, `accountName`=shopName |
| 2 | `POST /link/revoke` | 토큰 | `{}` | 연결 해제 (revokedAt 기록) |
| 3 | `GET /orders/summary` | `from,to` | `OrderSummary` | 일반 주문(Order) / 주문서(SocialOrder) **분리 집계** |
| 4 | `GET /orders/live` | `which=latest\|previous`, `streamId?` | `LiveOrders` | 방송(LiveStream)별 주문서 집계 + 인기 상품 |
| 5 | `GET /orders/unpaid` | `from,to` | `OrderList` | 미입금(계좌)·미결제(카드 링크)·결제대기(일반), 오래된 순 |
| 6 | `GET /orders/unshipped` | `delayDays` | `UnshippedList` | 결제 완료 + 송장 없음, 오래된 순, delayDays 초과 건수 |
| 7 | `GET /orders/cancels` | `openOnly` | `CancelRequests` | 최근 30일 전액취소(cancelStatus) + 부분취소(PartialCancelRequest) |
| 8 | `GET /settlement/summary` | `month=YYYY-MM` | `SettlementSummary` | 매출·정산 예정액·출금 가능액·출금 신청(PayoutRequest) |
| 9 | `GET /products/top` | `from,to,limit` | `TopProducts` | 결제 완료 기준 판매 순위 |
| 10 | `GET /products` | `linkNo?, keyword?, lowStock?` | `ProductList` | 간편 상품(SellerQuickProduct): 구매링크 번호·재고 |
| 11 | `GET /orders/search` | `q, from, to` | `OrderList` | 이름·닉네임·주문서 제목·전화 뒷4자리 검색 |

## 5. 구현 시 꼭 지킬 것
1. **정산 금액은 기존 정산 코드(settlement.ts 등)를 그대로 호출**해서 계산. 새로 계산식을 만들지 말 것 (스냅샷·부분취소·원천징수 규칙이 이미 들어 있음).
2. **sellerId 혼동 주의**: `SocialOrder.sellerId`·`Order.sellerId` = SellerProfile.id, `SellerQuickProduct.sellerId` = SellerProfile.**userId**.
3. **개인정보**: 구매자 이름은 `홍*동` 형태로 가려서, 전화번호는 **뒷 4자리만**(`phoneLast4`). 주소는 보내지 않음.
4. **주문서 vs 일반 주문은 합치지 않는다.** 금액은 취소 완료분 제외, 승인된 부분취소액 차감.
5. `OrderSummary.previous` 는 직전 동기간. 진행 중인 기간(오늘·이번 주)은 **지금까지 경과한 시간만큼만** 비교.
6. `statusLabel` 은 셀러가 보는 한글 상태(미입금 / 결제 대기 / 결제 완료 / 배송 준비 / 배송 중 / 배송 완료 / 취소 요청 중 / 취소 완료).
7. `adminUrl` 은 셀러 관리자 화면의 실제 경로(해당 주문 상세)로.
8. 읽기 전용. 쓰기 API(송장 입력·예약 등)는 3단계에서 별도 명세.

## 6. 연결 확인 방법
1. 셀러브릭스 `.env` 와 봇 관리자 화면에 같은 서명 키 입력
2. 봇 관리자 화면 → 플랫폼 연결 → 셀러브릭스 "실제 API", 주소 입력 → 저장
3. 셀러 관리자 화면에서 코드 발급 → 봇 테스트 채팅에 `연결 123456` → 질문

## 7. v2 — 범용 조회 (2-1차)
봇이 "무엇이든" 답하려면 조건을 조합하는 조회가 필요하다. 계산(합계·묶음·비교)은 **셀러브릭스가 DB 에서** 한다 (AI 가 계산하지 않게).

| # | 메서드·경로 | 요청 | 응답 타입 | 설명 |
|---|---|---|---|---|
| 12 | `POST /query/orders` | body `OrderQuery` (from·to ISO) | `OrderQueryResult` | 조건: orderType, payTypes[], statuses[](UNPAID·PAID·PREPARING·SHIPPING·DELIVERED·CANCEL_REQUESTED·CANCELLED, 생략 시 취소완료 제외), liveStreamId('latest' 허용), productKeyword, buyer(이름·닉네임·뒷4자리), min/maxAmount. groupBy: day·weekday·hour(KST)·product·live·payType·status·buyer. compare=true 면 직전 동기간(진행 중 기간은 경과 시간만큼). items 는 최대 30건 표본 |
| 13 | `POST /query/products` | body `ProductQuery` | `ProductQueryResult` | scope: QUICK(SellerQuickProduct, 평생번호) / DIRECT(DirectProduct, 마이샵 진열용) / ALL. 판매 실적(soldQty·soldAmount)은 salesFrom~salesTo 결제 완료 기준 |
| 14 | `POST /query/customers` | body `CustomerQuery` | `CustomerQueryResult` | 구매자 = 전화번호 기준 묶음. 재구매 = 기간 내 2회 이상. newFans = 기간 내 신규 팬 |
| 15 | `GET /settlement/history` | `fromMonth, toMonth` | `SettlementHistory` | 월별 매출·수수료·정산 예정액 — **settlement.ts 계산 재사용**, settlementBusinessDays(관리자 설정, 기본 5) 포함 |
| 16 | `GET /lives` | `limit` | `LiveList` | 예정(SCHEDULED) 방송 + 최근 방송별 주문서 실적 |
| 17 | `GET /shop/activity` | — | `ShopActivity` | 방송 중·다음 방송, MO 문자 주문 수(오늘·7일), 알림톡 잔여 크레딧, 미답변 리뷰, 안 읽은 상품 문의(ProductChat), 신규 팬, 방문자(AnalyticsDaily) |
| 18 | `GET /seller/defaults` | — | `SellerDefaults` | 샵 이름·주소, 기본 배송비, 조건부 무료배송 기준 (상품 등록 기본값) |

## 8. v2 — 쓰기 (사진 상품 등록, 2-1차)
**DB 변경 없음.** 기존 코드 재사용: 업로드 `app/api/upload/route.ts`(S3), 마이샵 간편 상품 `app/api/seller/direct-products/route.ts`, 주문서 간편 상품 `app/api/seller/quick-products/route.ts`, 옵션 검증 `validateQuickProductOptionsInput`.

| # | 메서드·경로 | 요청 | 응답 | 설명 |
|---|---|---|---|---|
| 19 | `POST /images` | `{ base64, contentType }` (8MB 이하, jpeg·png·webp·gif) | `{ url }` | 매직 바이트로 이미지 형식 확인 후 S3 저장 (upload route 와 같은 규칙) |
| 20 | `POST /products/direct` | `NewProductInput` | `CreatedProduct` | 간편 상품(마이샵 진열용, **DirectProduct**) 생성. images·description·stock(null 이면 0 + 재고 미관리 처리 방식은 셀러브릭스 규칙 따름)·shippingFee·options |
| 21 | `POST /products/quick` | `NewProductInput` | `CreatedProduct` | 간편 상품(주문서 선택용, **SellerQuickProduct**) 생성 — **linkNo 는 셀러별 다음 번호 자동 부여**(삭제된 번호 재사용 금지), useStock = stock !== null, maxQty 기본 1, orderType ALL. ⚠️ sellerId = SellerProfile.**userId** |
| 22 | `POST /products/{direct\|quick}/{id}/active` | `{ active }` | `{}` | 판매 중지/재개 (isActive). 삭제 아님 |

규칙:
1. **idempotencyKey**: 같은 키로 다시 오면 새로 만들지 말고 처음 결과를 그대로 돌려준다 (셀러가 [등록]을 두 번 눌러도 1개). 키는 24시간 보관이면 충분 — 별도 테이블 대신 메모리/Redis/기존 설정 테이블 중 택1 (DB 변경 없이 하려면 상품 description 끝에 숨김 표식 대신 메모리 캐시 권장).
2. 연결 토큰의 셀러 상품만 만들고 바꿀 수 있다. 다른 셀러 id 를 넣어도 무시.
3. 쓰기 요청은 감사 로그(누가·언제·무엇을)를 남긴다 — 기존 로그 방식 사용.
4. 응답 `adminUrl` = 셀러 관리자 해당 상품 화면, `shopUrl` = 셀러샵 일반상품 탭 상품 주소(마이샵).

## 9. 스튜디오 (배포 후 셀러브릭스 스튜디오 저장소에 추가) — 3차에서 확정
같은 인증 방식(서명 + 셀러 연결 토큰). 같은 규칙: 신규 테이블 `BotLinkCode`·`BotLink`(sellerId 대신 스튜디오 User.id 또는 판매자 id)만 추가. **응답 타입 정답: 봇 `src/platforms/studio/types.ts`**, 동작 예시: `src/platforms/studio/mock.ts`.

| # | 메서드·경로 | 요청 | 응답 타입 | 설명 |
|---|---|---|---|---|
| S1 | `POST /link/verify` | `{ code, botUserKey }` | `LinkVerifyResult` | 스튜디오 셀러 화면 "AI 셀러 비서" 메뉴에서 발급한 6자리 |
| S2 | `POST /link/revoke` | 토큰 | `{}` | |
| S3 | `GET /facilities/search` | `type?(STUDIO\|WAREHOUSE), region?, specialty?, date?(YYYY-MM-DD KST), startTime?(HH:mm), hours?, limit?` | `FacilitySearchResult` | **APPROVED 시설만**. date 를 주면 FacilityAvailableSlot(요일)·FacilityBlackoutDate·FacilityTimeBlock·기존 Booking(PENDING/APPROVED)·minLeadHours·maxAdvanceDays 를 반영해 그날 시작 가능한 시각(freeSlots) 계산 — **예약 정책 계산은 스튜디오 기존 코드 재사용** |
| S4 | `GET /facilities/{id}/availability` | `date` | `Availability` | 그날 슬롯별 가능 여부 + 예약 규칙. 휴무면 closed=true |
| S5 | `GET /bookings/mine` | `from, to, status?` | `BookingList` | 토큰 셀러의 Booking, adminUrl = 스튜디오 셀러 화면 예약 상세 |
| S6 | `GET /orders/summary` | `from, to` | `StudioOrderSummary` | 스튜디오 자체 Order 집계 (셀러브릭스 주문과 별개) |

읽기 전용. 예약 생성·취소 같은 쓰기는 나중에 별도 명세(확인 버튼 필수).

## 10. 셀러 입구 — 대시보드 상단 [AI 비서] 버튼 + 로그인 동기화 (2026-11-13 확정)
> 셀러는 셀러브릭스에 로그인한 상태에서 **대시보드 맨 위 [AI 비서] 버튼** 하나로 봇에 들어간다. 코드를 보거나 입력하지 않는다.
> 셀러브릭스 쪽 작업은 **나중에 별도 브랜치(B단계)** 에서. 봇 쪽 자동 로그인은 이미 구현됨(`public/chat.js` autoLogin). 스튜디오도 같은 방식(C-2단계).

### 10-1. 흐름
1. 셀러가 셀러브릭스 대시보드 상단 **[AI 비서]** 버튼 클릭
2. 셀러브릭스 서버가 로그인 세션의 셀러로 **1회용 연결 코드(60초)** 발급 → `{봇}/chat?platform=SELLERBRICKS&code=123456` 을 **새 탭**으로 연다
3. 봇이 1번 API(`/link/verify`)로 코드를 확인 → 연결 토큰 저장 → 봇 세션(30일) 발급 → 채팅 화면. 주소창의 코드는 즉시 지움
4. 처음 누를 때 계정 연결까지 자동 완료. 이후에도 누를 때마다 같은 방식으로 다시 맞춰진다(세션 갱신)

### 10-2. 셀러브릭스에 추가할 것
| 항목 | 내용 |
|---|---|
| 버튼 | `src/app/(dashboard)/layout.tsx` 상단(헤더)에 **[AI 비서]** — **SELLER 역할에만** 표시 (SUPER_ADMIN·MIDDLE·BRAND·NODE 숨김). 모바일 헤더에도 |
| 코드 발급 API | `POST /api/seller/bot-link/web-code` (셀러 로그인 세션 필수, 1분 10회 제한) → `BotLinkCode` 생성(유효 60초, sellerId = 세션 셀러의 SellerProfile.id) → `{ url: "{BOT_PUBLIC_URL}/chat?platform=SELLERBRICKS&code=123456" }` |
| 버튼 동작 | 클릭 즉시 `window.open('', '_blank')` 로 빈 탭을 먼저 연 뒤 API 응답의 url 로 이동 (팝업 차단 방지). 실패하면 탭을 닫고 토스트 |
| 환경변수 | `BOT_PUBLIC_URL=https://bot.sellerbricks.co.kr` |
| 테이블·API | 3장의 `BotLinkCode`·`BotLink` + 4장 1·2번(`/link/verify`·`/link/revoke`) + 조회 API — 원래 계획 그대로 |

### 10-3. 동기화 규칙
| 상황 | 동작 |
|---|---|
| 다른 셀러 계정으로 버튼 클릭 | 봇도 그 계정으로 자동 전환 (봇 구현됨) |
| 같은 계정을 PC·휴대폰·앱에서 | 같은 대화 기록 (봇 구현됨) |
| 셀러브릭스 로그아웃 | (선택) 로그아웃 처리에서 그 셀러의 웹 BotLink 들을 `/link/revoke` 와 같은 방식으로 폐기 → 봇은 다음 요청 때 "계정 연결이 끊어졌어요" 안내. 넣지 않으면 봇 세션은 30일 유지 |
| 코드 만료·오류 | 봇 로그인 화면에 "관리자 화면에서 다시 [AI 비서]를 눌러 주세요" 안내 (봇 구현됨) |

### 10-4. 그 밖의 입구 (보조)
- **카카오 채널·앱 받기**: 웹챗 메뉴 → "다른 방법으로 쓰기"(봇 구현됨), 셀러브릭스 설정 화면의 "AI 셀러 비서" 페이지(선택 — 카카오 연결용 5분 코드·[코드 복사], 연결된 기기 목록·[연결 해제])
- 그 페이지를 만들 때 버튼 주소는 `GET {봇}/start/config`(공개 JSON, 5분 캐시)에서 읽는다: `{ kakao: { chat, add } | null, web, app: { url, version, size } | null, notice }` — 봇 관리자 화면에서 바꾸면 자동 반영, null 이면 숨김
- 봇 시작 페이지(`{봇}/`)는 링크 공유·점검 때 쓰는 예비 입구로 유지

### 10-5. 봇 쪽 남은 작은 일
- 웹챗 상단에 "셀러브릭스로 돌아가기" 링크 (셀러브릭스 주소 설정값 사용)
- (2단계 선택) 대시보드 안 떠 있는 채팅 창(iframe 위젯) — 봇 `frame-ancestors` 에 셀러브릭스 도메인 허용 + 세션 쿠키 `SameSite=None; Secure` 필요, 보안 점검 후
