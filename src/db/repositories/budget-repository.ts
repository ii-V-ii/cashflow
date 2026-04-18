import { eq, and, sql, isNull, gte, lt, inArray } from 'drizzle-orm'
import { getDb } from '../index'
import { budgets, budgetItems, transactions, categories } from '../schema'
import { generateId, monthDateRange } from '../../lib/utils'
import type { CreateBudgetInput, UpdateBudgetInput, BudgetItemInput } from '../../lib/validators'
import type { BudgetItemWithActual } from '../../types'

// === Budgets CRUD ===

export async function findAllBudgets(year?: number) {
  const db = getDb()
  const query = db.select().from(budgets)

  if (year !== undefined) {
    return query.where(eq(budgets.year, year)).orderBy(budgets.year, budgets.month)
  }

  return query.orderBy(budgets.year, budgets.month)
}

export async function findBudgetByYearMonth(year: number, month: number | null) {
  const db = getDb()
  const condition = month === null
    ? and(eq(budgets.year, year), isNull(budgets.month))
    : and(eq(budgets.year, year), eq(budgets.month, month))

  const rows = await db.select().from(budgets).where(condition)
  return rows[0] ?? null
}

export async function findBudgetById(id: string) {
  const db = getDb()
  const rows = await db.select().from(budgets).where(eq(budgets.id, id))
  return rows[0] ?? null
}

// H-5: budgetItems 다중행 INSERT 헬퍼
function buildBudgetItemValues(budgetId: string, items: readonly BudgetItemInput[]) {
  return items.map((item) => ({
    id: generateId(),
    budgetId,
    categoryId: item.categoryId,
    plannedAmount: item.plannedAmount,
    memo: item.memo ?? null,
  }))
}

export async function createBudget(input: CreateBudgetInput) {
  const db = getDb()
  const id = generateId()

  await db.transaction(async (tx) => {
    await tx.insert(budgets)
      .values({
        id,
        name: input.name,
        year: input.year,
        month: input.month ?? null,
        totalIncome: input.totalIncome ?? 0,
        totalExpense: input.totalExpense ?? 0,
        memo: input.memo ?? null,
      })

    // H-5: 배치 INSERT
    const items = input.items ?? []
    if (items.length > 0) {
      await tx.insert(budgetItems).values(buildBudgetItemValues(id, items))
    }
  })

  return (await findBudgetById(id))!
}

export async function updateBudget(id: string, input: UpdateBudgetInput) {
  const db = getDb()
  const existing = await findBudgetById(id)
  if (!existing) return null

  await db.transaction(async (tx) => {
    await tx.update(budgets)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.totalIncome !== undefined && { totalIncome: input.totalIncome }),
        ...(input.totalExpense !== undefined && { totalExpense: input.totalExpense }),
        ...(input.memo !== undefined && { memo: input.memo }),
      })
      .where(eq(budgets.id, id))

    if (input.items !== undefined) {
      await tx.delete(budgetItems).where(eq(budgetItems.budgetId, id))

      // H-5: 배치 INSERT
      if (input.items.length > 0) {
        await tx.insert(budgetItems).values(buildBudgetItemValues(id, input.items))
      }
    }
  })

  return (await findBudgetById(id))!
}

export async function deleteBudget(id: string) {
  const db = getDb()
  const existing = await findBudgetById(id)
  if (!existing) return false

  await db.delete(budgets).where(eq(budgets.id, id))
  return true
}

// === Budget Items ===

export async function getBudgetItems(budgetId: string) {
  const db = getDb()
  return db
    .select()
    .from(budgetItems)
    .where(eq(budgetItems.budgetId, budgetId))
}

export async function setBudgetItems(budgetId: string, items: readonly BudgetItemInput[]) {
  const db = getDb()

  await db.transaction(async (tx) => {
    await tx.delete(budgetItems).where(eq(budgetItems.budgetId, budgetId))

    // H-5: 배치 INSERT
    if (items.length > 0) {
      await tx.insert(budgetItems).values(buildBudgetItemValues(budgetId, items))
    }
  })

  return getBudgetItems(budgetId)
}

