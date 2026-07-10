# Cashflow v2 — 금전출납부

개인용 금전출납부 (Next.js 16 + Supabase Postgres). `rebuild/v2` 브랜치에서 전면 재구축 중이다.

- 아키텍처 스펙: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- DB 스키마·RPC 단일 진실: [docs/DB.md](docs/DB.md)
- REST API: [docs/API.md](docs/API.md)

## 기존(v1) 코드 참조

v1 앱(SQLite + Drizzle 기반)은 `main` 브랜치에 그대로 있다. 재구축 중 기존 구현을 참조하려면:

```bash
git show main:package.json
git show main:src/lib/services/transaction-service.ts
git ls-tree -r main --name-only src/
```

## 시작하기

```bash
pnpm install
cp .env.example .env.local   # 값 채우기

# 로컬 Supabase (Docker 필요)
pnpm supabase start          # 로컬 스택 기동
pnpm supabase db reset       # supabase/migrations 전체 적용

pnpm dev                     # http://localhost:3000
```

## 명령어

```bash
pnpm dev              # 개발 서버
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest (unit + integration + cross)
pnpm test:coverage    # 커버리지 (80% 게이트)
pnpm test:e2e         # Playwright E2E
pnpm supabase <cmd>   # Supabase CLI
```

## 구조 (요약)

```text
src/
├── app/(app)/            # 페이지 라우트
├── app/api/v1/           # REST v1 — 유일한 변경 진입점
├── server/               # 서버 전용 (db client, callRpc, api-response)
├── features/<기능>/       # components/ hooks/ api.ts 수직 분할
├── lib/                  # query-keys, validators, calculations, forecast
└── types/                # 공유 타입
supabase/migrations/      # 스키마·뷰·RPC의 단일 진실 (SQL-first)
tests/                    # unit / integration / cross / e2e
```

상세 규칙은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §3(디렉터리)·§6(캐시)·§10(테스트)·§11(CI) 참조.
