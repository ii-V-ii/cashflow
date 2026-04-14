import { eq, sql } from 'drizzle-orm'
import { getDb } from '../index'
import { accounts } from '../schema'
import { generateId } from '../../lib/utils'
import { syncAssetFromAccount } from './transaction-repository'
import type { CreateAccountInput, UpdateAccountInput } from '../../lib/validators'

export async function findAllAccounts() {
  const db = getDb()
  return db
    .select()
    .from(accounts)
    .orderBy(accounts.sortOrder)
}

export async function findAccountById(id: string) {
  const db = getDb()
  const rows = await db.select().from(accounts).where(eq(accounts.id, id))
  return rows[0] ?? null
}

export async function createAccount(input: CreateAccountInput) {
  const db = getDb()
  const id = generateId()

  await db.insert(accounts)
    .values({
      id,
      name: input.name,
      type: input.type,
      initialBalance: input.balance ?? 0,
      currentBalance: input.balance ?? 0,
      color: input.color ?? null,
      icon: input.icon ?? null,
      depositType: input.depositType ?? null,
      termMonths: input.termMonths ?? null,
      interestRate: input.interestRate ?? null,
      taxType: input.taxType ?? null,
      openDate: input.openDate ?? null,
      monthlyPayment: input.monthlyPayment ?? null,
    })

  return (await findAccountById(id))!
}

export async function updateAccount(id: string, input: UpdateAccountInput) {
  const db = getDb()
  const existing = await findAccountById(id)
  if (!existing) return null

  await db.update(accounts)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.balance !== undefined && { currentBalance: input.balance }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.depositType !== undefined && { depositType: input.depositType }),
      ...(input.termMonths !== undefined && { termMonths: input.termMonths }),
      ...(input.interestRate !== undefined && { interestRate: input.interestRate ?? null }),
      ...(input.taxType !== undefined && { taxType: input.taxType }),
      ...(input.openDate !== undefined && { openDate: input.openDate }),
      ...(input.monthlyPayment !== undefined && { monthlyPayment: input.monthlyPayment }),
    })
    .where(eq(accounts.id, id))

  // C-3: balance 변경 시 연결 자산 동기화
  if (input.balance !== undefined && input.balance !== existing.currentBalance) {
    await syncAssetFromAccount(id)
  }

  return (await findAccountById(id))!
}

export async function deleteAccount(id: string) {
  const db = getDb()
  const existing = await findAccountById(id)
  if (!existing) return false

  await db.delete(accounts).where(eq(accounts.id, id))
  return true
}

// C-1: 원자적 잔액 갱신 (SELECT+계산+UPDATE 경쟁조건 제거)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateAccountBalance(id: string, delta: number, tx?: any) {
  const executor = tx ?? getDb()
  await executor.update(accounts)
    .set({ currentBalance: sql`current_balance + ${delta}` })
    .where(eq(accounts.id, id))
}
