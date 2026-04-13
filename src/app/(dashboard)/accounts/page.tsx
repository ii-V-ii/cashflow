"use client";

import { useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccountFormDialog,
  ACCOUNT_TYPE_LABELS,
} from "@/components/accounts/AccountFormDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
} from "@/hooks/use-accounts";
import { formatKRW } from "@/lib/format";
import type { Account, AccountType } from "@/types";
import type { CreateAccountInput } from "@/lib/validators/account";

const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "bank",
  "savings",
  "card",
  "cash",
  "investment",
];

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts();
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();
  const deleteMutation = useDeleteAccount();

  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const grouped = useMemo(() => {
    if (!accounts) return new Map<AccountType, Account[]>();
    const map = new Map<AccountType, Account[]>();
    for (const account of accounts) {
      const list = map.get(account.type) ?? [];
      list.push(account);
      map.set(account.type, list);
    }
    return map;
  }, [accounts]);

  const totalBalance = useMemo(
    () => (accounts ?? []).reduce((sum, a) => sum + a.currentBalance, 0),
    [accounts]
  );

  const handleAdd = useCallback(() => {
    setEditingAccount(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((account: Account) => {
    setEditingAccount(account);
    setFormOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    (data: CreateAccountInput) => {
      if (editingAccount) {
        updateMutation.mutate(
          { id: editingAccount.id, data },
          { onSuccess: () => setFormOpen(false) }
        );
      } else {
        createMutation.mutate(data, {
          onSuccess: () => setFormOpen(false),
        });
      }
    },
    [editingAccount, createMutation, updateMutation]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }, [deleteTarget, deleteMutation]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">계좌</h1>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="size-4" data-icon="inline-start" />
          추가
        </Button>
      </div>

      {/* 총 잔액 요약 */}
      <Card>
        <CardHeader>
          <CardTitle>총 잔액</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-40" />
          ) : (
            <p className="text-2xl font-bold">{formatKRW(totalBalance)}</p>
          )}
        </CardContent>
      </Card>

      {/* 유형별 계좌 목록 */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : accounts?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>계좌가 없습니다.</p>
          <Button variant="link" onClick={handleAdd} className="mt-2">
            첫 계좌를 추가하세요
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {ACCOUNT_TYPE_ORDER.map((type) => {
            const list = grouped.get(type);
            if (!list || list.length === 0) return null;

            return (
              <section key={type}>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[type]}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((account) => (
                    <Card key={account.id} size="sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          {account.color && (
                            <span
                              className="size-3 rounded-full shrink-0 ring-1 ring-border"
                              style={{ backgroundColor: account.color }}
                            />
                          )}
                          <span className="truncate">{account.name}</span>
                          <Badge variant="outline" className="ml-auto shrink-0">
                            {ACCOUNT_TYPE_LABELS[account.type]}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex items-end justify-between">
                        <p
                          className={
                            account.currentBalance >= 0
                              ? "text-lg font-semibold"
                              : "text-lg font-semibold text-destructive"
                          }
                        >
                          {formatKRW(account.currentBalance)}
                        </p>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(account)}
                            aria-label={`${account.name} 수정`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteTarget(account)}
                            aria-label={`${account.name} 삭제`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editingAccount}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="계좌 삭제"
        description={`"${deleteTarget?.name}" 계좌를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
