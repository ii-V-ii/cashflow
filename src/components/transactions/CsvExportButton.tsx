"use client"

import { useState, useCallback } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

interface CsvExportButtonProps {
  variant?: "outline" | "ghost" | "default"
}

export function CsvExportButton({ variant = "outline" }: CsvExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams({ from, to })
      const res = await fetch(`/api/export/transactions?${params}`)

      if (!res.ok) {
        throw new Error("내보내기에 실패했습니다")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `거래내역_${from}_${to}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch {
      alert("CSV 내보내기에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setIsExporting(false)
    }
  }, [from, to])

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Download className="size-4" data-icon="inline-start" />
        내보내기
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>CSV 내보내기</DialogTitle>
            <DialogDescription>
              내보낼 기간을 선택하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                시작일
              </label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                종료일
              </label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
            <Button onClick={handleExport} disabled={isExporting}>
              <Download className="size-4" data-icon="inline-start" />
              {isExporting ? "내보내는 중..." : "다운로드"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
