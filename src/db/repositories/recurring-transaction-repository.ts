import { eq, and, lte, desc } from 'drizzle-orm'
import { getDb } from '../index'
import { recurringTransactions } from '../schema'
import { generateId } from '../../lib/utils'
import { calculateNextDate } from '../../lib/services/recurring-service'
import type { CreateRecurringTransactionInput, UpdateRecurringTransactionInput } from '../../lib/validators'

export async function findAllRecurringTransactions() {
  const db = getDb()
  return db
    .select()
    .from(recurringTransactions)
    .orderBy(desc(recurringTransactions.createdAt))
}

export async function findActiveRecurringTransactions() {
  const db = getDb()
  return db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.isActive, true))
    .orderBy(recurringTransactions.nextDate)
}

export async function findDueRecurringTransactions(today: string) {
  const db = getDb()
  return db
    .select()
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.isActive, true),
        lte(recurringTransactions.nextDate, today),
      ),
    )
    .orderBy(recurringTransactions.nextDate)
}

export async function findRecurringTransactionById(id: string) {
  const db = getDb()
  const rows = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.id, id))
  return rows[0] ?? null
}

export async function createRecurringTransaction(input: CreateRecurringTransactionInput) {
  const db = getDb()
  const now = new Date().toISOString()
  const id = generateId()

  // nextDate를 오늘 이후로 보정
  const today = now.slice(0, 10)
  let nextDate = input.startDate
  const freq = (input.frequency ?? 'monthly') as 'daily' | 'weekly' | 'monthly' | 'yearly'
  const intv = input.interval ?? 1
  while (nextDate < today) {
    nextDate = calculateNextDate(nextDate, freq, intv)
  }

  await db.insert(recurringTransactions)
    .values({
      id,
      type: input.type,
      amount: input.amount,
      description: input.description,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId,
      toAccountId: input.toAccountId ?? null,
      frequency: input.frequency,
      interval: intv,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      nextDate,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })

  return (await findRecurringTransactionById(id))!
}

export async function updateRecurringTransaction(id: string, input: UpdateRecurringTransactionInput) {
  const db = getDb()
  const existing = await findRecurringTransactionById(id)
  if (!existing) return null

  const now = new Date().toISOString()

  await db.update(recurringTransactions)
    .set({
      ...(input.type !== undefined && { type: input.type }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
      ...(input.toAccountId !== undefined && { toAccountId: input.toAccountId }),
      ...(input.frequency !== undefined && { frequency: input.frequency }),
      ...(input.interval !== undefined && { interval: input.interval }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: now,
    })
    .where(eq(recurringTransactions.id, id))

  return (await findRecurringTransactionById(id))!
}

export async function updateNextDate(id: string, nextDate: string) {
  const db = getDb()
  const now = new Date().toISOString()
  await db.update(recurringTransactions)
    .set({ nextDate, updatedAt: now })
    .where(eq(recurringTransactions.id, id))
}

export async function deactivateRecurringTransaction(id: string) {
  const db = getDb()
  const now = new Date().toISOString()
  await db.update(recurringTransactions)
    .set({ isActive: false, updatedAt: now })
    .where(eq(recurringTransactions.id, id))
}

export async function deleteRecurringTransaction(id: string) {
  const db = getDb()
  const existing = await findRecurringTransactionById(id)
  if (!existing) return false

  await db.delete(recurringTransactions)
    .where(eq(recurringTransactions.id, id))
  return true
}
