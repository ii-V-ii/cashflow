"use client";

import { useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, BarChart3, Link2, Unlink, CreditCard } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useReorderAccounts,
} from "@/hooks/use-accounts";
import { useAssets } from "@/hooks/use-assets";
import { useCreateTransaction } from "@/hooks/use-transactions";
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
  const reorderMutation = useReorderAccounts();
  const createTransactionMutation = useCreateTransaction();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  // 연결 가능한 자산 (1자산:N계좌이므로 모든 자산 표시)
  const linkableAssets = useMemo(() => assets ?? [], [assets]);

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

  const handleDragEnd = useCallback(
    (type: AccountType, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const list = grouped.get(type);
      if (!list) return;
      const oldIndex = list.findIndex((a) => a.id === active.id);
      const newIndex = list.findIndex((a) => a.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(list, oldIndex, newIndex);
      const items = reordered.map((a, i) => ({ id: a.id, sortOrder: i }));
      reorderMutation.mutate(items);
    },
    [grouped, reorderMutation],
  );

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
        // 수정 모드: balance → initialBalance로 매핑
        const { balance, ...rest } = data;
        updateMutation.mutate(
          { id: editingAccount.id, data: { ...rest, initialBalance: balance } },
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

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 계좌 이름 조회
  const getAccountName = useCallback(
    (id: string) => (accounts ?? []).find((a) => a.id === id)?.name ?? "",
    [accounts]
  );

  const handleCardPayment = useCallback(
    (cardAccount: Account) => {
      if (!cardAccount.linkedAccountId) return;
      const unpaid = Math.abs(cardAccount.currentBalance);
      if (unpaid === 0) {
        alert("미결제금이 없습니다.");
        return;
      }
      const linkedName = getAccountName(cardAccount.linkedAccountId);
      if (
        !confirm(
          `${linkedName} → ${cardAccount.name}으로 ${formatKRW(unpaid)} 결제하시겠습니까?`
        )
      )
        return;

      createTransactionMutation.mutate({
        type: "transfer",
        amount: unpaid,
        description: `${cardAccount.name} 카드 결제`,
        accountId: cardAccount.linkedAccountId,
        toAccountId: cardAccount.id,
        date: new Date().toISOString().slice(0, 10),
        categoryId: null,
        memo: null,
        tags: [],
      });
    },
    [createTransactionMutation, getAccountName]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    setErrorMessage(null);
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (err) => {
        setErrorMessage(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
      },
    });
  }, [deleteTarget, deleteMutation]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">계좌/카드</h1>
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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(type, e)}
                >
                  <SortableContext items={list.map((a) => a.id)} strategy={rectSortingStrategy}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((account) => (
                    <SortableAccountCard key={account.id} id={account.id}>
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
                          {account.type === "card" ? (
                            <div>
                              <span className="text-xs text-muted-foreground">미결제금</span>
                              <p className="text-lg font-semibold">
                                {formatKRW(Math.abs(account.currentBalance))}
                              </p>
                            </div>
                          ) : (
                            <p
                              className={
                                account.currentBalance >= 0
                                  ? "text-lg font-semibold"
                                  : "text-lg font-semibold text-destructive"
                              }
                            >
                              {formatKRW(account.currentBalance)}
                            </p>
                          )}
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
                        {/* 카드 전용 정보 */}
                        {account.type === "card" && (
                          <CardAccountInfo
                            account={account}
                            getAccountName={getAccountName}
                            onPayment={handleCardPayment}
                            isPaymentPending={createTransactionMutation.isPending}
                          />
                        )}
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
                        {!account.assetId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-muted-foreground"
                            onClick={() => { setLinkAccountId(account.id); setSelectedAssetId(""); }}
                          >
                            <Link2 className="size-3 mr-1" />
                            자산 연결
                          </Button>
                        )}
                      </CardContent>
                    </SortableAccountCard>
                  ))}
                </div>
                  </SortableContext>
                </DndContext>
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
          if (!open) { setDeleteTarget(null); setErrorMessage(null); }
        }}
        title="계좌 삭제"
        description={
          errorMessage
            ? errorMessage
            : `"${deleteTarget?.name}" 계좌를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
        }
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
          {linkableAssets.length === 0 ? (
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
                {linkableAssets.map((asset) => (
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

function SortableAccountCard({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      size="sm"
      className="cursor-grab active:cursor-grabbing touch-none"
      {...attributes}
      {...listeners}
    >
      {children}
    </Card>
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

function CardAccountInfo({
  account,
  getAccountName,
  onPayment,
  isPaymentPending,
}: {
  account: Account;
  getAccountName: (id: string) => string;
  onPayment: (account: Account) => void;
  isPaymentPending: boolean;
}) {
  const unpaid = Math.abs(account.currentBalance);
  const usageRate =
    account.creditLimit && account.creditLimit > 0
      ? Math.min((unpaid / account.creditLimit) * 100, 100)
      : null;

  return (
    <div className="space-y-2">
      {/* 결제일 + 결제 계좌 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {account.billingDay && (
          <span>결제일: 매월 {account.billingDay}일</span>
        )}
        {account.linkedAccountId && (
          <span>결제계좌: {getAccountName(account.linkedAccountId)}</span>
        )}
      </div>

      {/* 한도 대비 사용률 프로그레스바 */}
      {usageRate !== null && account.creditLimit && (
        <Progress value={usageRate}>
          <ProgressLabel className="text-xs">
            사용률
          </ProgressLabel>
          <ProgressValue className="text-xs">
            {() =>
              `${formatKRW(unpaid)} / ${formatKRW(account.creditLimit!)} (${Math.round(usageRate)}%)`
            }
          </ProgressValue>
        </Progress>
      )}

      {/* 카드 결제 버튼 */}
      {account.linkedAccountId && unpaid > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => onPayment(account)}
          disabled={isPaymentPending}
        >
          <CreditCard className="size-3.5 mr-1" />
          {isPaymentPending ? "결제 중..." : `카드 결제 (${formatKRW(unpaid)})`}
        </Button>
      )}
    </div>
  );
}
