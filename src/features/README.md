# features/

기능별 수직 분할 (ARCHITECTURE.md §3). 각 기능은 동일한 구조를 갖는다:

```text
features/<기능>/
├── components/   # 프레젠테이션 컴포넌트
├── hooks/        # useQuery/useMutation 훅 (쿼리 키는 @/lib/query-keys의 qk만 사용)
└── api.ts        # typed fetch 클라이언트 (/api/v1/** 호출)
```

## 의존 방향 규칙

- `features → lib`, `features → (fetch) api/v1` 만 허용
- feature 간 수평 import 금지
- `src/server/**` 직접 import 금지 (서버 전용 — `server-only`로 빌드 타임 차단)

## 기능 목록

transactions / accounts / budgets / settlements / dashboard /
assets / investments / recurring / forecast / reports / categories
