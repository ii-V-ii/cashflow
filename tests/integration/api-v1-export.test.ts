import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { GET as exportTransactions } from "@/app/api/v1/export/transactions/route"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateTransactionCore(sql)
})

function csvRequest(query = ""): Request {
  return new Request(`http://localhost/api/v1/export/transactions${query}`)
}

const HEADER = "날짜,유형,카테고리,계좌,도착계좌,금액,내용,메모,태그,할부"

/** 시드: 은행/적금 계좌 + 식비 카테고리 + 수입·지출(태그/할부)·이체 3건 */
async function seedTransactions(): Promise<void> {
  const [bank] = await sql`
    INSERT INTO accounts (name, type, initial_balance, sort_order)
    VALUES ('내은행', 'bank', 0, 0) RETURNING id
  `
  const [savings] = await sql`
    INSERT INTO accounts (name, type, initial_balance, sort_order)
    VALUES ('내적금', 'savings', 0, 1) RETURNING id
  `
  const [food] = await sql`
    INSERT INTO categories (name, type, expense_kind, sort_order)
    VALUES ('식비', 'expense', 'consumption', 0) RETURNING id
  `
  const [expense] = await sql`
    INSERT INTO transactions
      (type, amount, description, date, account_id, category_id, memo,
       installment_months, installment_current)
    VALUES ('expense', 12000, '김밥, 라면', '2026-07-02', ${bank.id as string},
            ${food.id as string}, '점심 "특식"', 3, 1)
    RETURNING id
  `
  await sql`
    INSERT INTO transactions (type, amount, description, date, account_id)
    VALUES ('income', 3000000, '급여', '2026-07-01', ${bank.id as string})
  `
  await sql`
    INSERT INTO transactions (type, amount, description, date, account_id, to_account_id)
    VALUES ('transfer', 500000, '적금 이체', '2026-06-25',
            ${bank.id as string}, ${savings.id as string})
  `
  const [tag] = await sql`
    INSERT INTO tags (name) VALUES ('외식') RETURNING id
  `
  await sql`
    INSERT INTO transaction_tags (transaction_id, tag_id)
    VALUES (${expense.id as string}, ${tag.id as string})
  `
}

describe("GET /api/v1/export/transactions", () => {
  test("CSV raw body — BOM + 헤더 + 날짜 오름차순 (API.md §15.1)", async () => {
    await seedTransactions()

    const response = await exportTransactions(csvRequest())
    const bytes = new Uint8Array(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    // UTF-8 BOM(EF BB BF) — text() 디코딩은 BOM을 제거하므로 바이트로 검증
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])

    const text = new TextDecoder().decode(bytes) // BOM 제거된 본문
    const lines = text.trimEnd().split("\n")
    expect(lines[0]).toBe(HEADER)
    expect(lines).toHaveLength(4)
    // 날짜 오름차순: 이체(6/25) → 급여(7/1) → 지출(7/2)
    expect(lines[1]).toBe("2026-06-25,이체,,내은행,내적금,500000,적금 이체,,,")
    expect(lines[2]).toBe("2026-07-01,수입,,내은행,,3000000,급여,,,")
    // 쉼표·따옴표 필드는 RFC 4180 이스케이프, 할부 1/3, 태그 포함
    expect(lines[3]).toBe(
      '2026-07-02,지출,식비,내은행,,12000,"김밥, 라면","점심 ""특식""",외식,1/3',
    )
  })

  test("Content-Disposition 파일명에 기간 반영", async () => {
    const response = await exportTransactions(
      csvRequest("?from=2026-07-01&to=2026-07-31"),
    )
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="transactions_2026-07-01_2026-07-31.csv"',
    )

    const noFilter = await exportTransactions(csvRequest())
    expect(noFilter.headers.get("content-disposition")).toBe(
      'attachment; filename="transactions_all.csv"',
    )
  })

  test("from/to 필터 반영", async () => {
    await seedTransactions()

    const response = await exportTransactions(
      csvRequest("?from=2026-07-01&to=2026-07-01"),
    )
    // text()는 BOM을 자동 제거한다
    const lines = (await response.text()).trimEnd().split("\n")

    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain("급여")
  })

  test("할부 회차 누락(installment_current null) → 1회차로 표기", async () => {
    const [bank] = await sql`
      INSERT INTO accounts (name, type, initial_balance, sort_order)
      VALUES ('할부은행', 'bank', 0, 0) RETURNING id
    `
    await sql`
      INSERT INTO transactions (type, amount, description, date, account_id, installment_months)
      VALUES ('expense', 60000, '할부만', '2026-07-03', ${bank.id as string}, 6)
    `

    const response = await exportTransactions(csvRequest())
    const lines = (await response.text()).trimEnd().split("\n")

    expect(lines[1].endsWith(",1/6")).toBe(true)
  })

  test("거래 없음 → 헤더만", async () => {
    const response = await exportTransactions(csvRequest())
    const text = (await response.text()).trimEnd()
    expect(text).toBe(HEADER)
  })

  test("잘못된 날짜 형식 → 400", async () => {
    const response = await exportTransactions(csvRequest("?from=07-01-2026"))
    expect(response.status).toBe(400)
  })

  test("미인증 → 401 (envelope 에러)", async () => {
    getAuthUserMock.mockResolvedValue(null as never)
    const response = await exportTransactions(csvRequest())
    const body = await response.json()
    expect(response.status).toBe(401)
    expect(body.error.code).toBe("UNAUTHORIZED")
  })
})
