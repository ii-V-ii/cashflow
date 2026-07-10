import { z } from "zod"

import { dateString, krwAmount, paginationQuery } from "./common"

const tradeType = z.enum(["buy", "sell", "dividend"])

/**
 * POST /investment-trades (API.md §11.2).
 * quantity는 소수 허용(numeric(20,8)), 금액은 KRW 정수.
 */
export const createInvestmentTradeSchema = z.object({
  assetId: z.uuid(),
  tradeType,
  date: dateString,
  ticker: z
    .string()
    .max(20)
    .nullish()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  quantity: z.number().positive("수량은 0보다 커야 합니다").finite(),
  unitPrice: krwAmount.min(0),
  totalAmount: krwAmount.min(0),
  fee: krwAmount.min(0).default(0),
  tax: krwAmount.min(0).default(0),
  netAmount: krwAmount.min(0),
  memo: z.string().max(500).nullish(),
  accountId: z.uuid().nullish(),
})

/**
 * PATCH /investment-trades/{id} — 메모만 수정 가능 (API.md §11.4).
 * FIFO 영향 필드는 라우트에서 422 IMMUTABLE_TRADE_FIELD로 거부한다.
 */
export const updateTradeMemoSchema = z.object({
  memo: z.string().max(500).nullable(),
})

/** FIFO 영향으로 수정 불가한 필드 목록 (API.md §11.4 — 삭제 후 재등록 안내) */
export const TRADE_IMMUTABLE_FIELDS = [
  "assetId",
  "tradeType",
  "date",
  "ticker",
  "quantity",
  "unitPrice",
  "totalAmount",
  "fee",
  "tax",
  "netAmount",
  "accountId",
] as const

/** GET /investment-trades 쿼리 (API.md §11.1) */
export const listTradesQuerySchema = paginationQuery.extend({
  assetId: z.uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
})

/** GET /investment-trades/summary·tickers 쿼리 (API.md §11.6-11.7) */
export const tradeRangeQuerySchema = z.object({
  assetId: z.uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
})

/** GET /investment-trades/annual 쿼리 (API.md §11.8) */
export const annualQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
})

export type CreateInvestmentTradeInput = z.infer<typeof createInvestmentTradeSchema>
export type UpdateTradeMemoInput = z.infer<typeof updateTradeMemoSchema>
export type ListTradesQuery = z.infer<typeof listTradesQuerySchema>
export type TradeRangeQuery = z.infer<typeof tradeRangeQuerySchema>
export type AnnualQuery = z.infer<typeof annualQuerySchema>
