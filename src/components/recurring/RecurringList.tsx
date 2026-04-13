"use client"

import { useState, useCallback, useMemo } from "react"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Plus,
  Pause,
  Play,
  Trash2,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog"
import { RecurringForm } from "./RecurringForm"
import {
  useRecurringTransactions,
  useCreateRecurring,
  useUpdateRecurring,
  useDeleteRecurring,
} from "@/hooks/use-recurring"
import { useCategories } from "@/hooks/use-categories"
import { useAccounts } from "@/hooks/use-accounts"
import { formatCurrency } from "@/lib/utils"
import type { RecurringTransaction } from "@/types"

const TYPE_CONFIG = {
  income: {
    label: "수입",
    icon: ArrowDownCircle,
    variant: "secondary" as const,
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

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
}

export function RecurringList() {
  const { data: items, isLoading } = useRecurringTransactions()
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()
  const createMutation = useCreateRecurring()
  const updateMutation = useUpdateRecurring()
  const deleteMutation = useDeleteRecurring()

  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<RecurringTransaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

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

  const handleCreate = useCallback(() => {
    setEditItem(null)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((item: RecurringTransaction) => {
    setEditItem(item)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (editItem) {
        await updateMutation.mutateAsync({ id: editItem.id, data: values })
      } else {
        await createMutation.mutateAsync(values)
      }
      setFormOpen(false)
      setEditItem(null)
    },
    [editItem, createMutation, updateMutation],
  )

  const handleToggleActive = useCallback(
    (item: RecurringTransaction) => {
      updateMutation.mutate({
        id: item.id,
        data: { isActive: !item.isActive },
      })
    },
    [updateMutation],
  )

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget, {
        onSuccess: () => setDeleteTarget(null),
      })
    }
  }, [deleteTarget, deleteMutation])

  const { active, inactive } = useMemo(() => {
    const active: RecurringTransaction[] = []
    const inactive: RecurringTransaction[] = []
    for (const item of items ?? []) {
      if (item.isActive) {
        active.push(item)
      } else {
        inactive.push(item)
      }
    }
    return { active, inactive }
  }, [items])

  function formatFrequency(item: RecurringTransaction): string {
    const label = FREQUENCY_LABELS[item.frequency] ?? item.frequency
    if (item.frequency === "yearly" && item.startDate) {
      const mon = parseInt(item.startDate.slice(5, 7), 10)
      const day = parseInt(item.startDate.slice(8, 10), 10)
      return `${label} ${mon}월 ${day}일`
    }
    if (item.frequency === "monthly" && item.startDate) {
      const day = parseInt(item.startDate.slice(8, 10), 10)
      return `${label} ${day}일`
    }
    return item.interval === 1 ? label : `${label} ${item.interval}회`
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">정기 거래</h2>
        <Button onClick={handleCreate} size="sm">
          <Plus className="size-4" data-icon="inline-start" />
          추가
        </Button>
      </div>

      {/* 활성 */}
      {active.length === 0 && inactive.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>등록된 정기 거래가 없습니다.</p>
          <p className="text-sm">반복되는 수입/지출을 등록해보세요.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                활성 ({active.length})
              </h3>
              {active.map((item) => (
                <RecurringCard
                  key={item.id}
                  item={item}
                  getCategoryName={getCategoryName}
                  getAccountName={getAccountName}
                  formatFrequency={formatFrequency}
                  onEdit={handleEdit}
                  onToggle={handleToggleActive}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}

          {inactive.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                비활성 ({inactive.length})
              </h3>
              {inactive.map((item) => (
                <RecurringCard
                  key={item.id}
                  item={item}
                  getCategoryName={getCategoryName}
                  getAccountName={getAccountName}
                  formatFrequency={formatFrequency}
                  onEdit={handleEdit}
                  onToggle={handleToggleActive}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </>
      )}

      <RecurringForm
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editItem}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="정기 거래 삭제"
        description="이 정기 거래를 삭제하시겠습니까? 이미 생성된 거래는 유지됩니다."
        onConfirm={handleConfirmDelete}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

interface RecurringCardProps {
  item: RecurringTransaction
  getCategoryName: (id: string | null) => string
  getAccountName: (id: string) => string
  formatFrequency: (item: RecurringTransaction) => string
  onEdit: (item: RecurringTransaction) => void
  onToggle: (item: RecurringTransaction) => void
  onDelete: (id: string) => void
}

function RecurringCard({
  item,
  getCategoryName,
  getAccountName,
  formatFrequency,
  onEdit,
  onToggle,
  onDelete,
}: RecurringCardProps) {
  const config = TYPE_CONFIG[item.type]
  const Icon = config.icon

  return (
    <Card className={!item.isActive ? "opacity-60" : undefined}>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={config.variant} className="gap-1 shrink-0">
              <Icon className="size-3" />
              {config.label}
            </Badge>
            <span className="font-medium truncate">{item.description}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
            <span>{formatFrequency(item)}</span>
            <span>{getCategoryName(item.categoryId)}</span>
            <span>{getAccountName(item.accountId)}</span>
            <span>다음: {item.nextDate}</span>
          </div>
        </div>
        <span className={`font-mono font-medium whitespace-nowrap ${config.className}`}>
          {item.type === "expense" ? "-" : ""}
          {formatCurrency(item.amount)}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onToggle(item)}
            aria-label={item.isActive ? "비활성화" : "활성화"}
          >
            {item.isActive ? (
              <Pause className="size-3.5 text-muted-foreground" />
            ) : (
              <Play className="size-3.5 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(item)}
            aria-label="수정"
          >
            <Pencil className="size-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(item.id)}
            aria-label="삭제"
          >
            <Trash2 className="size-3.5 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
