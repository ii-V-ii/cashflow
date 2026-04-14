"use client"

import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select"
import {
  createAssetSchema,
  type CreateAssetInput,
  type CreateAssetFormInput,
} from "@/lib/validators/asset"
import { useAssetCategories } from "@/hooks/use-asset-categories"
import type { Asset } from "@/types"

interface AssetFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset | null
  onSubmit: (data: CreateAssetInput) => void
  isPending: boolean
}

export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
  onSubmit,
  isPending,
}: AssetFormDialogProps) {
  const { data: assetCategoriesData } = useAssetCategories()
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateAssetFormInput, unknown, CreateAssetInput>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: {
      name: "",
      assetCategoryId: "",
      acquisitionDate: new Date().toISOString().slice(0, 10),
      acquisitionCost: 0,
      currentValue: 0,
      institution: null,
      memo: null,
      isActive: true,
      metadata: null,
    },
  })

  useEffect(() => {
    if (open) {
      reset(
        asset
          ? {
              name: asset.name,
              assetCategoryId: asset.assetCategoryId,
              acquisitionDate: asset.acquisitionDate,
              acquisitionCost: asset.acquisitionCost,
              currentValue: asset.currentValue,
              institution: asset.institution,
              memo: asset.memo,
              isActive: asset.isActive,
              metadata: asset.metadata,
            }
          : {
              name: "",
              assetCategoryId: "",
              acquisitionDate: new Date().toISOString().slice(0, 10),
              acquisitionCost: 0,
              currentValue: 0,
              institution: null,
              memo: null,
              isActive: true,
              metadata: null,
            },
      )
    }
  }, [open, asset, reset])

  const isEditing = asset !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "자산 수정" : "자산 추가"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="asset-name" className="text-sm font-medium">
              자산명
            </label>
            <Input
              id="asset-name"
              placeholder="자산 이름"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">자산 카테고리</label>
            <Controller
              name="assetCategoryId"
              control={control}
              render={({ field }) => {
                const financialCategories = (assetCategoriesData ?? []).filter(
                  (c) => c.kind === "financial",
                )
                const nonFinancialCategories = (assetCategoriesData ?? []).filter(
                  (c) => c.kind === "non_financial",
                )
                return (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="선택하세요">
                        {(value: string) => {
                          const ac = (assetCategoriesData ?? []).find(
                            (c) => c.id === value,
                          )
                          if (!ac) return "선택하세요"
                          return ac.icon ? `${ac.icon} ${ac.name}` : ac.name
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {financialCategories.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>금융자산</SelectLabel>
                          {financialCategories.map((ac) => (
                            <SelectItem key={ac.id} value={ac.id}>
                              {ac.icon ? `${ac.icon} ${ac.name}` : ac.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {nonFinancialCategories.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>비금융자산</SelectLabel>
                          {nonFinancialCategories.map((ac) => (
                            <SelectItem key={ac.id} value={ac.id}>
                              {ac.icon ? `${ac.icon} ${ac.name}` : ac.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                )
              }}
            />
            {errors.assetCategoryId && (
              <p className="text-xs text-destructive">
                {errors.assetCategoryId.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="asset-acq-date" className="text-sm font-medium">
              취득일
            </label>
            <Input
              id="asset-acq-date"
              type="date"
              {...register("acquisitionDate")}
              aria-invalid={!!errors.acquisitionDate}
            />
            {errors.acquisitionDate && (
              <p className="text-xs text-destructive">
                {errors.acquisitionDate.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="asset-acq-cost"
                className="text-sm font-medium"
              >
                취득원가 (원)
              </label>
              <Input
                id="asset-acq-cost"
                type="number"
                placeholder="0"
                {...register("acquisitionCost", { valueAsNumber: true })}
                aria-invalid={!!errors.acquisitionCost}
              />
              {errors.acquisitionCost && (
                <p className="text-xs text-destructive">
                  {errors.acquisitionCost.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="asset-current-value"
                className="text-sm font-medium"
              >
                현재가치 (원)
              </label>
              <Input
                id="asset-current-value"
                type="number"
                placeholder="0"
                {...register("currentValue", { valueAsNumber: true })}
                aria-invalid={!!errors.currentValue}
              />
              {errors.currentValue && (
                <p className="text-xs text-destructive">
                  {errors.currentValue.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="asset-institution" className="text-sm font-medium">
              기관 (선택)
            </label>
            <Input
              id="asset-institution"
              placeholder="예: 삼성증권"
              {...register("institution")}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="asset-memo" className="text-sm font-medium">
              메모 (선택)
            </label>
            <Input
              id="asset-memo"
              placeholder="메모"
              {...register("memo")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing
                  ? "수정 중..."
                  : "추가 중..."
                : isEditing
                  ? "수정"
                  : "추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
