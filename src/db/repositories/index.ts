export {
  findAllCategories,
  findCategoryById,
  findCategoriesByType,
  findSubcategories,
  findAllGrouped,
  getNextSortOrder,
  createCategory,
  updateCategory,
  hasTransactions,
  deleteCategory,
} from './category-repository'

export {
  findAllAssetCategories,
  findAssetCategoryById,
  findAssetCategoriesByKind,
  createAssetCategory,
  updateAssetCategory,
  deleteAssetCategory,
} from './asset-category-repository'

export {
  findAllAccounts,
  findAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  updateAccountBalance,
} from './account-repository'

export {
  findAllTransactions,
  findTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  findByRecurringId,
  deleteFutureByRecurringId,
  bulkInsertTransactions,
  syncAssetFromAccount,
} from './transaction-repository'
export type { BulkTransactionItem } from './transaction-repository'

export {
  findAllBudgets,
  findBudgetByYearMonth,
  findBudgetById,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetItems,
  setBudgetItems,
  getBudgetItemsWithActuals,
  getActualsByYearMonth,
  getMonthlyActuals,
  findBudgetsWithItemsByYear,
  upsertBudgetItem,
} from './budget-repository'

export {
  findAllAssets,
  findAssetById,
  findAssetsByAssetCategoryKind,
  createAsset,
  updateAsset,
  deleteAsset,
  updateCurrentValue,
  getValuations,
  getLatestValuation,
  addValuation,
} from './asset-repository'

export {
  findAllInvestmentReturns,
  findInvestmentReturnById,
  findInvestmentReturnsByAssetId,
  findInvestmentReturnsByPeriod,
  findInvestmentReturnsByAssetAndPeriod,
  createInvestmentReturn,
  updateInvestmentReturn,
  deleteInvestmentReturn,
} from './investment-return-repository'

export {
  findAllRecurringTransactions,
  findActiveRecurringTransactions,
  findDueRecurringTransactions,
  findRecurringTransactionById,
  createRecurringTransaction,
  updateRecurringTransaction,
  updateNextDate,
  deactivateRecurringTransaction,
  deleteRecurringTransaction,
} from './recurring-transaction-repository'

export {
  findAllForecastScenarios,
  findForecastScenarioById,
  createForecastScenario,
  updateForecastScenario,
  deleteForecastScenario,
  findForecastResultsByScenarioId,
  saveForecastResults,
} from './forecast-repository'
