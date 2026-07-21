/**
 * 거래 화면 페이지네이션 크기.
 * 서버 프리페치(src/server/prefetch-entries.ts)와 클라이언트 api(src/features/transactions/api.ts)가
 * 공용으로 import한다 — api.ts를 서버 컴포넌트에서 통째로 import하는 결합을 피하기 위해
 * 이 값만 별도 파일로 분리했다.
 */
export const TRANSACTIONS_PAGE_SIZE = 20
