import { eq, and, gte, lte, lt, like, desc, sql, inArray } from 'drizzle-orm'
import { format } from 'date-fns'
import { getDb } from '../index'
import { transactions, transactionTags, tags, assets, assetValuations, accounts, investmentTrades } from '../schema'
import { generateId } from '../../lib/utils'
import { updateAccountBalance } from './account-repository'
import type { CreateTransactionInput, UpdateTransactionInput } from '../../lib/validators'
import type { TransactionFilter, PaginationParams } from '../../types'

export async function findAllTransactions(
  filter?: TransactionFilter,
  pagination?: PaginationParams,
) {
  const db = getDb()
  const page = pagination?.page ?? 1
  const limit = pagination?.limit ?? 20
  const offset = (page - 1) * limit

  const conditions = buildFilterConditions(filter)

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(whereClause),
  ])

  const total = countRows[0]?.count ?? 0

  // H-1: N+1 → 배치 조회 (IN절로 한 번에 태그 조회)
  const withTags = await batchLoadTagNames(rows)

  return { data: withTags, total, page, limit }
}

export async function findTransactionById(id: string) {
  const db = getDb()
  const rows = await db.select().from(transactions).where(eq(transactions.id, id))
  const row = rows[0]
  if (!row) return null

  return {
    ...row,
    tags: await getTransactionTagNames(id),
  }
}

export async function createTransaction(input: CreateTransactionInput) {
  const db = getDb()
  const id = generateId()
  const inputTags = 'tags' in input ? (input.tags ?? []) : []

  // C-2: 거래 생성 + 태그 + 잔액 갱신을 단일 트랜잭션으로 통합
  await db.transaction(async (tx) => {
    await tx.insert(transactions)
      .values({
        id,
        type: input.type,
        amount: input.amount,
        description: input.description,
        categoryId: input.categoryId ?? null,
        accountId: input.accountId,
        toAccountId: input.toAccountId ?? null,
        date: input.date,
        memo: input.memo ?? null,
        installmentMonths: input.installmentMonths ?? null,
        installmentCurrent: input.installmentCurrent ?? null,
      })

    for (const tagName of inputTags) {
      const tagId = await findOrCreateTag(tagName, tx)
      await tx.insert(transactionTags)
        .values({ transactionId: id, tagId })
    }

    await applyBalanceChange(input.type, input.amount, input.accountId, input.toAccountId ?? null, tx)
  })

  return (await findTransactionById(id))!
}

export async function deleteTransaction(id: string) {
  const db = getDb()
  const existing = await findTransactionById(id)
  if (!existing) return false

  // C-2: 잔액 복원 + 삭제를 단일 트랜잭션으로 통합
  await db.transaction(async (tx) => {
    await reverseBalanceChange(
      existing.type as 'income' | 'expense' | 'transfer',
      existing.amount,
      existing.accountId,
      existing.toAccountId,
      tx,
    )

    await tx.delete(transactionTags)
      .where(eq(transactionTags.transactionId, id))
    await tx.delete(transactions)
      .where(eq(transactions.id, id))
  })

  return true
}

export async function updateTransaction(id: string, input: UpdateTransactionInput) {
  const db = getDb()
  const existing = await findTransactionById(id)
  if (!existing) return null

  const inputTags = 'tags' in input ? input.tags : undefined

  // C-2: 거래 수정 + 태그 + 잔액 보정을 단일 트랜잭션으로 통합
  await db.transaction(async (tx) => {
    await tx.update(transactions)
      .set({
        ...(input.type !== undefined && { type: input.type }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.accountId !== undefined && { accountId: input.accountId }),
        ...(input.toAccountId !== undefined && { toAccountId: input.toAccountId }),
        ...(input.date !== undefined && { date: input.date }),
        ...(input.memo !== undefined && { memo: input.memo }),
        ...(input.installmentMonths !== undefined && { installmentMonths: input.installmentMonths }),
        ...(input.installmentCurrent !== undefined && { installmentCurrent: input.installmentCurrent }),
      })
      .where(eq(transactions.id, id))

    if (inputTags !== undefined) {
      await tx.delete(transactionTags)
        .where(eq(transactionTags.transactionId, id))
      for (const tagName of inputTags) {
        const tagId = await findOrCreateTag(tagName, tx)
        await tx.insert(transactionTags)
          .values({ transactionId: id, tagId })
      }
    }

    await reverseBalanceChange(
      existing.type as 'income' | 'expense' | 'transfer',
      existing.amount,
      existing.accountId,
      existing.toAccountId,
      tx,
    )
    await applyBalanceChange(
      input.type ?? existing.type,
      input.amount ?? existing.amount,
      input.accountId ?? existing.accountId,
      input.toAccountId ?? existing.toAccountId,
      tx,
    )
  })

  return (await findTransactionById(id))!
}

