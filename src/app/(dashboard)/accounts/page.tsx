"use client";

import { useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, BarChart3, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useAssets } from "@/hooks/use-assets";
import { formatKRW } from "@/lib/format";
import {
  calculateLumpSumDeposit,
  calculateInstallmentSavings,
  calculateMaturityDate,
  calculateDaysUntilMaturity,
} from "@/lib/calculations/deposit-calculator";
import type { Account, AccountType, Asset, TaxType } from "@/types";
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
  const { data: assets } = useAssets();
  const createMutation = useCreateAccount();

  const assetsByAccount = useMemo(() => {
    if (!assets || !accounts) return new Map<string, Asset[]>();
    const assetMap = new Map(assets.map(a => [a.id, a]));
    const map = new Map<string, Asset[]>();
    for (const account of accounts) {
      if (!account.assetId) continue;
      const asset = assetMap.get(account.assetId);
      if (!asset) continue;
      const list = map.get(account.id) ?? [];
      list.push(asset);
      map.set(account.id, list);
    }
    return map;
  }, [assets, accounts]);
  const updateMutation = useUpdateAccount();
  const deleteMutation = useDeleteAccount();

  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [linkAccountId, setLinkAccountId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState("");

  // 미연결 자산 (어떤 계좌에서도 참조하지 않는 자산)
  const unlinkedAssets = useMemo(() => {
    const linkedIds = new Set((accounts ?? []).filter(a => a.assetId).map(a => a.assetId!));
    return (assets ?? []).filter((a) => !linkedIds.has(a.id));
  }, [assets, accounts]);

  const handleLinkAsset = useCallback(() => {
    if (!linkAccountId || !selectedAssetId) return;
    updateMutation.mutate(
      { id: linkAccountId, data: { assetId: selectedAssetId } },
      {
        onSuccess: () => {
          setLinkAccountId(null);
          setSelectedAssetId("");
        },
      },
    );
  }, [linkAccountId, selectedAssetId, updateMutation]);

  const handleUnlinkAsset = useCallback(
    (accountId: string) => {
      updateMutation.mutate({ id: accountId, data: { assetId: null } });
    },
    [updateMutation],
  );

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
                      <CardContent className="space-y-2">
                        <div className="flex items-end justify-between">
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
                        </div>
                        {account.depositType &&
                          account.openDate &&
                          account.termMonths &&
                          account.interestRate !== null &&
                          account.interestRate !== undefined &&
                          account.taxType && (
                            <DepositMaturityInfo account={account} />
                          )}
                        {assetsByAccount.get(account.id)?.map((asset) => (
                          <div
                            key={asset.id}
                            className="flex items-center gap-1 text-xs text-muted-foreground"
                          >
                            <BarChart3 className="size-3" />
                            <span className="flex-1">{asset.name}</span>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-5"
                              onClick={() => handleUnlinkAsset(account.id)}
                              aria-label={`${asset.name} 연결 해제`}
                            >
                              <Unlink className="size-3 text-muted-foreground" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => { setLinkAccountId(account.id); setSelectedAssetId(""); }}
                        >
                          <Link2 className="size-3 mr-1" />
                          자산 연결
                        </Button>
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
      {/* 자산 연결 다이얼로그 */}
      <Dialog
        open={linkAccountId !== null}
        onOpenChange={(open) => { if (!open) setLinkAccountId(null); }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>자산 연결</DialogTitle>
          </DialogHeader>
          {unlinkedAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              연결 가능한 자산이 없습니다. 먼저 자산을 추가하세요.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">연결할 자산</label>
              <select
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
              >
                <option value="">선택하세요</option>
                {unlinkedAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLinkAccountId(null)}
            >
              취소
            </Button>
            <Button
              onClick={handleLinkAsset}
              disabled={!selectedAssetId || updateMutation.isPending}
            >
              {updateMutation.isPending ? "연결 중..." : "연결"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DepositMaturityInfo({
  account,
}: {
  account: Account;
}) {
  const {
    depositType,
    openDate,
    termMonths,
    interestRate,
    taxType,
    monthlyPayment,
    currentBalance,
  } = account;

  if (!depositType || !openDate || !termMonths || interestRate === null || interestRate === undefined || !taxType) {
    return null;
  }

  const maturityDate = calculateMaturityDate(openDate, termMonths);
  const daysLeft = calculateDaysUntilMaturity(maturityDate);
  const isMatured = daysLeft <= 0;

  const result =
    depositType === "lump_sum"
      ? calculateLumpSumDeposit(currentBalance, interestRate, termMonths, taxType as TaxType)
      : monthlyPayment
        ? calculateInstallmentSavings(monthlyPayment, interestRate, termMonths, taxType as TaxType)
        : null;

  if (!result) return null;

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">만기일</span>
        <span className="font-medium">
          {maturityDate}{" "}
          {isMatured ? (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
              만기됨
            </Badge>
          ) : (
            <span className="text-muted-foreground">(D-{daysLeft})</span>
          )}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">예상 세전이자</span>
        <span>{formatKRW(result.interest)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">예상 세후이자</span>
        <span className="font-medium text-green-600 dark:text-green-400">
          {formatKRW(result.afterTaxInterest)}
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-1.5">
        <span className="text-muted-foreground">만기 수령액</span>
        <span className="font-semibold">{formatKRW(result.totalAtMaturity)}</span>
      </div>
    </div>
  );
}
