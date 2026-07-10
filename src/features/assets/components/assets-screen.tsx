"use client"

import { FolderCogIcon, PlusIcon } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  useAssetCategories,
  useAssetCategoryMutations,
  useAssetMutations,
  useAssets,
  usePortfolio,
} from "@/features/assets/hooks/use-assets"
import { formatKrw, formatSignedKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"
import type { AssetCategoryDto, AssetDto } from "@/types/api"

// Recharts는 무겁다 — 화면 진입 후 lazy 로드 (performance.md 번들 예산)
const PortfolioDonut = dynamic(() => import("./portfolio-donut"), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-xl bg-surface-sunken" />,
})

type KindTab = "all" | "financial" | "non_financial"

const KIND_TABS: { value: KindTab; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "financial", label: "금융" },
  { value: "non_financial", label: "비금융" },
]

interface AssetFormState {
  name: string
  assetCategoryId: string
  acquisitionDate: string
  acquisitionCost: string
  initialValue: string
  institution: string
}

const EMPTY_FORM: AssetFormState = {
  name: "",
  assetCategoryId: "",
  acquisitionDate: new Date().toISOString().slice(0, 10),
  acquisitionCost: "0",
  initialValue: "",
  institution: "",
}

function parseAmount(value: string): number {
  return Number(value.replace(/[^\d]/g, "") || "0")
}

