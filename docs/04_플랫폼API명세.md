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

셀러 관리자 화면: **"카카오 챗봇 연결"** — [코드 발급] 버튼 → 6자리 숫자 + 남은 시간 표시, 연결된 챗봇 목록 + [연결 해제].

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

## 9. 스튜디오 (배포 후 v1 추가 예정)
같은 인증 방식. 예정 엔드포인트: `/facilities/search`(유형·지역·품목·요일·시간), `/facilities/{id}/availability`, `/bookings/mine`, `/orders/summary`(스튜디오 주문 — 셀러브릭스 주문과 분리).
