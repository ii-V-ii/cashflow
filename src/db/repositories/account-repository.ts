import { eq } from 'drizzle-orm'
import { getDb } from '../index'
import { accounts } from '../schema'
import { generateId } from '../../lib/utils'
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
  const now = new Date().toISOString()
  const id = generateId()

  await db.insert(accounts)
    .values({
      id,
      name: input.name,
      type: input.type,
      currentBalance: input.balance ?? 0,
      color: input.color ?? null,
      icon: input.icon ?? null,
      createdAt: now,
      updatedAt: now,
    })

  return (await findAccountById(id))!
}

export async function updateAccount(id: string, input: UpdateAccountInput) {
  const db = getDb()
  const existing = await findAccountById(id)
  if (!existing) return null

  const now = new Date().toISOString()

  await db.update(accounts)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.balance !== undefined && { currentBalance: input.balance }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
      updatedAt: now,
    })
    .where(eq(accounts.id, id))

  return (await findAccountById(id))!
}

export async function deleteAccount(id: string) {
  const db = getDb()
  const existing = await findAccountById(id)
  if (!existing) return false

  await db.delete(accounts).where(eq(accounts.id, id))
  return true
}

export async function updateAccountBalance(id: string, delta: number) {
  const db = getDb()
  const account = await findAccountById(id)
  if (!account) return null

  const now = new Date().toISOString()
  const newBalance = account.currentBalance + delta

  await db.update(accounts)
    .set({
      currentBalance: newBalance,
      updatedAt: now,
    })
    .where(eq(accounts.id, id))

  return (await findAccountById(id))!
}
