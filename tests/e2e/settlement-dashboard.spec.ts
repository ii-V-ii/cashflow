import { expect, test } from "@playwright/test"
import postgres from "postgres"

import { LOCAL_SUPABASE } from "../../playwright.config"
import { login, resetSeedData } from "./helpers"

/**
 * Phase 2B E2E — 시드 → 대시보드/결산/보고서 수치 검증.
 * 도메인 규칙: 저축 포함, applied만(캘린더·결산), 전월 비교.
 * 날짜는 현재 월 기준으로 동적 생성(대시보드·보고서 기본값이 현재 연·월).
 */

function ym(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

const now = new Date()
const thisYm = ym(now)
const prevYm = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1))

/** 시드 계좌·카테고리 위에 결산 검증용 거래를 심는다 (멱등 — resetSeedData 후 실행) */
async function seedSettlementData(): Promise<void> {
  const sql = postgres(LOCAL_SUPABASE.databaseUrl, { prepare: false, max: 1 })
  try {
    await sql`
      INSERT INTO public.transactions
        (type, amount, description, status, category_id, account_id, to_account_id, date)
      SELECT v.type, v.amount, v.description, v.status,
             (SELECT id FROM public.categories WHERE name = v.category),
             (SELECT id FROM public.accounts WHERE name = 'E2E은행'),
             CASE WHEN v.to_savings
                  THEN (SELECT id FROM public.accounts WHERE name = 'E2E적금')
                  ELSE NULL END,
             v.date::date
      FROM (VALUES
        -- 전월: 수입 300,000 / 지출 50,000
        ('income',  300000::bigint, '전월급여', 'applied', '급여', false, ${`${prevYm}-05`}),
        ('expense',  50000::bigint, '전월식비', 'applied', '식비', false, ${`${prevYm}-10`}),
        -- 당월: 수입 500,000 / 식비 50,000 / 저축 100,000 / pending 999,999(집계 제외)
        ('income',  500000::bigint, '급여',    'applied', '급여', false, ${`${thisYm}-01`}),
        ('expense',  30000::bigint, '장보기',  'applied', '식비', false, ${`${thisYm}-03`}),
        ('expense',  20000::bigint, '외식',    'applied', '식비', false, ${`${thisYm}-05`}),
        ('expense', 100000::bigint, '적금이체', 'applied', '저축', true,  ${`${thisYm}-10`}),
        ('expense', 999999::bigint, '예정지출', 'pending', '식비', false, ${`${thisYm}-15`})
      ) AS v(type, amount, description, status, category, to_savings, date)
    `
  } finally {
    await sql.end()
  }
}

