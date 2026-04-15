@AGENTS.md

# Cashflow - 금전출납부

개인용 금전출납부 애플리케이션. 수입/지출 관리, 예산, 결산, 자산 관리, 투자 수익률, 미래 예측 기능을 제공한다.

## 플랫폼 전략

- **1단계 (현재)**: 웹 앱 (Next.js) - PWA 지원으로 모바일 브라우저에서도 사용 가능
- **2단계 (향후)**: Android 네이티브 앱 (동일 API 백엔드 공유)

### PWA/모바일 대응 원칙

- 반응형 디자인 필수 (모바일 퍼스트)
- 터치 친화적 UI (최소 터치 타겟 44px)
- 오프라인 기본 동작 고려
- API는 REST로 설계하여 향후 모바일 앱에서 재사용 가능하도록 분리

## 기술 스택

- **프레임워크**: Next.js 16 (App Router) + TypeScript
- **UI**: shadcn/ui + Tailwind CSS 4
- **차트**: Recharts
- **상태 관리**: TanStack Query (서버), Zustand (클라이언트)
- **폼**: React Hook Form + Zod
- **ORM**: Drizzle ORM + SQLite (better-sqlite3)
- **테스트**: Vitest + Testing Library
- **패키지 매니저**: pnpm

## 프로젝트 구조

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # 대시보드 레이아웃 그룹
│   └── api/                # API Routes (향후 모바일 앱과 공유)
├── components/
│   ├── ui/                 # shadcn/ui 컴포넌트
│   └── ...                 # 기능별 컴포넌트
├── db/
│   ├── schema.ts           # Drizzle 스키마
│   ├── repositories/       # Repository 계층
│   └── migrations/         # DB 마이그레이션
├── lib/
│   ├── validators/         # Zod 스키마
│   ├── services/           # 비즈니스 로직 (프레임워크 독립)
│   ├── calculations/       # 재무 계산
│   └── forecast/           # 예측 알고리즘
├── hooks/                  # 커스텀 훅
├── stores/                 # Zustand 스토어
└── types/                  # 공유 타입
tests/
├── unit/
├── integration/
└── e2e/
```

## 개발 규칙

### TDD 필수 (최우선 규칙)

**코드를 먼저 작성하지 않는다. 반드시 테스트를 먼저 작성한다.**

모든 새 기능, 버그 수정, 리팩터링에 TDD를 적용한다. 예외 없음.

1. **RED**: 실패하는 테스트를 먼저 작성
2. **GREEN**: 테스트를 통과하는 최소 구현
3. **REFACTOR**: 테스트 통과 상태에서 코드 개선
4. 커버리지 80% 이상 유지 — `pnpm test` 실행으로 확인
5. 구현 완료 후 반드시 `pnpm test`로 전체 테스트 통과 확인

**위반 시**: 코드 리뷰에서 테스트 없는 변경은 반려한다.

스킬: `/tdd` 또는 `/ecc:tdd` 사용

### 코드 리뷰

코드 작성/수정 후 반드시 코드 리뷰를 수행한다. 상황에 맞는 에이전트를 자동 선택한다.

### 아키텍처 패턴

- **Repository 패턴**: 데이터 접근은 `src/db/repositories/`를 통해서만
- **Service 계층**: 비즈니스 로직은 `src/lib/services/`에 분리, 프레임워크 독립적으로 작성
- **API 응답 형식**: `{ success: true, data: T }` 또는 `{ success: false, error: { code, message } }`
- **불변성**: 객체를 직접 수정하지 않고 새 객체를 생성

### 통화 처리

- KRW는 정수로 처리 (소수점 없음)
- 금액 표시: `Intl.NumberFormat('ko-KR')` 사용

## 명령어

```bash
pnpm dev              # 개발 서버
pnpm build            # 프로덕션 빌드
pnpm test             # 테스트 실행
pnpm test:watch       # 테스트 워치 모드
pnpm test:coverage    # 커버리지 리포트
pnpm db:generate      # 마이그레이션 생성
pnpm db:migrate       # 마이그레이션 실행
pnpm db:studio        # Drizzle Studio
pnpm db:seed          # 시드 데이터
```

## 에이전트 활용 가이드

상황에 따라 적합한 에이전트를 자동으로 선택하여 사용한다.

### 개발 워크플로우

| 상황 | 에이전트/스킬 |
|------|--------------|
| 기능 구현 | `/tdd` (TDD 워크플로우) |
| 구현 계획 | `planner` 에이전트 |
| 아키텍처 설계 | `architect` 에이전트 |
| 코드 구조 분석 | `code-architect`, `code-explorer` 에이전트 |

### 코드 품질

| 상황 | 에이전트/스킬 |
|------|--------------|
| TypeScript 리뷰 | `typescript-reviewer` 에이전트 |
| 일반 코드 리뷰 | `code-reviewer` 에이전트 |
| 코드 정리 | `code-simplifier`, `refactor-cleaner` 에이전트 |
| 타입 설계 분석 | `type-design-analyzer` 에이전트 |
| 에러 무시 감지 | `silent-failure-hunter` 에이전트 |

### 보안/성능

| 상황 | 에이전트/스킬 |
|------|--------------|
| 보안 검토 | `security-reviewer` 에이전트 |
| 성능 최적화 | `performance-optimizer` 에이전트 |
| DB 리뷰 | `database-reviewer` 에이전트 |

### 빌드/테스트

| 상황 | 에이전트/스킬 |
|------|--------------|
| 빌드 에러 | `build-error-resolver` 에이전트 |
| E2E 테스트 | `e2e-runner` 에이전트 |
| 테스트 커버리지 분석 | `pr-test-analyzer` 에이전트 |

### 문서/기타

| 상황 | 에이전트/스킬 |
|------|--------------|
| 라이브러리 문서 | `docs-lookup` 에이전트, `/docs` 스킬 |
| 문서 업데이트 | `doc-updater` 에이전트 |
| SEO | `seo-specialist` 에이전트 |
| 검증 루프 | `/verify` 스킬 |
| 커밋 | `git-committer` 에이전트 |