// === 실적 대비 집계 ===

export async function getActualsByYearMonth(year: number, month: number) {
  const db = getDb()
  const { start, end } = monthDateRange(year, month)

  // 소분류 기준 + 대분류 롤업 모두 반환
  // 소분류 ID로 매칭하고, 대분류 ID로도 매칭할 수 있도록
  const rows = await db.execute(sql`
    SELECT category_id, type, SUM(amount)::integer AS total
    FROM (
      SELECT t.category_id, t.type, t.amount
      FROM transactions t
      WHERE t.date >= ${start} AND t.date < ${end}
        AND t.type IN ('income', 'expense')
        AND t.status = 'applied'
      UNION ALL
      SELECT COALESCE(c.parent_id, t.category_id) AS category_id, t.type, t.amount
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.date >= ${start} AND t.date < ${end}
        AND t.type IN ('income', 'expense')
        AND t.status = 'applied'
        AND c.parent_id IS NOT NULL
    ) sub
    GROUP BY category_id, type
  `)

  return rows as unknown as Array<{ category_id: string | null; type: string; total: number }>
}

export async function getBudgetItemsWithActuals(budgetId: string, year: number, month: number): Promise<BudgetItemWithActual[]> {
  const db = getDb()
  const [items, actuals] = await Promise.all([
    getBudgetItems(budgetId),
    getActualsByYearMonth(year, month),
  ])

  const actualMap = new Map<string, number>()
  for (const a of actuals) {
    if (a.category_id) {
      actualMap.set(a.category_id, a.total)
    }
  }

  const categoriesData = await db.select().from(categories)
  const categoryMap = new Map(categoriesData.map((c) => [c.id, c]))

  const now = new Date()
  const result: BudgetItemWithActual[] = items.map((item) => {
    const cat = categoryMap.get(item.categoryId)
    const actualAmount = actualMap.get(item.categoryId) ?? 0
    const difference = item.plannedAmount - actualAmount
    const achievementRate = item.plannedAmount > 0
      ? Math.round((actualAmount / item.plannedAmount) * 100)
      : 0

    return {
      ...item,
      categoryName: cat?.name ?? '삭제된 카테고리',
      categoryType: (cat?.type ?? 'expense') as 'income' | 'expense',
      categoryParentId: cat?.parentId ?? null,
      actualAmount,
      difference,
      achievementRate,
    } as BudgetItemWithActual
  })

  // 예산 없이 실적만 있는 카테고리도 가상 항목으로 추가
  const budgetedIds = new Set(items.map(i => i.categoryId))

  // 소분류 예산이 있는 경우 해당 대분류 ID 수집 (롤업 중복 방지)
  const parentsOfBudgetedChildren = new Set<string>()
  for (const item of items) {
    const cat = categoryMap.get(item.categoryId)
    if (cat?.parentId) parentsOfBudgetedChildren.add(cat.parentId)
  }

  // 부모 예산 항목이 있는 경우 해당 자식 카테고리 ID 수집 (중복 방지)
  const budgetParentIds = new Set(
    items.filter(i => !categoryMap.get(i.categoryId)?.parentId).map(i => i.categoryId),
  )

  // 자식 카테고리가 있는 대분류 ID 수집 (롤업 항목 제외용)
  const categoriesWithChildren = new Set(
    categoriesData.filter(c => c.parentId !== null).map(c => c.parentId!),
  )

  const seen = new Set(budgetedIds)
  for (const actual of actuals) {
    if (!actual.category_id || seen.has(actual.category_id)) continue
    if (parentsOfBudgetedChildren.has(actual.category_id)) continue
    if (categoriesWithChildren.has(actual.category_id)) continue
    if (actual.total <= 0) continue

    const cat = categoryMap.get(actual.category_id)
    if (!cat) continue

    // 부모 예산이 있는 경우 그 자식은 건너뜀 (대분류 실적과 중복 방지)
    if (cat.parentId && budgetParentIds.has(cat.parentId)) continue

    seen.add(actual.category_id)
    result.push({
      id: `virtual-${actual.category_id}`,
      budgetId,
      categoryId: actual.category_id,
      categoryName: cat.name,
      categoryType: cat.type as 'income' | 'expense',
      categoryParentId: cat.parentId ?? null,
      plannedAmount: 0,
      actualAmount: actual.total,
      difference: -actual.total,
      achievementRate: 0,
      memo: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  return result
}

// === Annual Grid ===

export async function findBudgetsWithItemsByYear(year: number) {
  const db = getDb()

  const yearBudgets = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.year, year), sql`${budgets.month} IS NOT NULL`))
    .orderBy(budgets.month)

  if (yearBudgets.length === 0) {
    return []
  }

  const budgetIds = yearBudgets.map((b) => b.id)
  const allItems = await db
    .select()
    .from(budgetItems)
    .where(inArray(budgetItems.budgetId, budgetIds))

  return yearBudgets.map((b) => ({
    ...b,
    items: allItems.filter((item) => item.budgetId === b.id),
  }))
}