test.describe("Phase 2B 결산·대시보드·보고서", () => {
  test.beforeEach(async ({ page }) => {
    await resetSeedData()
    await seedSettlementData()
    await login(page)
  })

  test("대시보드 — 요약 카드·캘린더·빈 상태 위젯·최근 거래", async ({ page }) => {
    await page.goto("/")

    // 이번 달 지출(hero): 저축 포함 150,000 / pending 제외
    await expect(page.getByTestId("dashboard-expense")).toHaveText("150,000원")
    await expect(page.getByTestId("dashboard-income")).toHaveText("500,000원")
    // 총잔액: 은행 700,000 + 적금 100,000 (applied만)
    await expect(page.getByTestId("dashboard-total-balance")).toContainText("800,000원")

    // 캘린더 위젯 — applied 거래 합계 표시
    await expect(page.getByTestId("dashboard-calendar")).toBeVisible()

    // 예산·자산이 없으면 위젯은 빈 상태 (Phase 2 통합 — placeholder 대체)
    await expect(page.getByText("이번 달 예산이 없습니다")).toBeVisible()
    await expect(page.getByText("등록된 자산이 없습니다")).toBeVisible()

    // 최근 거래 목록
    await expect(page.getByRole("region", { name: "최근 거래" })).toContainText("급여")
  })

  test("대시보드 — 예산 소진율 위젯은 계획 대비 실지출을 보여준다", async ({ page }) => {
    // 당월 예산: 식비 300,000 계획 → 실지출 150,000 = 50%
    const [year, month] = thisYm.split("-").map(Number)
    const sql = postgres(LOCAL_SUPABASE.databaseUrl, { prepare: false, max: 1 })
    try {
      await sql`
        WITH b AS (
          INSERT INTO public.budgets (name, year, month)
          VALUES (${`${thisYm} 예산`}, ${year}, ${month}) RETURNING id
        )
        INSERT INTO public.budget_items (budget_id, category_id, planned_amount)
        SELECT b.id, (SELECT id FROM public.categories WHERE name = '식비'), 300000
        FROM b
      `
    } finally {
      await sql.end()
    }

    await page.goto("/")

    const budgetWidget = page.getByRole("progressbar", { name: "예산 소진율" })
    await expect(budgetWidget).toBeVisible()
    await expect(page.getByText("50%")).toBeVisible()
    await expect(page.getByText("150,000원 / 300,000원")).toBeVisible()
  })

  test("월 결산 — 순수익·저축·전월 대비·계좌 변동", async ({ page }) => {
    await page.goto("/settlements")

    await expect(page.getByTestId("settlement-net")).toHaveText("350,000원")
    await expect(page.getByTestId("settlement-income")).toHaveText("500,000원")
    await expect(page.getByTestId("settlement-expense")).toHaveText("150,000원")
    await expect(page.getByTestId("settlement-saving")).toHaveText("100,000원")

    // 전월 대비: 350,000 - 250,000 = +100,000
    await expect(page.getByTestId("settlement-mom-net")).toContainText("+100,000원")

    // 지출 구성: 식비 롤업 50,000 + 저축 100,000
    const expenseSection = page.getByRole("region", { name: "지출 구성" })
    await expect(expenseSection).toContainText("식비")
    await expect(expenseSection).toContainText("50,000원")

    // 계좌별 변동: 적금 +100,000
    const accountsSection = page.getByRole("region", { name: "계좌별 변동" })
    await expect(accountsSection).toContainText("E2E적금")
    await expect(accountsSection).toContainText("+100,000원")
  })

  test("연간 결산 탭 — 연 합계와 월별 추이", async ({ page }) => {
    await page.goto("/settlements")
    await page.getByRole("tab", { name: "연간" }).click()

    // 연간 순수익: 당해 연도에 속한 시드 거래 합계.
    // 전월이 작년(1월 실행)이면 당월 것만 반영되므로 두 경우 모두 허용한다.
    const sameYear = prevYm.slice(0, 4) === thisYm.slice(0, 4)
    await expect(page.getByTestId("annual-net")).toHaveText(
      sameYear ? "600,000원" : "350,000원",
    )
    await expect(page.getByTestId("current-year")).toContainText(thisYm.slice(0, 4))
  })

  test("보고서 — 추이·카테고리 도넛·순자산 차트 렌더", async ({ page }) => {
    await page.goto("/reports")

    // 추이 차트 (핵심 수치 병기: 이번 달 순수익 350,000)
    await expect(page.getByTestId("trend-chart")).toBeVisible()
    await expect(
      page.getByRole("region", { name: "수입/지출 추이" }),
    ).toContainText("350,000원")

    // 카테고리 도넛: 합계 150,000 + 범례에 식비/저축
    const categorySection = page.getByRole("region", { name: "카테고리별 지출" })
    await expect(page.getByTestId("category-donut")).toBeVisible()
    await expect(categorySection).toContainText("150,000원")
    await expect(categorySection).toContainText("저축")

    // 순자산 차트: 현재 800,000 (계좌 잔액 기준)
    const netWorthSection = page.getByRole("region", { name: "순자산 추이" })
    await expect(page.getByTestId("net-worth-chart")).toBeVisible()
    await expect(netWorthSection).toContainText("800,000원")
  })
})
