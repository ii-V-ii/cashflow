import { eq, and, sql, isNull, gte, lt } from 'drizzle-orm'
import { getDb } from '../index'
import { budgets, budgetItems, transactions, categories } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateBudgetInput, UpdateBudgetInput, BudgetItemInput } from '../../lib/validators'

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

  // 소분류→대분류 롤업: 예산은 대분류 기준이므로 소분류 실적을 대분류로 합산
  // M-2: SUM()::integer 캐스팅
  const rows = await db.execute(sql`
    SELECT
      COALESCE(c.parent_id, t.category_id) AS category_id,
      t.type,
      SUM(t.amount)::integer AS total
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date >= ${start} AND t.date < ${end}
      AND t.type IN ('income', 'expense')
    GROUP BY COALESCE(c.parent_id, t.category_id), t.type
  `)

  return rows as unknown as Array<{ category_id: string | null; type: string; total: number }>
}

export async function getBudgetItemsWithActuals(budgetId: string, year: number, month: number) {
  const db = getDb()
  const items = await getBudgetItems(budgetId)
  const actuals = await getActualsByYearMonth(year, month)

  const actualMap = new Map<string, number>()
  for (const a of actuals) {
    if (a.category_id) {
      actualMap.set(a.category_id, a.total)
    }
  }

  const categoriesData = await db.select().from(categories)
  const categoryMap = new Map(categoriesData.map((c) => [c.id, c]))

  return items.map((item) => {
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
    }
  })
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
    .where(sql`${budgetItems.budgetId} IN (${sql.join(budgetIds.map(id => sql`${id}`), sql`, `)})`)

  return yearBudgets.map((b) => ({
    ...b,
    items: allItems.filter((item) => item.budgetId === b.id),
  }))
}

export async function upsertBudgetItem(
  year: number,
  month: number,
  categoryId: string,
  amount: number,
) {
  const db = getDb()

  let budget = await findBudgetByYearMonth(year, month)

  if (!budget) {
    const id = generateId()
    await db.insert(budgets).values({
      id,
      name: `${year}년 ${month}월 예산`,
      year,
      month,
      totalIncome: 0,
      totalExpense: 0,
    })
    budget = (await findBudgetById(id))!
  }

  const existingItems = await db
    .select()
    .from(budgetItems)
    .where(and(eq(budgetItems.budgetId, budget.id), eq(budgetItems.categoryId, categoryId)))

  const existingItem = existingItems[0] ?? null

  if (amount === 0 && existingItem) {
    await db.delete(budgetItems).where(eq(budgetItems.id, existingItem.id))
  } else if (amount > 0 && existingItem) {
    await db
      .update(budgetItems)
      .set({ plannedAmount: amount })
      .where(eq(budgetItems.id, existingItem.id))
  } else if (amount > 0) {
    await db.insert(budgetItems).values({
      id: generateId(),
      budgetId: budget.id,
      categoryId,
      plannedAmount: amount,
    })
  }

  // totalIncome/totalExpense 재계산 (소분류 있는 대분류는 제외)
  const allItems = await getBudgetItems(budget.id)
  const allCats = await db.select().from(categories)
  const catMap = new Map(allCats.map((c) => [c.id, c]))
  const parentIds = new Set(allCats.filter(c => c.parentId === null).map(c => c.id))
  const parentsWithChildren = new Set(allCats.filter(c => c.parentId !== null).map(c => c.parentId!))

  let totalIncome = 0
  let totalExpense = 0
  for (const item of allItems) {
    const cat = catMap.get(item.categoryId)
    if (!cat) continue
    // 대분류인데 소분류가 있으면 건너뜀 (소분류 합으로 대체)
    if (parentIds.has(cat.id) && parentsWithChildren.has(cat.id)) continue
    if (cat.type === 'income') {
      totalIncome += item.plannedAmount
    } else {
      totalExpense += item.plannedAmount
    }
  }

  await db
    .update(budgets)
    .set({ totalIncome, totalExpense })
    .where(eq(budgets.id, budget.id))

  return (await findBudgetById(budget.id))!
}

export async function getMonthlyActuals(year: number) {
  const db = getDb()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`

  // M-2: SUM()::integer, 날짜: EXTRACT 사용
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

// === Helpers ===

function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}
