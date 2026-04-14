"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  createAccountSchema,
  type CreateAccountInput,
  type CreateAccountFormInput,
} from "@/lib/validators/account";
import type { Account, AccountType, DepositType, TaxType } from "@/types";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "현금",
  bank: "입출금",
  card: "카드",
  savings: "저축",
  investment: "투자",
};

const DEPOSIT_TYPE_LABELS: Record<DepositType, string> = {
  lump_sum: "예금(거치식)",
  installment: "적금(적립식)",
};

const TAX_TYPE_LABELS: Record<TaxType, string> = {
  normal: "일반과세 (15.4%)",
  preferential: "세금우대 (9.5%)",
  tax_free: "비과세 (0%)",
  high: "종합과세 (27.5%)",
};

const nullableNumber = {
  setValueAs: (v: string | number | null | undefined) => {
    if (v === "" || v === undefined || v === null) return null;
    const num = Number(v);
    return isNaN(num) ? null : num;
  },
};

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  onSubmit: (data: CreateAccountInput) => void;
  isPending: boolean;
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  onSubmit,
  isPending,
}: AccountFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateAccountFormInput, unknown, CreateAccountInput>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      name: "",
      type: "bank",
      balance: 0,
      color: null,
      icon: null,
      depositType: null,
      termMonths: null,
      interestRate: null,
      taxType: null,
      openDate: null,
      monthlyPayment: null,
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        account
          ? {
              name: account.name,
              type: account.type,
              balance: account.currentBalance,
              color: account.color,
              icon: account.icon,
              depositType: account.depositType,
              termMonths: account.termMonths,
              interestRate: account.interestRate,
              taxType: account.taxType,
              openDate: account.openDate,
              monthlyPayment: account.monthlyPayment,
            }
          : {
              name: "",
              type: "bank",
              balance: 0,
              color: null,
              icon: null,
              depositType: null,
              termMonths: null,
              interestRate: null,
              taxType: null,
              openDate: null,
              monthlyPayment: null,
            }
      );
    }
  }, [open, account, reset]);

  const watchedType = watch("type");
  const watchedDepositType = watch("depositType");
  const isSavings = watchedType === "savings";

  useEffect(() => {
    if (isSavings) {
      if (!watchedDepositType) {
        setValue("depositType", "lump_sum");
        setValue("taxType", "normal");
      }
    } else {
      setValue("depositType", null);
      setValue("termMonths", null);
      setValue("interestRate", null);
      setValue("taxType", null);
      setValue("openDate", null);
      setValue("monthlyPayment", null);
    }
  }, [isSavings, watchedDepositType, setValue]);

  useEffect(() => {
    if (watchedDepositType === "lump_sum") {
      setValue("monthlyPayment", null);
    }
  }, [watchedDepositType, setValue]);

  const isEditing = account !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "계좌 수정" : "계좌 추가"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="account-name" className="text-sm font-medium">
              이름
            </label>
            <Input
              id="account-name"
              placeholder="계좌 이름"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">유형</label>
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="계좌 유형 선택">
                      {(value: AccountType) =>
                        ACCOUNT_TYPE_LABELS[value] ?? "계좌 유형 선택"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(ACCOUNT_TYPE_LABELS) as [
                        AccountType,
                        string,
                      ][]
                    ).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {isSavings && (
            <>
              {/* 예금/적금 선택 */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">예적금 유형</label>
                <Controller
                  name="depositType"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        Object.entries(DEPOSIT_TYPE_LABELS) as [
                          DepositType,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          variant={field.value === value ? "default" : "outline"}
                          size="sm"
                          onClick={() => field.onChange(value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  )}
                />
              </div>

              {/* 개설일 */}
              <div className="flex flex-col gap-2">
                <label htmlFor="open-date" className="text-sm font-medium">
                  개설일
                </label>
                <Input
                  id="open-date"
                  type="date"
                  {...register("openDate")}
                />
              </div>

              {/* 기간 */}
              <div className="flex flex-col gap-2">
                <label htmlFor="term-months" className="text-sm font-medium">
                  기간 (개월)
                </label>
                <Input
                  id="term-months"
                  type="number"
                  min={1}
                  placeholder="12"
                  {...register("termMonths", nullableNumber)}
                />
              </div>

              {/* 연이자율 */}
              <div className="flex flex-col gap-2">
                <label htmlFor="interest-rate" className="text-sm font-medium">
                  연이자율 (%)
                </label>
                <Input
                  id="interest-rate"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="3.5"
                  {...register("interestRate", nullableNumber)}
                />
              </div>

              {/* 과세유형 */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">과세유형</label>
                <Controller
                  name="taxType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "normal"}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: TaxType) =>
                            TAX_TYPE_LABELS[value] ?? "과세유형 선택"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(TAX_TYPE_LABELS) as [
                            TaxType,
                            string,
                          ][]
                        ).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* 월납입액 (적금만) */}
              {watchedDepositType === "installment" && (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="monthly-payment"
                    className="text-sm font-medium"
                  >
                    월납입액 (원)
                  </label>
                  <Input
                    id="monthly-payment"
                    type="number"
                    min={0}
                    placeholder="300000"
                    {...register("monthlyPayment", nullableNumber)}
                  />
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="account-balance" className="text-sm font-medium">
              {isSavings && watchedDepositType === "lump_sum"
                ? "예금 원금 (원)"
                : "초기 잔액 (원)"}
            </label>
            <Input
              id="account-balance"
              type="number"
              placeholder="0"
              {...register("balance", { valueAsNumber: true })}
              aria-invalid={!!errors.balance}
            />
            {errors.balance && (
              <p className="text-xs text-destructive">
                {errors.balance.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="account-color" className="text-sm font-medium">
              색상 (선택)
            </label>
            <Input
              id="account-color"
              placeholder="예: #3B82F6"
              {...register("color")}
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
  );
}

export { ACCOUNT_TYPE_LABELS };