/** 자산 목록 — 탭 필터·포트폴리오 도넛·카테고리 관리 (PRD §3.7) */
export function AssetsScreen() {
  const [kindTab, setKindTab] = useState<KindTab>("all")
  const filter = kindTab === "all" ? undefined : { kind: kindTab }
  const { data: assets = [], isPending } = useAssets(filter)
  const { data: portfolio } = usePortfolio()
  const { data: categories = [] } = useAssetCategories()
  const { create, update, remove } = useAssetMutations()
  const showToast = useToastStore((state) => state.show)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AssetFormState>(EMPTY_FORM)
  const [deleting, setDeleting] = useState<AssetDto | null>(null)
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)

  const totalValue = assets.reduce((sum, asset) => sum + asset.currentValue, 0)

  function openCreate() {
    if (categories.length === 0) {
      showToast("먼저 자산 카테고리를 만들어주세요", "error")
      setCategoryManagerOpen(true)
      return
    }
    setEditingId(null)
    setForm({ ...EMPTY_FORM, assetCategoryId: categories[0].id })
    setEditorOpen(true)
  }

  function openEdit(asset: AssetDto) {
    setEditingId(asset.id)
    setForm({
      name: asset.name,
      assetCategoryId: asset.assetCategoryId,
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: String(asset.acquisitionCost),
      initialValue: "",
      institution: asset.institution ?? "",
    })
    setEditorOpen(true)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const common = {
      name: form.name,
      assetCategoryId: form.assetCategoryId,
      acquisitionDate: form.acquisitionDate,
      acquisitionCost: parseAmount(form.acquisitionCost),
      institution: form.institution || null,
    }
    if (editingId) {
      update.mutate(
        { id: editingId, input: common },
        { onSuccess: () => showToast("자산이 수정되었습니다") },
      )
    } else {
      create.mutate(
        {
          ...common,
          isActive: true,
          initialValue: form.initialValue ? parseAmount(form.initialValue) : undefined,
        },
        { onSuccess: () => showToast("자산이 추가되었습니다") },
      )
    }
    setEditorOpen(false)
  }

  function handleDelete() {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => showToast("자산이 삭제되었습니다"),
    })
    setDeleting(null)
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-6">
      <header className="flex items-end justify-between px-1">
        <div>
          <h1 className="text-xs text-ink-muted">총 자산</h1>
          <p
            className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink"
            data-testid="total-asset-value"
          >
            {formatKrw(totalValue)}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            onClick={() => setCategoryManagerOpen(true)}
            aria-label="자산 카테고리 관리"
            className="h-11 px-3"
          >
            <FolderCogIcon className="size-4" />
          </Button>
          <Button
            onClick={openCreate}
            data-testid="add-asset"
            className="h-11 bg-ink px-4 text-surface-raised hover:bg-ink/90"
          >
            <PlusIcon className="size-4" /> 자산 추가
          </Button>
        </div>
      </header>

      {portfolio && portfolio.total > 0 && (
        <section
          aria-label="포트폴리오 구성"
          className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline"
        >
          <PortfolioDonut portfolio={portfolio} />
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1">
            {portfolio.byCategory.map((entry) => (
              <li key={entry.assetCategoryId} className="text-xs text-ink-muted">
                <span className="font-medium text-ink">{entry.name}</span> {entry.ratio}%
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        role="tablist"
        aria-label="자산 유형 필터"
        className="flex gap-1 rounded-xl bg-surface-sunken p-1"
      >
        {KIND_TABS.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={kindTab === value}
            onClick={() => setKindTab(value)}
            className={cn(
              "h-9 flex-1 rounded-lg text-sm font-medium transition-colors",
              kindTab === value
                ? "bg-surface-raised text-ink shadow-sm"
                : "text-ink-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-ink-muted">자산이 없습니다</p>
          <p className="text-xs text-ink-muted">
            계좌 연결 자산은 잔액이 자동 반영됩니다
          </p>
          <Button onClick={openCreate} className="h-11 bg-ink text-surface-raised">
            자산 만들기
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-xl bg-surface-raised ring-1 ring-hairline">
          {assets.map((asset) => (
            <li key={asset.id} data-testid="asset-row">
              <Link
                href={`/assets/${asset.id}`}
                className="flex items-center justify-between gap-2 px-3 py-[var(--space-row)]"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink">
                      {asset.name}
                    </span>
                    <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">
                      {asset.assetCategory.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      asset.gain > 0
                        ? "text-gain"
                        : asset.gain < 0
                          ? "text-loss"
                          : "text-ink-muted",
                    )}
                  >
                    {formatSignedKrw(asset.gain)} ({asset.gainRate}%)
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="amount text-[length:var(--text-amount-md)] font-semibold text-ink">
                    {formatKrw(asset.currentValue)}
                  </span>
                  <button
                    type="button"
                    aria-label={`${asset.name} 수정`}
                    onClick={(event) => {
                      event.preventDefault()
                      openEdit(asset)
                    }}
                    className="rounded-lg px-2 py-2 text-xs text-ink-muted hover:bg-surface-sunken"
                  >
                    수정
                  </button>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingId ? "자산 수정" : "자산 추가"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            이름
            <Input
              required
              value={form.name}
              data-testid="asset-name-input"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            카테고리
            <select
              required
              value={form.assetCategoryId}
              onChange={(event) =>
                setForm({ ...form, assetCategoryId: event.target.value })
              }
              className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
              취득일
              <Input
                type="date"
                required
                value={form.acquisitionDate}
                onChange={(event) =>
                  setForm({ ...form, acquisitionDate: event.target.value })
                }
                className="h-11"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
              취득원가
              <Input
                inputMode="numeric"
                value={form.acquisitionCost}
                onChange={(event) =>
                  setForm({
                    ...form,
                    acquisitionCost: event.target.value.replace(/[^\d]/g, ""),
                  })
                }
                className="amount h-11 text-right"
              />
            </label>
          </div>
          {!editingId && (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
              현재 평가액 (선택 — 최초 평가 이력으로 기록)
              <Input
                inputMode="numeric"
                value={form.initialValue}
                placeholder="미입력 시 취득원가"
                onChange={(event) =>
                  setForm({
                    ...form,
                    initialValue: event.target.value.replace(/[^\d]/g, ""),
                  })
                }
                className="amount h-11 text-right"
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            기관 (선택)
            <Input
              value={form.institution}
              onChange={(event) => setForm({ ...form, institution: event.target.value })}
              className="h-11"
            />
          </label>
          <div className="flex gap-2">
            {editingId && (
              <Button
                type="button"
                variant="destructive"
                className="h-12 flex-1"
                onClick={() => {
                  const asset = assets.find((item) => item.id === editingId)
                  if (asset) setDeleting(asset)
                  setEditorOpen(false)
                }}
              >
                삭제
              </Button>
            )}
            <Button
              type="submit"
              data-testid="save-asset"
              className="h-12 flex-[2] bg-ink text-surface-raised hover:bg-ink/90"
              disabled={create.isPending || update.isPending}
            >
              저장
            </Button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="자산을 삭제할까요?"
        description={
          deleting
            ? `'${deleting.name}' 자산과 평가 이력·매매 기록이 함께 삭제됩니다.`
            : ""
        }
        onConfirm={handleDelete}
        isPending={remove.isPending}
      />

      <CategoryManagerSheet
        open={categoryManagerOpen}
        onOpenChange={setCategoryManagerOpen}
        categories={categories}
      />
    </main>
  )
}

/** 자산 카테고리 관리 시트 — 인라인 추가·이름 수정·삭제 (PRD §3.7) */
function CategoryManagerSheet({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: AssetCategoryDto[]
}) {
  const { create, update, remove } = useAssetCategoryMutations()
  const showToast = useToastStore((state) => state.show)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"financial" | "non_financial">("financial")
  const [deleting, setDeleting] = useState<AssetCategoryDto | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  function commitRename(category: AssetCategoryDto) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== category.name) {
      update.mutate({ id: category.id, input: { name: trimmed } })
    }
    setRenamingId(null)
  }

  function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    create.mutate(
      { name: name.trim(), kind, sortOrder: categories.length },
      {
        onSuccess: () => {
          showToast("카테고리가 추가되었습니다")
          setName("")
        },
      },
    )
  }

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title="자산 카테고리 관리">
        <div className="flex flex-col gap-4">
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={name}
              placeholder="새 카테고리 이름"
              data-testid="asset-category-name-input"
              onChange={(event) => setName(event.target.value)}
              className="h-11 flex-1"
            />
            <select
              value={kind}
              aria-label="카테고리 종류"
              onChange={(event) =>
                setKind(event.target.value as "financial" | "non_financial")
              }
              className="h-11 rounded-lg border border-hairline bg-surface-raised px-2 text-sm text-ink"
            >
              <option value="financial">금융</option>
              <option value="non_financial">비금융</option>
            </select>
            <Button
              type="submit"
              disabled={create.isPending}
              className="h-11 bg-ink px-3 text-surface-raised"
            >
              추가
            </Button>
          </form>

          {categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              카테고리가 없습니다. 먼저 추가해주세요.
            </p>
          ) : (
            <ul className="divide-y divide-hairline rounded-xl ring-1 ring-hairline">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center gap-2 px-3 py-2">
                  {renamingId === category.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      aria-label={`${category.name} 이름 변경`}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => commitRename(category)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          commitRename(category)
                        }
                        if (event.key === "Escape") setRenamingId(null)
                      }}
                      className="h-9 flex-1"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-ink">{category.name}</span>
                  )}
                  <span className="text-[11px] text-ink-muted">
                    {category.kind === "financial" ? "금융" : "비금융"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(category.id)
                      setRenameValue(category.name)
                    }}
                    className="rounded-lg px-2 py-2 text-xs text-ink-muted hover:bg-surface-sunken"
                  >
                    이름 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(category)}
                    className="rounded-lg px-2 py-2 text-xs text-loss hover:bg-surface-sunken"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(isOpen) => !isOpen && setDeleting(null)}
        title="카테고리를 삭제할까요?"
        description={
          deleting
            ? `'${deleting.name}' 카테고리를 삭제합니다. 자산이 참조 중이면 삭제할 수 없습니다.`
            : ""
        }
        onConfirm={() => {
          if (deleting) {
            remove.mutate(deleting.id, {
              onSuccess: () => showToast("카테고리가 삭제되었습니다"),
            })
          }
          setDeleting(null)
        }}
        isPending={remove.isPending}
      />
    </>
  )
}
