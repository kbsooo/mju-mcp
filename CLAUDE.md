# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # 의존성 설치
npm run check        # TypeScript 타입 검사 (noEmit)
npm run build        # dist/ 빌드
npm run dev          # tsx로 직접 실행 (빌드 없이)
npm run start        # dist/index.js 실행
```

인증 CLI:

```bash
npm run auth:status
npm run auth:login -- --id YOUR_ID --password YOUR_PASSWORD
npm run auth:logout
npm run auth:forget
npm run login:sso -- --id YOUR_ID --password YOUR_PASSWORD   # SSO 흐름 단독 점검
```

새 기능 추가 후 체크: `npm run check && npm run build`

## Architecture

Node.js 22+, TypeScript (ESM, NodeNext), `@modelcontextprotocol/sdk` 기반 stdio MCP 서버.

### 계층 구조

```
src/index.ts
  └── src/mcp/server.ts         # McpServer 생성, stdio transport, AppContext 주입
        └── src/tools/index.ts  # 모든 tool 등록
              └── src/tools/*.ts  # tool별 스키마·응답 포맷·강의 식별·승인 흐름
                    ├── src/lms/*       # LMS HTTP client, 파서, 세션 저장
                    ├── src/msi/*       # MSI 로그인 체인, 파서
                    └── src/ucheck/*    # UCheck SSO client, 파서
```

`src/mcp/app-context.ts`가 런타임 공유 상태를 담당한다.
- 각 서비스 client factory (`createLmsClient`, `createMsiClient`, `createUcheckClient`)
- 세션별 마지막 강의 컨텍스트 (`lastCourse`)
- 쓰기 승인 토큰 발급·검증·만료 (5분 TTL)

### 서비스별 패턴

| 서비스 | 특징 |
|--------|------|
| LMS | SSO → HTML 파싱, 폼 POST. 강의 식별에 `course-resolver.ts` 재사용 |
| MSI | LMS보다 긴 로그인 브리지 체인. 메뉴별 파서 분리 |
| UCheck | SPA — URL 흐름보다 내부 JSON API 재현이 중심 |

### 강의 식별 (`src/tools/course-resolver.ts`)

LMS tool 전반이 공유하는 입력 UX.
- `course` (이름 검색) 또는 `kjkey` (직접 지정) 허용
- 지정 없으면 세션 컨텍스트의 마지막 강의 기본값

### 쓰기 승인 흐름

LMS 제출·수정·삭제는 2단계를 거친다.
1. `confirm=true`로 호출 → 서버가 fingerprint 생성 후 `approvalToken` 반환
2. 같은 세션에서 `approvalToken` 포함 재호출 → fingerprint 일치 시 실행

### 새 서비스 추가 순서

`src/<service>/config.ts` → `constants.ts` → `client.ts` → `types.ts` → `services.ts`
→ `src/tools/<service>.ts` → `app-context.ts` 연결 → `src/tools/index.ts` 등록

### 데이터 저장 위치 (기본)

- `%LOCALAPPDATA%\mju-mcp\state\` — 세션 파일 (`lms-session.json` 등), `profile.json`
- `%LOCALAPPDATA%\mju-mcp\snapshots\` / `downloads\`

## 커밋 컨벤션

한국어 메시지, `feat:` / `fix:` / `docs:` / `refactor:` prefix 사용.

## 주의 사항

- HTML 파싱 의존 기능은 화면 변경에 취약 → 실데이터 검증 필수
- 쓰기 tool은 반드시 승인 흐름 유지
- 세션 파일, 스냅샷 HTML, 실계정 비밀번호는 커밋/문서에 포함 금지