export async function findByRecurringId(recurringId: string) {
  const db = getDb()
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.recurringId, recurringId))
    .orderBy(transactions.date)
}

export async function deleteFutureByRecurringId(recurringId: string, afterDate: string) {
  const db = getDb()

  const futureRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.recurringId, recurringId),
        gte(transactions.date, afterDate),
      ),
    )

  const ids = futureRows.map((r) => r.id)
  if (ids.length === 0) return 0

  await db.transaction(async (tx) => {
    await tx.delete(transactionTags)
      .where(inArray(transactionTags.transactionId, ids))
    await tx.delete(transactions)
      .where(inArray(transactions.id, ids))
  })

  return ids.length
}

export interface BulkTransactionItem {
  type: 'income' | 'expense' | 'transfer'
  amount: number
  description: string
  categoryId: string | null
  accountId: string
  toAccountId: string | null
  recurringId: string
  date: string
}

export async function bulkInsertTransactions(items: BulkTransactionItem[]) {
  if (items.length === 0) return

  const db = getDb()

  const values = items.map((item) => ({
    id: generateId(),
    type: item.type,
    amount: item.amount,
    description: item.description,
    categoryId: item.categoryId,
    accountId: item.accountId,
    toAccountId: item.toAccountId,
    recurringId: item.recurringId,
    date: item.date,
    memo: null,
    status: 'pending' as const,
  }))

  // 배치 삽입 (잔액 갱신 없음 - 미래 거래이므로)
  const BATCH_SIZE = 100
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE)
    await db.insert(transactions).values(batch)
  }
}

// === Internal Helpers ===

