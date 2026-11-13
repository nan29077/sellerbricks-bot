// FAQ 초안 — 셀러브릭스 코드(E:\프로젝트\sellerbricks\app\app)를 읽기만 해서 정리한 내용 (2026-11-13)
// 처음 실행 때 FaqDoc 이 비어 있으면 넣는다. 이후에는 관리자 화면에서 수정한다.
// ⚠️ 운영 전에 실제 정책과 맞는지 사람이 확인할 것 (특히 수수료율·출금 수수료는 셀러별·관리자 설정값이라 숫자를 넣지 않음)
import { prisma } from './db.js';

export const FAQ_SEED: { category: string; question: string; answer: string; keywords: string; source: string }[] = [
  { category: '정산', question: '정산금은 언제 출금할 수 있나요?', answer: '결제 완료일로부터 영업일 기준 5일 뒤에 "정산 가능 금액"으로 바뀌어 출금 신청할 수 있어요. 영업일은 토·일·공휴일(대체공휴일 포함)을 뺀 날이에요. 기준 일수는 관리자 설정에 따라 바뀔 수 있어요. 그 전까지는 "정산 예정 금액"으로 보여요.', keywords: '정산일 출금 언제 영업일 정산가능 정산예정 입금', source: 'lib/settlement.ts, lib/businessDays.ts (settlementBusinessDays 기본 5)' },
  { category: '정산', question: '출금하면 실제로 얼마가 들어오나요?', answer: '실제 입금액 = 출금 신청 금액 − 출금 수수료 − 원천징수(비사업자만)예요. 출금 수수료는 신청 금액 × 수수료율이고, 비사업자 셀러는 (신청 금액 − 수수료)의 3.3%(소득세 3% + 지방소득세 0.3%)가 원천징수돼요. 사업자 셀러는 원천징수가 없어요.', keywords: '실입금 출금 수수료 원천징수 3.3 세금 비사업자 사업자', source: 'lib/payout.ts, lib/tax.ts' },
  { category: '정산', question: '출금 신청 중인 금액은 어떻게 되나요?', answer: '신청·승인·지급 완료된 출금은 모두 출금 가능 금액에서 빠져요(반려된 건만 다시 돌아와요). 같은 돈을 두 번 신청하지 못하게 하기 위해서예요.', keywords: '출금 신청 중 차감 반려 이중', source: 'lib/settlement.ts 주석' },
  { category: '정산', question: '정산 금액은 어떻게 계산되나요?', answer: '정산액(세전) = 결제 금액 − 공급가(공급 상품인 경우) − 플랫폼 수수료 − 셀러 부담 장바구니 할인 − 부분취소 환불액이에요. 수수료율은 셀러별로 다를 수 있어 정산 화면에서 확인해 주세요. 취소가 진행 중인 주문은 정산 가능 금액에 포함되지 않아요.', keywords: '정산 계산 수수료 공급가 부분취소 세전', source: 'lib/settlement.ts SettlementOrder' },
  { category: '취소', question: '계좌입금 주문서는 어떻게 취소하나요?', answer: '계좌입금 주문서는 실제 결제 연동이 없어서, 셀러가 구매자에게 직접 환불 송금한 뒤 주문서를 "취소"로 기록하면 끝이에요. 관리자 승인은 필요 없어요. 입금 전 주문도 취소할 수 있어요.', keywords: '계좌 입금 취소 환불 주문서', source: 'lib/socialOrderCancel.ts' },
  { category: '취소', question: '카드결제 주문서는 어떻게 취소하나요?', answer: '카드결제 주문서는 셀러가 취소를 요청 → 관리자가 승인 → PG(결제사) 취소가 성공하면 취소 완료돼요. 결제가 완료된 건만 요청할 수 있어요. 일부 상품만 취소하는 부분취소도 요청할 수 있어요.', keywords: '카드 취소 요청 승인 부분취소 PG', source: 'lib/socialOrderCancel.ts' },
  { category: '상품', question: '간편 상품이 두 종류인가요?', answer: '네. ① 간편 상품(마이샵 진열용): 상품 관리 > 간편 상품 탭에서 사진·설명과 함께 등록, 관리자 승인 없이 셀러샵 "일반상품" 탭에 보이고 1개씩 바로 결제돼요. ② 간편 상품(주문서 선택용): 주문 관리 > 주문서 설정에서 등록, 주문서의 상품 고르기와 평생번호 구매링크("3번")에 쓰여요.', keywords: '간편상품 종류 마이샵 진열 주문서 선택 일반상품', source: 'components/seller/ProductTypeGuide.tsx' },
  { category: '상품', question: '라이브 방송에 어떤 상품을 연결할 수 있나요?', answer: '라이브 방송에는 "내 상품"(상품 관리 맨 위 [내 상품 등록])과 "신청 상품"(브랜드 공급, 승인 후)만 연결할 수 있어요. 간편 상품은 방송에 직접 연결되지 않지만, 주문서 선택용 간편 상품은 평생번호("3번")로 방송 중에 판매할 수 있어요.', keywords: '방송 상품 연결 라이브 내상품 신청상품', source: 'app/(dashboard)/seller/live/page.tsx' },
  { category: '상품', question: '구매링크 번호(평생번호)는 바뀌지 않나요?', answer: '주문서 선택용 간편 상품은 등록 순서대로 1, 2, 3… 번호가 붙고, 상품을 삭제해도 남은 번호는 바뀌지 않아요. 방송에서 "3번"이라고 말한 뒤 번호가 밀리면 다른 상품이 나가기 때문이에요.', keywords: '구매링크 번호 평생번호 3번 linkNo', source: 'prisma/schema.prisma SellerQuickProduct.linkNo' },
  { category: '상품', question: '재고는 어떻게 관리되나요?', answer: '간편 상품은 "재고 관리"를 켠 상품만 재고 수량을 봐요. 꺼 두면 수량 제한 없이 팔려요. 재고가 다 떨어지면 구매자는 "대기 주문"을 신청할 수 있고, 취소 등으로 재고가 다시 생기면 대기자에게 알림이 가요.', keywords: '재고 품절 대기 주문 알림', source: 'schema SellerQuickProduct.useStock, lib/quickProductWaiting.ts' },
  { category: '상품', question: '1인 최대 구매 수량은요?', answer: '주문서 선택용 간편 상품은 방송 판매 특성상 1인 최대 1개가 기본이에요. 소모품처럼 여러 개가 필요한 상품은 셀러가 최대 수량을 올릴 수 있어요. 재고를 켠 상품은 재고 이내로 한 번 더 제한돼요.', keywords: '최대 수량 1개 구매 제한', source: 'schema SellerQuickProduct.maxQty' },
  { category: '배송', question: '간편 상품 배송비는 어떻게 계산되나요?', answer: '한 주문서 안에서 "함께 보냄" 상품끼리는 가장 비싼 배송비 한 번만 받아요. 냉장·대형·산지직송처럼 "따로 보냄"으로 설정한 상품은 각자 배송비를 받고 조건부 무료배송에서도 빠져요. 조건부 무료배송 기준액을 설정하면 상품 금액 합계가 기준 이상일 때 함께 보냄 배송비를 받지 않아요.', keywords: '배송비 묶음 따로 보냄 무료배송 조건부', source: 'lib/quickProductShipping.ts, schema freeShippingThreshold' },
  { category: '주문', question: '평생번호 문자 주문은 어떻게 동작하나요?', answer: '구매자가 셀러의 MO 평생번호로 문자를 보내면, 문자에 상품 번호("3번")가 있으면 그 상품이 담긴 주문서 링크가 자동 회신돼요. 번호가 없으면 감사 문자가 가요(같은 번호는 하루 1회). 방송 중이면 문자가 방송 채팅에도 표시되고, 금칙어는 걸러져요.', keywords: '문자 주문 평생번호 MO 3번 회신 주문서 링크', source: 'lib/moInbound.ts' },
  { category: '주문', question: '셀러샵 판매 방식은 무엇이 있나요?', answer: '① 주문서로 받기: 셀러샵 첫 화면이 주문서, 상품 탭·장바구니 숨김 ② 상품 진열해서 팔기: 주문서 버튼 숨김(평생번호 구매링크 주문서는 그대로 받음) ③ 둘 다. 고르지 않았으면 "둘 다"로 동작해요.', keywords: '셀러샵 판매 방식 주문서 상품 진열', source: 'lib/shopSalesMode.ts' },
  { category: '결제', question: '구매자 결제수단은 어떻게 정하나요?', answer: '셀러 설정에서 켠 결제수단만 구매자 결제창에 나와요. 한 번도 설정하지 않았다면 기본값(카드 + 간편계좌)이에요. 카드 주문서는 상품에서 "결제창 연동"을 켜면 즉시 결제 버튼이 붙어요.', keywords: '결제수단 카드 간편계좌 결제창', source: 'lib/payMethods.ts, schema payEnabled' },
  { category: '알림톡', question: '알림톡 크레딧은 언제 차감되나요?', answer: '셀러 크레딧으로 나가는 알림톡(예: 구매자 결제 완료 시 셀러에게 가는 주문 접수 알림, 송장 입력 시 구매자 배송 시작 알림 등)이 발송될 때 차감돼요. 발송에 실패한 건은 차감되지 않아요. 주문 접수 알림·배송 시작 알림은 설정에서 켜고 끌 수 있어요.', keywords: '알림톡 크레딧 차감 충전 주문접수 배송시작', source: 'seller/alimtalk 화면 문구, schema orderPlacedAlimtalkEnabled·shippingAlimtalkEnabled' },
  { category: '챗봇', question: '카카오 챗봇에 계정은 어떻게 연결하나요?', answer: '셀러 관리자 화면 > "카카오 챗봇 연결"에서 6자리 코드를 받은 뒤(5분 유효), 셀러 비서 채팅방에 "연결 123456"처럼 보내면 돼요. 해제는 "연결 해제", 확인은 "연결 상태"예요.', keywords: '챗봇 연결 코드 6자리 해제', source: 'sellerbricks-bot' },
  { category: '챗봇', question: '챗봇으로 상품을 등록할 수 있나요?', answer: '사진과 함께 "간편 상품 등록해줘, 32,000원 20개"처럼 보내면 상품명·설명 초안을 만들어 확인 카드를 보여줘요. [마이샵에 등록]을 누르면 간편 상품(마이샵 진열용)으로, [방송 번호로도 등록]을 누르면 주문서용 평생번호 상품도 함께 만들어져 방송에서 번호로 바로 팔 수 있어요.', keywords: '챗봇 상품 등록 사진 간편상품 방송 번호', source: 'sellerbricks-bot' },
  { category: '챗봇', question: '챗봇이 만든 결과 링크가 안 열려요', answer: '개인정보 보호를 위해 결과 페이지·엑셀 링크는 30분 동안만 열려요. 챗봇에 같은 요청을 다시 보내면 새 링크를 받을 수 있어요. 이름은 일부 가리고 전화번호는 뒷자리만 보여요. 송장 출력용 전체 목록은 셀러 관리자 화면에서 받아 주세요.', keywords: '결과 링크 만료 30분 엑셀 개인정보', source: 'sellerbricks-bot' },
];

export async function seedFaqIfEmpty(): Promise<number> {
  if ((await prisma.faqDoc.count()) > 0) return 0;
  await prisma.faqDoc.createMany({ data: FAQ_SEED });
  return FAQ_SEED.length;
}
