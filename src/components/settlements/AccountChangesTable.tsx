"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import type { AccountChange } from "@/types"

interface AccountChangesTableProps {
  data: readonly AccountChange[]
}

export function AccountChangesTable({ data }: AccountChangesTableProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">계좌별 변동</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">계좌 데이터가 없습니다.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">계좌별 변동</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>계좌</TableHead>
              <TableHead className="text-right">기초잔액</TableHead>
              <TableHead className="text-right text-emerald-600">수입</TableHead>
              <TableHead className="text-right text-rose-600">지출</TableHead>
              <TableHead className="text-right">기말잔액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((account) => (
              <TableRow key={account.accountId}>
                <TableCell className="font-medium text-sm">
                  {account.accountName}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(account.openingBalance)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-emerald-600">
                  +{formatCurrency(account.income)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-rose-600">
                  -{formatCurrency(account.expense)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-medium">
                  {formatCurrency(account.closingBalance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
