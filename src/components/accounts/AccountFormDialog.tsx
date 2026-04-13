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
import type { Account, AccountType } from "@/types";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "현금",
  bank: "입출금",
  card: "카드",
  savings: "저축",
  investment: "투자",
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
    formState: { errors },
  } = useForm<CreateAccountFormInput, unknown, CreateAccountInput>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      name: "",
      type: "bank",
      balance: 0,
      color: null,
      icon: null,
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
            }
          : {
              name: "",
              type: "bank",
              balance: 0,
              color: null,
              icon: null,
            }
      );
    }
  }, [open, account, reset]);

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

          <div className="flex flex-col gap-2">
            <label htmlFor="account-balance" className="text-sm font-medium">
              초기 잔액 (원)
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
