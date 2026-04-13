"use client"

import { useState, useCallback } from "react"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Trash2,
  Pencil,
  Repeat,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { TransactionForm } from "@/components/transactions/TransactionForm"
import { CsvExportButton } from "@/components/transactions/CsvExportButton"
import { RecurringList } from "@/components/recurring/RecurringList"
import { useTransactions, useDeleteTransaction } from "@/hooks/use-transactions"
import { useCategories } from "@/hooks/use-categories"
import { useAccounts } from "@/hooks/use-accounts"
import { formatCurrency } from "@/lib/utils"
import type { TransactionType } from "@/types"

const TYPE_CONFIG = {
  income: {
    label: "수입",
    icon: ArrowDownCircle,
    variant: "default" as const,
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    className: "text-emerald-600",
  },
  expense: {
    label: "지출",
    icon: ArrowUpCircle,
    variant: "destructive" as const,
    className: "text-rose-600",
  },
  transfer: {
    label: "이체",
    icon: ArrowLeftRight,
    variant: "outline" as const,
    className: "text-blue-600",
  },
} as const

interface TransactionRow {
  id: string
  type: "income" | "expense" | "transfer"
  amount: number
  description: string
  categoryId: string | null
  accountId: string
  toAccountId: string | null
  recurringId: string | null
  date: string
  memo: string | null
}

export default function TransactionsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TransactionType | "">("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [accountFilter, setAccountFilter] = useState("")
  const [search, setSearch] = useState("")
  const [editTx, setEditTx] = useState<TransactionRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const limit = 20

  const from = `${year}-${String(month).padStart(2, "0")}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

  const filter = {
    dateRange: { from, to },
    ...(typeFilter && { type: typeFilter as TransactionType }),
    ...(categoryFilter && { categoryId: categoryFilter }),
    ...(accountFilter && { accountId: accountFilter }),
    ...(search && { search }),
  }

  const { data, isLoading } = useTransactions({
    filter,
    page,
    limit,
  })

  const handlePrevMonth = useCallback(() => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else { setMonth((m) => m - 1) }
    setPage(1)
  }, [month])

  const handleNextMonth = useCallback(() => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else { setMonth((m) => m + 1) }
    setPage(1)
  }, [month])
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()
  const deleteMutation = useDeleteTransaction()

  const result = data as
    | { data: TransactionRow[]; meta: { total: number; totalPages: number } }
    | undefined
  const transactions = result?.data ?? []
  const meta = result?.meta

  const handleDelete = useCallback(
    (id: string) => {
      if (confirm("이 거래를 삭제하시겠습니까?")) {
        deleteMutation.mutate(id)
      }
    },
    [deleteMutation],
  )

  const handleEdit = useCallback((tx: TransactionRow) => {
    setEditTx(tx)
    setEditOpen(true)
  }, [])

  const handleEditOpenChange = useCallback((open: boolean) => {
    setEditOpen(open)
    if (!open) setEditTx(null)
  }, [])

  const getCategoryName = useCallback(
    (id: string | null) => {
      if (!id) return "미분류"
      return categories?.find((c) => c.id === id)?.name ?? "미분류"
    },
    [categories],
  )

  const getAccountName = useCallback(
    (id: string) => accounts?.find((a) => a.id === id)?.name ?? id,
    [accounts],
  )

  const selectClass =
    "flex h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">거래</h1>
        <div className="flex items-center gap-2">
          <CsvExportButton />
          <TransactionForm />
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="recurring">정기 거래</TabsTrigger>
        </TabsList>

        <TabsContent value="recurring">
          <RecurringList />
        </TabsContent>

        <TabsContent value="all">

      {/* 월 선택 */}
      <div className="flex items-center gap-2 mb-2">
        <Button variant="outline" size="icon-sm" onClick={handlePrevMonth} aria-label="이전 달">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-24 text-center text-sm font-semibold">
          {year}년 {month}월
        </span>
        <Button variant="outline" size="icon-sm" onClick={handleNextMonth} aria-label="다음 달">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="거래 검색..."
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          className={selectClass}
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as TransactionType | "")
            setPage(1)
          }}
        >
          <option value="">전체 유형</option>
          <option value="income">수입</option>
          <option value="expense">지출</option>
          <option value="transfer">이체</option>
        </select>
        <select
          className={selectClass}
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">전체 카테고리</option>
          {categories?.filter((c) => c.parentId === null).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={accountFilter}
          onChange={(e) => {
            setAccountFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">전체 계좌</option>
          {accounts?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* 테이블 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>거래 내역이 없습니다.</p>
          <p className="text-sm">새 거래를 등록해보세요.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>날짜</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>계좌</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => {
              const typeKey = tx.type as keyof typeof TYPE_CONFIG
              const config = TYPE_CONFIG[typeKey]
              const Icon = config.icon
              return (
                <TableRow key={tx.id}>
                  <TableCell className="text-muted-foreground">
                    {tx.date}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant={config.variant} className={`gap-1 ${"badgeClass" in config ? config.badgeClass : ""}`}>
                        <Icon className="size-3" />
                        {config.label}
                      </Badge>
                      {tx.recurringId && (
                        <Tooltip>
                          <TooltipTrigger
                            render={<span className="inline-flex" />}
                          >
                            <Repeat className="size-3.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>정기 거래</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium max-w-48 truncate">
                    {tx.description}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getCategoryName(tx.categoryId)}
                  </TableCell>
                  <TableCell>
                    {getAccountName(tx.accountId)}
                    {tx.toAccountId ? (
                      <span className="text-muted-foreground">
                        {" → "}
                        {getAccountName(tx.toAccountId)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono font-medium ${config.className}`}
                  >
                    {typeKey === "expense" ? "-" : ""}
                    {formatCurrency(tx.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEdit(tx)}
                        aria-label="수정"
                      >
                        <Pencil className="size-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(tx.id)}
                        disabled={deleteMutation.isPending}
                        aria-label="삭제"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* 페이지네이션 */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            총 {meta.total}건 중 {(page - 1) * limit + 1}~
            {Math.min(page * limit, meta.total)}건
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="이전 페이지"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-sm">
              {page} / {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="다음 페이지"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

        </TabsContent>
      </Tabs>

      {/* 수정 다이얼로그 */}
      <TransactionForm
        editTransaction={editTx}
        open={editOpen}
        onOpenChange={handleEditOpenChange}
      />
    </div>
  )
}
