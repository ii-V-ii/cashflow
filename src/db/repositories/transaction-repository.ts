import { eq, and, gte, lte, like, desc, sql, inArray } from 'drizzle-orm'
import { getDb } from '../index'
import { transactions, transactionTags, tags } from '../schema'
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

  const rows = await db
    .select()
    .from(transactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit)
    .offset(offset)

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  const total = countRows[0]?.count ?? 0

  const withTags = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      tags: await getTransactionTagNames(row.id),
    })),
  )

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
  const now = new Date().toISOString()
  const id = generateId()
  const inputTags = 'tags' in input ? (input.tags ?? []) : []

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
        createdAt: now,
        updatedAt: now,
      })

    // 태그 연결
    for (const tagName of inputTags) {
      const tagId = await findOrCreateTag(tagName)
      await tx.insert(transactionTags)
        .values({ transactionId: id, tagId })
    }
  })

  // 계좌 잔액 갱신
  await applyBalanceChange(input.type, input.amount, input.accountId, input.toAccountId ?? null)

  return (await findTransactionById(id))!
}

export async function deleteTransaction(id: string) {
  const db = getDb()
  const existing = await findTransactionById(id)
  if (!existing) return false

  // 잔액 복원 (역방향)
  await reverseBalanceChange(
    existing.type as 'income' | 'expense' | 'transfer',
    existing.amount,
    existing.accountId,
    existing.toAccountId,
  )

  await db.transaction(async (tx) => {
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

  const now = new Date().toISOString()
  const inputTags = 'tags' in input ? input.tags : undefined

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
        updatedAt: now,
      })
      .where(eq(transactions.id, id))

    if (inputTags !== undefined) {
      await tx.delete(transactionTags)
        .where(eq(transactionTags.transactionId, id))
      for (const tagName of inputTags) {
        const tagId = await findOrCreateTag(tagName)
        await tx.insert(transactionTags)
          .values({ transactionId: id, tagId })
      }
    }
  })

  // 잔액 보정: 기존 거래 역산 후 새 거래 적용
  await reverseBalanceChange(
    existing.type as 'income' | 'expense' | 'transfer',
    existing.amount,
    existing.accountId,
    existing.toAccountId,
  )
  await applyBalanceChange(
    input.type ?? existing.type,
    input.amount ?? existing.amount,
    input.accountId ?? existing.accountId,
    input.toAccountId ?? existing.toAccountId,
  )

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
  const now = new Date().toISOString()

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
    createdAt: now,
    updatedAt: now,
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
    conditions.push(lte(transactions.date, filter.dateRange.to))
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

async function findOrCreateTag(name: string): Promise<string> {
  const db = getDb()
  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.name, name))

  if (rows[0]) return rows[0].id

  const id = generateId()
  await db.insert(tags)
    .values({ id, name, createdAt: new Date().toISOString() })

  return id
}

async function applyBalanceChange(
  type: string,
  amount: number,
  accountId: string,
  toAccountId: string | null,
) {
  switch (type) {
    case 'income':
      await updateAccountBalance(accountId, amount)
      break
    case 'expense':
      await updateAccountBalance(accountId, -amount)
      break
    case 'transfer':
      await updateAccountBalance(accountId, -amount)
      if (toAccountId) {
        await updateAccountBalance(toAccountId, amount)
      }
      break
  }
}

async function reverseBalanceChange(
  type: 'income' | 'expense' | 'transfer',
  amount: number,
  accountId: string,
  toAccountId: string | null,
) {
  switch (type) {
    case 'income':
      await updateAccountBalance(accountId, -amount)
      break
    case 'expense':
      await updateAccountBalance(accountId, amount)
      break
    case 'transfer':
      await updateAccountBalance(accountId, amount)
      if (toAccountId) {
        await updateAccountBalance(toAccountId, -amount)
      }
      break
  }
}