function buildFilterConditions(filter?: TransactionFilter) {
  if (!filter) return []

  const conditions = []

  if (filter.type) {
    conditions.push(eq(transactions.type, filter.type))
  }
  if (filter.categoryId) {
    conditions.push(eq(transactions.categoryId, filter.categoryId))
  }
  if (filter.accountId) {
    conditions.push(eq(transactions.accountId, filter.accountId))
  }
  if (filter.dateRange?.from) {
    conditions.push(gte(transactions.date, filter.dateRange.from))
  }
  if (filter.dateRange?.to) {
    conditions.push(lt(transactions.date, filter.dateRange.to))
  }
  if (filter.minAmount !== undefined) {
    conditions.push(gte(transactions.amount, filter.minAmount))
  }
  if (filter.maxAmount !== undefined) {
    conditions.push(lte(transactions.amount, filter.maxAmount))
  }
  if (filter.search) {
    conditions.push(like(transactions.description, `%${filter.search}%`))
  }
  if (filter.tags && filter.tags.length > 0) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM transaction_tags tt
        JOIN tags t ON tt.tag_id = t.id
        WHERE tt.transaction_id = ${transactions.id}
        AND ${inArray(tags.name, filter.tags)}
      )`,
    )
  }

  return conditions
}

async function getTransactionTagNames(transactionId: string): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({ name: tags.name })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tagId, tags.id))
    .where(eq(transactionTags.transactionId, transactionId))

  return rows.map((r) => r.name)
}

// H-1: N+1 → 배치 조회 (IN절로 한 번에 태그 조회 후 Map으로 매핑)
async function batchLoadTagNames<T extends { id: string }>(
  rows: T[],
): Promise<(T & { tags: string[] })[]> {
  if (rows.length === 0) return []

  const db = getDb()
  const ids = rows.map((r) => r.id)

  const tagRows = await db
    .select({
      transactionId: transactionTags.transactionId,
      name: tags.name,
    })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tagId, tags.id))
    .where(inArray(transactionTags.transactionId, ids))

  const tagMap = new Map<string, string[]>()
  for (const row of tagRows) {
    const existing = tagMap.get(row.transactionId) ?? []
    existing.push(row.name)
    tagMap.set(row.transactionId, existing)
  }

  return rows.map((row) => ({
    ...row,
    tags: tagMap.get(row.id) ?? [],
  }))
}

// H-3: INSERT ON CONFLICT DO NOTHING + SELECT 패턴
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findOrCreateTag(name: string, tx?: any): Promise<string> {
  const executor = tx ?? getDb()

  const id = generateId()
  await executor.insert(tags)
    .values({ id, name })
    .onConflictDoNothing({ target: tags.name })

  // INSERT 성공 여부와 무관하게 SELECT로 확정
  const rows = await executor
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, name))

  return rows[0]!.id
}

// C-2: applyBalanceChange / reverseBalanceChange에 tx 전달
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyBalanceChange(
  type: string,
  amount: number,
  accountId: string,
  toAccountId: string | null,
  tx?: any,
) {
  switch (type) {
    case 'income':
      await updateAccountBalance(accountId, amount, tx)
      break
    case 'expense':
      await updateAccountBalance(accountId, -amount, tx)
      if (toAccountId) {
        await updateAccountBalance(toAccountId, amount, tx)
      }
      break
    case 'transfer':
      await updateAccountBalance(accountId, -amount, tx)
      if (toAccountId) {
        await updateAccountBalance(toAccountId, amount, tx)
      }
      break
  }

  // 잔액 변경 후 연결된 자산 동기화
  await syncAssetFromAccount(accountId, tx)
  if (toAccountId) {
    await syncAssetFromAccount(toAccountId, tx)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reverseBalanceChange(
  type: 'income' | 'expense' | 'transfer',
  amount: number,
  accountId: string,
  toAccountId: string | null,
  tx?: any,
) {
  switch (type) {
    case 'income':
      await updateAccountBalance(accountId, -amount, tx)
      break
    case 'expense':
      await updateAccountBalance(accountId, amount, tx)
      if (toAccountId) {
        await updateAccountBalance(toAccountId, -amount, tx)
      }
      break
    case 'transfer':
      await updateAccountBalance(accountId, amount, tx)
      if (toAccountId) {
        await updateAccountBalance(toAccountId, -amount, tx)
      }
      break
  }

  // 잔액 복원 후 연결된 자산 동기화
  await syncAssetFromAccount(accountId, tx)
  if (toAccountId) {
    await syncAssetFromAccount(toAccountId, tx)
  }
}

// 1자산:N계좌 — 단일 쿼리로 assetId + 잔액 합계 조회, 2쿼리로 갱신
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncAssetFromAccount(accountId: string, tx?: any) {
  const executor = tx ?? getDb()

  // 1. assetId + 연결 계좌 잔액 합계를 단일 쿼리로 조회
  const rows = await executor.execute(sql`
    SELECT a.asset_id, COALESCE(SUM(a2.current_balance), 0)::integer AS total
    FROM accounts a
    JOIN accounts a2 ON a2.asset_id = a.asset_id
    WHERE a.id = ${accountId} AND a.asset_id IS NOT NULL
    GROUP BY a.asset_id
  `) as unknown as Array<{ asset_id: string; total: number }>

  if (!rows[0]) return
  const { asset_id: assetId, total: cashBalance } = rows[0]
  const today = format(new Date(), 'yyyy-MM-dd')

  // 2. 보유주식 매수원가 조회 (열린 로트의 잔여수량 × 단가)
  const holdingsRows = await executor.execute(sql`
    SELECT COALESCE(SUM(unit_price * remaining_quantity), 0)::integer AS holdings_cost
    FROM ${investmentTrades}
    WHERE ${investmentTrades.assetId} = ${assetId}
      AND trade_type = 'buy' AND remaining_quantity > 0
  `) as unknown as Array<{ holdings_cost: number }>

  const holdingsCost = holdingsRows[0]?.holdings_cost ?? 0
  const totalValue = cashBalance + holdingsCost

  // 3. 자산 갱신 + 평가이력 upsert (2쿼리, 병렬)
  await Promise.all([
    executor.update(assets).set({ currentValue: totalValue }).where(eq(assets.id, assetId)),
    executor.insert(assetValuations).values({
      id: generateId(), assetId, date: today, value: totalValue, source: 'auto',
    }).onConflictDoUpdate({
      target: [assetValuations.assetId, assetValuations.date],
      set: { value: totalValue, source: 'auto' },
    }),
  ])
}
