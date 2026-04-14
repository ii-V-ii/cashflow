import type { TaxType } from '@/types'

const TAX_RATES: Record<TaxType, number> = {
  normal: 0.154,
  preferential: 0.095,
  tax_free: 0,
  high: 0.275,
}

export interface LumpSumDepositResult {
  readonly interest: number
  readonly tax: number
  readonly afterTaxInterest: number
  readonly totalAtMaturity: number
}

/**
 * 예금 (거치식) 이자 계산
 * 이자 = 원금 × (연이율/100) × (개월/12)
 */
export function calculateLumpSumDeposit(
  principal: number,
  annualRate: number,
  termMonths: number,
  taxType: TaxType,
): LumpSumDepositResult {
  const interest = Math.round(principal * (annualRate / 100) * (termMonths / 12))
  const tax = Math.round(interest * TAX_RATES[taxType])
  const afterTaxInterest = interest - tax
  return {
    interest,
    tax,
    afterTaxInterest,
    totalAtMaturity: principal + afterTaxInterest,
  }
}

export interface InstallmentSavingsResult {
  readonly totalPaid: number
  readonly interest: number
  readonly tax: number
  readonly afterTaxInterest: number
  readonly totalAtMaturity: number
}

/**
 * 적금 (적립식, 단리) 이자 계산
 * 이자 = 월납입액 × (월이율) × (n(n+1)/2)
 */
export function calculateInstallmentSavings(
  monthlyPayment: number,
  annualRate: number,
  termMonths: number,
  taxType: TaxType,
): InstallmentSavingsResult {
  const monthlyRate = annualRate / 100 / 12
  const interest = Math.round(monthlyPayment * monthlyRate * (termMonths * (termMonths + 1)) / 2)
  const tax = Math.round(interest * TAX_RATES[taxType])
  const afterTaxInterest = interest - tax
  const totalPaid = monthlyPayment * termMonths
  return {
    totalPaid,
    interest,
    tax,
    afterTaxInterest,
    totalAtMaturity: totalPaid + afterTaxInterest,
  }
}

/**
 * 만기일 계산: 개시일 + termMonths개월
 */
export function calculateMaturityDate(openDate: string, termMonths: number): string {
  const d = new Date(openDate)
  d.setMonth(d.getMonth() + termMonths)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * D-day 계산: 만기일까지 남은 일수
 */
export function calculateDaysUntilMaturity(maturityDate: string): number {
  const maturity = new Date(maturityDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  maturity.setHours(0, 0, 0, 0)
  const diffMs = maturity.getTime() - today.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}
