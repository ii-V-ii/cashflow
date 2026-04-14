import { eq, sql } from 'drizzle-orm'
import { getDb } from '../index'
import { accounts, assets } from '../schema'
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

  const [result] = await db.insert(accounts)
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
      assetId: input.assetId ?? null,
      billingDay: input.billingDay ?? null,
      creditLimit: input.creditLimit ?? null,
      linkedAccountId: input.linkedAccountId ?? null,
    })
    .returning()

  return result
}

export async function updateAccount(id: string, input: UpdateAccountInput) {
  const db = getDb()
  const existing = await findAccountById(id)
  if (!existing) return null

  await db.update(accounts)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.initialBalance !== undefined && {
        initialBalance: input.initialBalance,
        // initialBalance 변경 시 currentBalance도 같은 차이만큼 보정
        currentBalance: existing.currentBalance + (input.initialBalance - existing.initialBalance),
      }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.depositType !== undefined && { depositType: input.depositType }),
      ...(input.termMonths !== undefined && { termMonths: input.termMonths }),
      ...(input.interestRate !== undefined && { interestRate: input.interestRate ?? null }),
      ...(input.taxType !== undefined && { taxType: input.taxType }),
      ...(input.openDate !== undefined && { openDate: input.openDate }),
      ...(input.monthlyPayment !== undefined && { monthlyPayment: input.monthlyPayment }),
      ...(input.assetId !== undefined && { assetId: input.assetId }),
      ...(input.billingDay !== undefined && { billingDay: input.billingDay }),
      ...(input.creditLimit !== undefined && { creditLimit: input.creditLimit }),
      ...(input.linkedAccountId !== undefined && { linkedAccountId: input.linkedAccountId }),
    })
    .where(eq(accounts.id, id))

  // C-3: balance 또는 assetId 변경 시 연결 자산 동기화
  if (
    (input.balance !== undefined && input.balance !== existing.currentBalance) ||
    (input.assetId !== undefined && input.assetId !== existing.assetId)
  ) {
    // 새 자산 동기화
    await syncAssetFromAccount(id)
    // 이전 자산이 있었으면 이전 자산도 재계산 (연결 해제된 계좌 잔액 제거)
    if (existing.assetId && existing.assetId !== input.assetId) {
      // 이전 자산에 연결된 다른 계좌가 있으면 재계산
      const db = getDb()
      const otherAccounts = await db.select().from(accounts).where(eq(accounts.assetId, existing.assetId))
      if (otherAccounts.length > 0) {
        await syncAssetFromAccount(otherAccounts[0].id)
      } else {
        // 연결된 계좌가 없으면 자산 가치를 0으로 (또는 유지)
        await db.update(assets).set({ currentValue: 0 }).where(eq(assets.id, existing.assetId))
      }
    }
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