// H-4: 전체를 db.transaction으로 감싸기
export async function upsertBudgetItem(
  year: number,
  month: number,
  categoryId: string,
  amount: number,
) {
  const db = getDb()

  return db.transaction(async (tx) => {
    // budget 조회 또는 생성
    const budgetCondition = and(eq(budgets.year, year), eq(budgets.month, month))
    let budgetRows = await tx.select().from(budgets).where(budgetCondition)
    let budget = budgetRows[0] ?? null

    if (!budget) {
      const id = generateId()
      budgetRows = await tx.insert(budgets).values({
        id,
        name: `${year}년 ${month}월 예산`,
        year,
        month,
        totalIncome: 0,
        totalExpense: 0,
      }).returning()
      budget = budgetRows[0]!
    }

    const existingItems = await tx
      .select()
      .from(budgetItems)
      .where(and(eq(budgetItems.budgetId, budget.id), eq(budgetItems.categoryId, categoryId)))

    const existingItem = existingItems[0] ?? null

    if (amount === 0 && existingItem) {
      await tx.delete(budgetItems).where(eq(budgetItems.id, existingItem.id))
    } else if (amount > 0 && existingItem) {
      await tx
        .update(budgetItems)
        .set({ plannedAmount: amount })
        .where(eq(budgetItems.id, existingItem.id))
    } else if (amount > 0) {
      await tx.insert(budgetItems).values({
        id: generateId(),
        budgetId: budget.id,
        categoryId,
        plannedAmount: amount,
      })
    }

    // totalIncome/totalExpense 재계산 - 단일 SQL (소분류 있는 대분류 제외)
    const totals = await tx.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN c.type = 'income' THEN bi.planned_amount ELSE 0 END), 0)::integer AS total_income,
        COALESCE(SUM(CASE WHEN c.type = 'expense' THEN bi.planned_amount ELSE 0 END), 0)::integer AS total_expense
      FROM budget_items bi
      JOIN categories c ON bi.category_id = c.id
      WHERE bi.budget_id = ${budget.id}
        AND NOT (c.parent_id IS NULL AND EXISTS (
          SELECT 1 FROM categories c2 WHERE c2.parent_id = c.id
        ))
    `) as unknown as Array<{ total_income: number; total_expense: number }>

    const totalIncome = totals[0]?.total_income ?? 0
    const totalExpense = totals[0]?.total_expense ?? 0

    const [result] = await tx
      .update(budgets)
      .set({ totalIncome, totalExpense })
      .where(eq(budgets.id, budget.id))
      .returning()

    return result
  })
}

export async function getMonthlyActuals(year: number) {
  const db = getDb()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`

  // M-2: SUM()::integer, 날짜: EXTRACT 사용
  // pending(미래 정기거래) 포함하여 연간 개요에 예상 실적 반영
  return db
    .select({
      month: sql<number>`EXTRACT(MONTH FROM ${transactions.date})::integer`.as('month'),
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})::integer`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, yearStart),
        lt(transactions.date, yearEnd),
        sql`${transactions.type} in ('income', 'expense')`,
      ),
    )
    .groupBy(sql`EXTRACT(MONTH FROM ${transactions.date})`, transactions.type)
}

