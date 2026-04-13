import { eq, and, sql, isNull } from 'drizzle-orm'
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

export async function createBudget(input: CreateBudgetInput) {
  const db = getDb()
  const now = new Date().toISOString()
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
        createdAt: now,
        updatedAt: now,
      })

    for (const item of input.items ?? []) {
      await tx.insert(budgetItems)
        .values({
          id: generateId(),
          budgetId: id,
          categoryId: item.categoryId,
          plannedAmount: item.plannedAmount,
          memo: item.memo ?? null,
          createdAt: now,
          updatedAt: now,
        })
    }
  })

  return (await findBudgetById(id))!
}

export async function updateBudget(id: string, input: UpdateBudgetInput) {
  const db = getDb()
  const existing = await findBudgetById(id)
  if (!existing) return null

  const now = new Date().toISOString()

  await db.transaction(async (tx) => {
    await tx.update(budgets)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.totalIncome !== undefined && { totalIncome: input.totalIncome }),
        ...(input.totalExpense !== undefined && { totalExpense: input.totalExpense }),
        ...(input.memo !== undefined && { memo: input.memo }),
        updatedAt: now,
      })
      .where(eq(budgets.id, id))

    if (input.items !== undefined) {
      await tx.delete(budgetItems).where(eq(budgetItems.budgetId, id))

      for (const item of input.items) {
        await tx.insert(budgetItems)
          .values({
            id: generateId(),
            budgetId: id,
            categoryId: item.categoryId,
            plannedAmount: item.plannedAmount,
            memo: item.memo ?? null,
            createdAt: now,
            updatedAt: now,
          })
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
  const now = new Date().toISOString()

  await db.transaction(async (tx) => {
    await tx.delete(budgetItems).where(eq(budgetItems.budgetId, budgetId))

    for (const item of items) {
      await tx.insert(budgetItems)
        .values({
          id: generateId(),
          budgetId,
          categoryId: item.categoryId,
          plannedAmount: item.plannedAmount,
          memo: item.memo ?? null,
          createdAt: now,
          updatedAt: now,
        })
    }
  })

  return getBudgetItems(budgetId)
}

// === 실적 대비 집계 ===

export async function getActualsByYearMonth(year: number, month: number) {
  const db = getDb()
  const datePrefix = `${year}-${String(month).padStart(2, '0')}`

  // 소분류→대분류 롤업: 예산은 대분류 기준이므로 소분류 실적을 대분류로 합산
  const rows = await db.execute(sql`
    SELECT
      COALESCE(c.parent_id, t.category_id) AS category_id,
      t.type,
      SUM(t.amount) AS total
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date LIKE ${datePrefix + '%'}
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
  const now = new Date().toISOString()

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
      createdAt: now,
      updatedAt: now,
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
      .set({ plannedAmount: amount, updatedAt: now })
      .where(eq(budgetItems.id, existingItem.id))
  } else if (amount > 0) {
    await db.insert(budgetItems).values({
      id: generateId(),
      budgetId: budget.id,
      categoryId,
      plannedAmount: amount,
      createdAt: now,
      updatedAt: now,
    })
  }

  // totalIncome/totalExpense 재계산
  const allItems = await getBudgetItems(budget.id)
  const allCats = await db.select().from(categories)
  const catMap = new Map(allCats.map((c) => [c.id, c]))

  let totalIncome = 0
  let totalExpense = 0
  for (const item of allItems) {
    const cat = catMap.get(item.categoryId)
    if (cat?.type === 'income') {
      totalIncome += item.plannedAmount
    } else {
      totalExpense += item.plannedAmount
    }
  }

  await db
    .update(budgets)
    .set({ totalIncome, totalExpense, updatedAt: now })
    .where(eq(budgets.id, budget.id))

  return (await findBudgetById(budget.id))!
}

export async function getMonthlyActuals(year: number) {
  const db = getDb()

  return db
    .select({
      month: sql<number>`cast(substr(${transactions.date}, 6, 2) as integer)`.as('month'),
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        sql`${transactions.date} like ${year + '%'}`,
        sql`${transactions.type} in ('income', 'expense')`,
      ),
    )
    .groupBy(sql`substr(${transactions.date}, 6, 2)`, transactions.type)
}
