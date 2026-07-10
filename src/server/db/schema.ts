import {
  bigint,
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import type {
  AccountType,
  ExpenseKind,
  TransactionStatus,
  TransactionType,
} from "@/types"

/**
 * Drizzle 스키마 — 타입·쿼리빌더 전용 (docs/DB.md 부록 A).
 * 마이그레이션 SQL(supabase/migrations)이 스키마의 단일 진실이며,
 * FK/CHECK/트리거/RLS는 SQL에만 존재한다. 여기서는 컬럼 매핑과 타입만 정의한다.
 * 금액은 KRW 정수(bigint) — JS number 안전 범위(2^53) 내에서 number 모드 사용.
 * date 컬럼은 string 모드('YYYY-MM-DD') — Date 모드로 바꾸면 UTC 변환으로 KST 날짜가 밀린다.
 */

// enum 리터럴의 단일 진실은 @/types — satisfies로 드리프트를 컴파일 타임에 차단
const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const satisfies readonly TransactionType[]
const TRANSACTION_STATUSES = ["pending", "applied"] as const satisfies readonly TransactionStatus[]
const ACCOUNT_TYPES = ["cash", "bank", "card", "savings", "investment"] as const satisfies readonly AccountType[]
const EXPENSE_KINDS = ["consumption", "saving"] as const satisfies readonly ExpenseKind[]

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  expenseKind: text("expense_kind", { enum: EXPENSE_KINDS }),
  icon: text("icon"),
  color: text("color"),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
  initialBalance: bigint("initial_balance", { mode: "number" })
    .notNull()
    .default(0),
  color: text("color"),
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  assetId: uuid("asset_id"),
  depositType: text("deposit_type", { enum: ["lump_sum", "installment"] }),
  termMonths: integer("term_months"),
  interestRate: numeric("interest_rate", { precision: 10, scale: 4 }),
  taxType: text("tax_type", {
    enum: ["normal", "preferential", "tax_free", "high"],
  }),
  openDate: date("open_date"),
  monthlyPayment: bigint("monthly_payment", { mode: "number" }),
  billingDay: integer("billing_day"),
  creditLimit: bigint("credit_limit", { mode: "number" }),
  linkedAccountId: uuid("linked_account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: TRANSACTION_STATUSES })
    .notNull()
    .default("applied"),
  categoryId: uuid("category_id"),
  accountId: uuid("account_id").notNull(),
  toAccountId: uuid("to_account_id"),
  recurringId: uuid("recurring_id"),
  date: date("date").notNull(),
  memo: text("memo"),
  installmentMonths: integer("installment_months"),
  installmentCurrent: integer("installment_current"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: uuid("transaction_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.transactionId, table.tagId] })],
)

/** 잔액의 유일한 진실 (DB.md §2.1) — 뷰 정의는 마이그레이션 SQL이 소유 */
export const accountBalancesV = pgView("account_balances_v", {
  accountId: uuid("account_id").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
  isActive: boolean("is_active").notNull(),
  initialBalance: bigint("initial_balance", { mode: "number" }).notNull(),
  currentBalance: bigint("current_balance", { mode: "number" }).notNull(),
}).existing()

// ─── Row 타입 (서비스/REST 계층에서 사용) ─────────────────────

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Tag = typeof tags.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type TransactionTag = typeof transactionTags.$inferSelect
export type AccountBalance = typeof accountBalancesV.$inferSelect
