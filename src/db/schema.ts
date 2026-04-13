import { pgTable, text, integer, real, index, unique, boolean, date, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core'

// === Categories ===

export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    expenseKind: text('expense_kind', { enum: ['consumption', 'saving'] }),
    icon: text('icon'),
    color: text('color'),
    parentId: text('parent_id').references((): any => categories.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_categories_type').on(table.type),
    index('idx_categories_parent_id').on(table.parentId),
  ],
)

// === Accounts ===

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', {
      enum: ['cash', 'bank', 'card', 'savings', 'investment'],
    }).notNull(),
    initialBalance: integer('initial_balance').notNull().default(0),
    currentBalance: integer('current_balance').notNull().default(0),
    color: text('color'),
    icon: text('icon'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_accounts_type').on(table.type),
  ],
)

// === Transactions ===

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    type: text('type', {
      enum: ['income', 'expense', 'transfer'],
    }).notNull(),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    categoryId: text('category_id').references(() => categories.id),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    toAccountId: text('to_account_id').references(() => accounts.id),
    recurringId: text('recurring_id').references(() => recurringTransactions.id, { onDelete: 'set null' }),
    date: date('date').notNull(),
    memo: text('memo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_transactions_type').on(table.type),
    index('idx_transactions_account_id').on(table.accountId),
    index('idx_transactions_category_id').on(table.categoryId),
    index('idx_transactions_date').on(table.date),
    index('idx_transactions_to_account_id').on(table.toAccountId),
    index('idx_transactions_recurring_id').on(table.recurringId),
  ],
)

// === Tags ===

export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// === Budgets ===

export const budgets = pgTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    year: integer('year').notNull(),
    month: integer('month'), // NULL이면 연간 예산
    totalIncome: integer('total_income').notNull().default(0),
    totalExpense: integer('total_expense').notNull().default(0),
    memo: text('memo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_budgets_year_month').on(table.year, table.month),
    index('idx_budgets_year').on(table.year),
  ],
)

// === Budget Items ===

export const budgetItems = pgTable(
  'budget_items',
  {
    id: text('id').primaryKey(),
    budgetId: text('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    plannedAmount: integer('planned_amount').notNull(),
    memo: text('memo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_budget_items_budget_category').on(table.budgetId, table.categoryId),
    index('idx_budget_items_budget_id').on(table.budgetId),
    index('idx_budget_items_category_id').on(table.categoryId),
  ],
)

// === Transaction Tags (Junction Table) ===

export const transactionTags = pgTable(
  'transaction_tags',
  {
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.tagId] }),
    index('idx_transaction_tags_transaction_id').on(table.transactionId),
    index('idx_transaction_tags_tag_id').on(table.tagId),
  ],
)

// === Asset Categories ===

export const assetCategories = pgTable(
  'asset_categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
)

// === Assets ===

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', {
      enum: [
        'real_estate', 'vehicle', 'stock', 'fund', 'deposit',
        'savings', 'bond', 'crypto', 'insurance', 'pension', 'other',
      ],
    }).notNull(),
    category: text('category', {
      enum: ['financial', 'non_financial'],
    }).notNull(),
    assetCategoryId: text('asset_category_id').references(() => assetCategories.id),
    acquisitionDate: date('acquisition_date').notNull(),
    acquisitionCost: integer('acquisition_cost').notNull(),
    currentValue: integer('current_value').notNull(),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    institution: text('institution'),
    memo: text('memo'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_assets_type').on(table.type),
    index('idx_assets_category').on(table.category),
    index('idx_assets_asset_category_id').on(table.assetCategoryId),
    index('idx_assets_account_id').on(table.accountId),
    index('idx_assets_is_active').on(table.isActive),
  ],
)

// === Asset Valuations ===

export const assetValuations = pgTable(
  'asset_valuations',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    value: integer('value').notNull(),
    source: text('source', {
      enum: ['manual', 'api', 'estimate', 'auto'],
    }).notNull().default('manual'),
    memo: text('memo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_asset_valuations_asset_date').on(table.assetId, table.date),
    index('idx_asset_valuations_asset_id').on(table.assetId),
    index('idx_asset_valuations_date').on(table.date),
  ],
)

// === Recurring Transactions ===

export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: text('id').primaryKey(),
    type: text('type', {
      enum: ['income', 'expense', 'transfer'],
    }).notNull(),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    categoryId: text('category_id').references(() => categories.id),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    toAccountId: text('to_account_id').references(() => accounts.id),
    frequency: text('frequency', {
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
    }).notNull(),
    interval: integer('interval').notNull().default(1),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    nextDate: date('next_date').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_recurring_transactions_next_date').on(table.nextDate),
    index('idx_recurring_transactions_is_active').on(table.isActive),
    index('idx_recurring_transactions_account_id').on(table.accountId),
  ],
)

// === Forecast Scenarios ===

export const forecastScenarios = pgTable(
  'forecast_scenarios',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    assumptions: jsonb('assumptions'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
)

// === Forecast Results ===

export const forecastResults = pgTable(
  'forecast_results',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => forecastScenarios.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    projectedIncome: integer('projected_income').notNull(),
    projectedExpense: integer('projected_expense').notNull(),
    projectedBalance: integer('projected_balance').notNull(),
    projectedNetWorth: integer('projected_net_worth').notNull(),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_forecast_results_scenario_date').on(table.scenarioId, table.date),
    index('idx_forecast_results_scenario_id').on(table.scenarioId),
    index('idx_forecast_results_date').on(table.date),
  ],
)

// === Investment Returns ===

export const investmentReturns = pgTable(
  'investment_returns',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    investedAmount: integer('invested_amount').notNull().default(0),
    dividendIncome: integer('dividend_income').notNull().default(0),
    realizedGain: integer('realized_gain').notNull().default(0),
    unrealizedGain: integer('unrealized_gain').notNull().default(0),
    returnRate: real('return_rate').default(0),
    memo: text('memo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_investment_returns_asset_year_month').on(table.assetId, table.year, table.month),
    index('idx_investment_returns_asset_id').on(table.assetId),
    index('idx_investment_returns_year_month').on(table.year, table.month),
  ],
)
