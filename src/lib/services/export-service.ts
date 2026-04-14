import { findAllTransactions } from '@/db/repositories'
import type { TransactionFilter } from '@/types'

/**
 * 거래 데이터를 CSV 문자열로 변환 (페이지네이션 분할)
 */
export async function exportTransactionsCsv(
  from?: string,
  to?: string,
): Promise<string> {
  const filter: TransactionFilter | undefined =
    from || to
      ? {
          dateRange: {
            from: from ?? '1970-01-01',
            to: to ?? '9999-12-31',
          },
        }
      : undefined

  const PAGE_SIZE = 5000
  const header = '날짜,유형,설명,금액,카테고리ID,계좌ID,도착계좌ID,메모'
  const csvParts: string[] = [header]
  let page = 1

  while (true) {
    const { data, total } = await findAllTransactions(filter, { page, limit: PAGE_SIZE })

    for (const t of data) {
      const type = t.type === 'income' ? '수입' : t.type === 'expense' ? '지출' : '이체'
      csvParts.push([
        t.date,
        type,
        escapeCsvField(t.description),
        t.amount,
        t.categoryId ?? '',
        t.accountId,
        t.toAccountId ?? '',
        escapeCsvField(t.memo ?? ''),
      ].join(','))
    }

    if (data.length < PAGE_SIZE || csvParts.length - 1 >= total) break
    page++
  }

  return csvParts.join('\n')
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
