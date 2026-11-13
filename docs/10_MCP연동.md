# 외부 AI 연동 — MCP 서버 (2026-11-13)

> 셀러가 자기 Claude·ChatGPT 등 외부 AI 앱에서 셀러브릭스·스토리지 마켓 도구를 쓰게 하는 기능. 웹챗·카카오와 **같은 도구**(`src/tools/`)를 그대로 내보낸다.

## 1. 지금 된 것
| 항목 | 내용 |
|---|---|
| 주소 | `POST {PUBLIC_BASE_URL}/mcp` — MCP Streamable HTTP, JSON 응답 (스트리밍·서버 알림 없음) |
| 프로토콜 | `2025-06-18` (2025-03-26, 2024-11-05 요청도 받음) |
| 메서드 | initialize · notifications/initialized · ping · tools/list · tools/call |
| 인증 | `Authorization: Bearer sbmcp_…` — 관리자 화면 → 외부 AI(MCP)에서 **셀러별 발급**, 한 번만 보여 줌, DB 에는 sha256 만 |
| 도구 | 그 셀러가 연결한 플랫폼 도구만 (셀러브릭스 19개 + 스토리지 마켓 4개). 셀러 id 는 인자로 받지 않고 토큰으로 결정 |
| 표시 | 도구마다 `annotations.readOnlyHint` (지금은 `set_preference` 만 변경 가능) |
| 보안 | 전체 켜기/끄기, 토큰 폐기, 셀러 차단 시 토큰 자동 폐기, 1분 60회, 브라우저 요청(Origin 헤더) 거부, 결과의 개인정보는 이미 가려진 값 |
| 기록 | 호출마다 대화 로그(채널 MCP)와 도구 로그 저장 → 운영 대시보드 집계 |

## 2. 연결 예시
### Claude 데스크톱 (mcp-remote 사용)
`claude_desktop_config.json`
```json
{
  "mcpServers": {
    "sellerbricks": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://bot.sellerbricks.co.kr/mcp", "--header", "Authorization:Bearer ${SB_TOKEN}"],
      "env": { "SB_TOKEN": "sbmcp_…" }
    }
  }
}
```
### 개발자 API (Anthropic Messages API 의 MCP 커넥터 등)
서버 주소 `https://bot.도메인/mcp` + `authorization_token` 에 토큰.

### 직접 시험 (curl)
```bash
curl -s https://bot.도메인/mcp -H "authorization: Bearer sbmcp_…" -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 3. 다음 단계 — OAuth (카카오 PlayMCP · ChatGPT · claude.ai 커넥터 등록용)
이 플랫폼들은 사용자가 직접 로그인하는 **OAuth 2.1** 을 요구한다. 설계:
1. 봇이 OAuth 인가 서버 역할: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`
2. `/oauth/authorize` 화면 = 웹챗 로그인과 같은 **6자리 코드 입력** → 동의 → 인가 코드 (PKCE 필수)
3. `/oauth/token` → 액세스 토큰(1시간) + 갱신 토큰, 내부적으로 지금의 McpToken 과 같은 방식으로 셀러에 묶음
4. 동적 클라이언트 등록(`/oauth/register`) — PlayMCP·claude.ai 가 사용
5. 401 응답의 `WWW-Authenticate` 에 resource metadata 주소 표시
PlayMCP 등록 시점에 착수 (사용자 지시 후, 설계 보고 먼저).

## 4. 지킬 규칙 (MCP 재사용 원칙)
- 도구는 채널을 모른다: 데이터 + 요약만 돌려주고, 카드·표 모양은 각 채널이 만든다
- 도구가 셀러 id 를 인자로 받지 않는다 (연결 토큰으로 플랫폼이 범위를 강제)
- 데이터를 바꾸는 도구는 `WRITE_TOOLS` 에 넣어 `readOnlyHint=false` 로 표시, 실행 전 확인 절차를 둔다
